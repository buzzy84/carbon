import { getAppUrl } from "@carbon/auth";
import type { Database } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";
import { generateEmbedding } from "~/modules/shared/shared.service";
import { path } from "~/utils/path";
import type { ChatContext } from "../agents/shared/context";

export const getSupplierSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    itemIds: z.array(z.string()).optional(),
  })
  .refine((data) => data.id || data.name || data.description || data.itemIds, {
    message: "Either id, name, description, or itemIds must be provided",
  });

export const getSupplierTool = tool({
  description:
    "Search for suppliers by a specific name as specified by the user, a deduced description, or a list of part ids",
  inputSchema: getSupplierSchema,
  execute: async function (args, executionOptions) {
    const context = executionOptions.experimental_context as ChatContext;
    let { name, description, itemIds } = args;

    console.log("[getSupplierTool] Starting supplier search with args:", args);

    if (args.id) {
      console.log("[getSupplierTool] Searching by id:", args.id);
      const supplier = await context.client
        .from("supplier")
        .select("*")
        .eq("id", args.id)
        .eq("companyId", context.companyId)
        .single();

      console.log(
        "[getSupplierTool] Supplier by id query result:",
        supplier.data
      );

      if (supplier.data) {
        console.log(
          "[getSupplierTool] Found supplier by id, returning:",
          supplier.data.id
        );
        return {
          link: `${getAppUrl()}${path.to.supplier(supplier.data.id)}`,
          id: supplier.data.id,
          name: supplier.data.name,
        };
      }
    }

    if (itemIds && itemIds.length > 0) {
      console.log("[getSupplierTool] Searching suppliers for parts:", itemIds);
      return getSuppliersForParts(context.client, itemIds, context);
    }

    if (args.name) {
      console.log("[getSupplierTool] Searching by name:", args.name);
      const supplier = await context.client
        .from("supplier")
        .select("*")
        .eq("name", args.name)
        .eq("companyId", context.companyId)
        .single();

      console.log(
        "[getSupplierTool] Supplier by name query result:",
        supplier.data
      );

      if (supplier.data) {
        console.log(
          "[getSupplierTool] Found supplier by name, returning:",
          supplier.data.id
        );
        return {
          id: supplier.data.id,
        };
      }
      if (!description) {
        console.log(
          "[getSupplierTool] No description provided, using name as description"
        );
        description = name;
      }
    }

    if (description) {
      console.log("[getSupplierTool] Searching by description:", description);
      const embedding = await generateEmbedding(context.client, description);
      console.log("[getSupplierTool] Generated embedding for description");

      const search = await context.client.rpc("suppliers_search", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.8,
        match_count: 10,
        p_company_id: context.companyId,
      });

      console.log(
        "[getSupplierTool] Search results:",
        search.data?.length || 0,
        "suppliers found"
      );
      console.log("[getSupplierTool] Search results:", search.data);

      if (search.data && search.data.length > 0) {
        console.log("[getSupplierTool] Returning search results");
        return search.data;
      }
    }

    console.log("[getSupplierTool] No suppliers found, returning null");
    return null;
  },
});

export const getSupplierForPartsSchema = z.object({
  itemIds: z.array(z.string()),
});

export const getSupplierForPartsTool = tool({
  description: "Suggest a list of suppliers for a given list of parts",
  inputSchema: getSupplierForPartsSchema,
  execute: async function (args, executionOptions) {
    const context = executionOptions.experimental_context as ChatContext;
    console.log(
      "[getSupplierForPartsTool] Starting with itemIds:",
      args.itemIds
    );
    return await getSuppliersForParts(context.client, args.itemIds, context);
  },
});

