import { tool } from "ai";
import { z } from "zod";
import { generateEmbedding } from "~/modules/shared/shared.service";
import type { ChatContext } from "../agents/shared/context";

export const getPartSchema = z
  .object({
    readableId: z.string().optional(),
    description: z.string().optional(),
  })
  .refine((data) => data.readableId || data.description, {
    message: "Either readableId or description must be provided",
  });

export const getPartTool = tool({
  description: "Search for a part by description or readable id",
  inputSchema: getPartSchema,
  execute: async function (args, executionOptions) {
    const context = executionOptions.experimental_context as ChatContext;
    let { readableId, description } = args;

    console.log("[getPartTool] Starting part search with args:", args);

    if (readableId) {
      console.log("[getPartTool] Searching by readableId:", readableId);

      const [part, supplierPart] = await Promise.all([
        context.client
          .from("item")
          .select("id, name, description, revision")
          .or(
            `readableId.eq.${readableId},readableIdWithRevision.eq.${readableId}`
          )
          .eq("companyId", context.companyId)
          .order("revision", { ascending: false })
          .limit(1),
        context.client
          .from("supplierPart")
          .select("*, item(id, name, description, revision)")
          .eq("supplierPartId", readableId)
          .eq("companyId", context.companyId)
          .single(),
      ]);

      console.log("[getPartTool] Part query result:", part.data);
      console.log(
        "[getPartTool] Supplier part query result:",
        supplierPart.data
      );

      if (supplierPart.data) {
        console.log(
          "[getPartTool] Found supplier part, returning:",
          supplierPart.data.itemId
        );
        return {
          id: supplierPart.data.itemId,
          name: supplierPart.data.item?.name,
          description: supplierPart.data.item?.description,
          supplierId: supplierPart.data.supplierId,
        };
      }
      if (part.data?.[0]) {
        console.log("[getPartTool] Found part, returning:", part.data[0].id);
        return {
          id: part.data[0].id,
          name: part.data[0].name,
          description: part.data[0].description,
        };
      }

      if (!description) {
        console.log(
          "[getPartTool] No part found by readableId, using readableId as description"
        );
        description = readableId;
      } else {
        console.log(
          "[getPartTool] No part found by readableId and description provided, returning null"
        );
        return null;
      }
    }

    if (description) {
      console.log("[getPartTool] Searching by description:", description);

      const embedding = await generateEmbedding(context.client, description);
      console.log("[getPartTool] Generated embedding for description");

      const search = await context.client.rpc("items_search", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.7,
        match_count: 10,
        p_company_id: context.companyId,
      });

      console.log(
        "[getPartTool] Search results:",
        search.data?.length || 0,
        "items found"
      );
      console.log("[getPartTool] Search results:", search.data);

      if (search.data && search.data.length > 0) {
        console.log("[getPartTool] Returning search results");
        return search.data;
      }
    }

    console.log("[getPartTool] No parts found, returning null");
    return null;
  },
});