async function getSuppliersForParts(
  client: SupabaseClient<Database>,
  itemIds: string[],
  context: { companyId: string }
) {
  console.log("[getSuppliersForParts] Starting with itemIds:", itemIds);

  // Find suppliers that provide these parts
  const [supplierParts, preferredSuppliers] = await Promise.all([
    client
      .from("supplierPart")
      .select("itemId, supplierId, unitPrice, supplierUnitOfMeasureCode")
      .in("itemId", itemIds)
      .eq("companyId", context.companyId),
    client
      .from("itemReplenishment")
      .select("itemId, preferredSupplierId")
      .in("itemId", itemIds)
      .eq("companyId", context.companyId),
  ]);

  console.log(
    "[getSuppliersForParts] Supplier parts found:",
    supplierParts.data?.length || 0
  );
  console.log(
    "[getSuppliersForParts] Preferred suppliers found:",
    preferredSuppliers.data?.length || 0
  );

  if (itemIds.length === 1) {
    console.log(
      "[getSuppliersForParts] Single part search, looking for preferred supplier"
    );
    const preferredSupplier = preferredSuppliers.data?.find(
      (p) => p.itemId === itemIds[0]
    );
    if (preferredSupplier && preferredSupplier.preferredSupplierId) {
      console.log(
        "[getSuppliersForParts] Found preferred supplier for single part:",
        preferredSupplier.preferredSupplierId
      );
      return {
        id: preferredSupplier.preferredSupplierId,
      };
    }

    console.log(
      "[getSuppliersForParts] No preferred supplier, looking for any supplier"
    );
    const firstSupplier = supplierParts.data?.find(
      (p) => p.itemId === itemIds[0]
    );
    if (firstSupplier) {
      console.log(
        "[getSuppliersForParts] Found supplier for single part:",
        firstSupplier.supplierId
      );
      return {
        link: `${getAppUrl()}${path.to.supplier(firstSupplier.supplierId)}`,
        id: firstSupplier.supplierId,
      };
    }
  }

  console.log(
    "[getSuppliersForParts] Multiple parts, counting preferred supplier occurrences"
  );
  // Count occurrences of each supplier in preferred suppliers
  const preferredSupplierCounts =
    preferredSuppliers.data?.reduce((counts, item) => {
      if (item.preferredSupplierId) {
        counts[item.preferredSupplierId] =
          (counts[item.preferredSupplierId] || 0) + 1;
      }
      return counts;
    }, {} as Record<string, number>) || {};

  console.log(
    "[getSuppliersForParts] Preferred supplier counts:",
    preferredSupplierCounts
  );

  // Find the most frequent preferred supplier
  let mostFrequentPreferredSupplierId: string | null = null;
  let maxPreferredCount = 0;

  for (const [supplierId, count] of Object.entries(preferredSupplierCounts)) {
    if (count > maxPreferredCount) {
      maxPreferredCount = count;
      mostFrequentPreferredSupplierId = supplierId;
    }
  }

  console.log(
    "[getSuppliersForParts] Most frequent preferred supplier:",
    mostFrequentPreferredSupplierId,
    "with count:",
    maxPreferredCount
  );

  // If we found a preferred supplier, return it
  if (mostFrequentPreferredSupplierId) {
    console.log(
      "[getSuppliersForParts] Returning most frequent preferred supplier"
    );

    return {
      link: `${getAppUrl()}${path.to.supplier(
        mostFrequentPreferredSupplierId
      )}`,
      id: mostFrequentPreferredSupplierId,
    };
  }

  console.log(
    "[getSuppliersForParts] No preferred supplier found, counting supplier part occurrences"
  );
  // If no preferred supplier, count occurrences in supplierParts
  const supplierPartCounts =
    supplierParts.data?.reduce((counts, item) => {
      if (item.supplierId) {
        counts[item.supplierId] = (counts[item.supplierId] || 0) + 1;
      }
      return counts;
    }, {} as Record<string, number>) || {};

  console.log(
    "[getSuppliersForParts] Supplier part counts:",
    supplierPartCounts
  );

  // Find the most frequent supplier from supplierParts
  let mostFrequentSupplierId: string | null = null;
  let maxCount = 0;

  for (const [supplierId, count] of Object.entries(supplierPartCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostFrequentSupplierId = supplierId;
    }
  }

  console.log(
    "[getSuppliersForParts] Most frequent supplier:",
    mostFrequentSupplierId,
    "with count:",
    maxCount
  );

  // Return the most frequent supplier if found
  if (mostFrequentSupplierId) {
    const supplier = supplierParts.data?.find(
      (p) => p.supplierId === mostFrequentSupplierId
    );
    console.log(
      "[getSuppliersForParts] Returning most frequent supplier with details"
    );
    return {
      link: `${getAppUrl()}${path.to.supplier(mostFrequentSupplierId)}`,
      id: mostFrequentSupplierId,
      unitPrice: supplier?.unitPrice,
      supplierUnitOfMeasureCode: supplier?.supplierUnitOfMeasureCode,
    };
  }

  // Return null if no supplier was found
  console.log("[getSuppliersForParts] No suppliers found, returning null");
  return null;
}
