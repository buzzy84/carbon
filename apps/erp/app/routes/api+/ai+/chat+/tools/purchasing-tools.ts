import { tool } from "ai";
import { z } from "zod";
import { getCurrencyByCode } from "~/modules/accounting/accounting.service";
import {
  deletePurchaseOrder,
  getSupplier as getSupplierById,
  getSupplierPayment,
  getSupplierShipping,
  insertSupplierInteraction,
} from "~/modules/purchasing/purchasing.service";

import { getAppUrl, getCarbonServiceRole } from "@carbon/auth";
import { getNextSequence } from "~/modules/settings";
import { path } from "~/utils/path";
import type { ChatContext } from "../agents/shared/context";

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string(),
  parts: z.array(
    z.object({
      partId: z.string(),
      quantity: z.number().positive().default(1),
    })
  ),
});

export const createPurchaseOrderTool = tool({
  description: "Create a purchase order from a list of parts and a supplier",
  inputSchema: createPurchaseOrderSchema,
  execute: async function (args, executionOptions) {
    const context = executionOptions.experimental_context as ChatContext;

    console.log(
      "[createPurchaseOrderTool] Starting purchase order creation with args:",
      args
    );

    const [
      nextSequence,
      supplierInteraction,
      supplier,
      supplierPayment,
      supplierShipping,
      // purchaser
    ] = await Promise.all([
      getNextSequence(
        getCarbonServiceRole(),
        "purchaseOrder",
        context.companyId
      ),
      insertSupplierInteraction(
        context.client,
        context.companyId,
        args.supplierId
      ),
      getSupplierById(context.client, args.supplierId),
      getSupplierPayment(context.client, args.supplierId),
      getSupplierShipping(context.client, args.supplierId),
      // getEmployeeJob(client, context.userId, context.companyId),
    ]);

    console.log("[createPurchaseOrderTool] Retrieved data:", {
      nextSequence: nextSequence.data,
      supplierInteraction: !!supplierInteraction.data,
      supplier: !!supplier.data,
      supplierPayment: !!supplierPayment.data,
      supplierShipping: !!supplierShipping.data,
    });

    if (!supplierInteraction.data) {
      console.log(
        "[createPurchaseOrderTool] Failed to create supplier interaction"
      );
      return {
        error: "Failed to create supplier interaction",
      };
    }

    if (!supplier.data) {
      console.log(
        "[createPurchaseOrderTool] Supplier not found:",
        args.supplierId
      );
      return {
        error: "Supplier not found",
      };
    }
    if (!supplierPayment.data) {
      console.log(
        "[createPurchaseOrderTool] Supplier payment not found for supplier:",
        args.supplierId
      );
      return {
        error: "Supplier payment not found",
      };
    }
    if (!supplierShipping.data) {
      console.log(
        "[createPurchaseOrderTool] Supplier shipping not found for supplier:",
        args.supplierId
      );
      return {
        error: "Supplier shipping not found",
      };
    }

    const purchaseOrder = {
      purchaseOrderId: nextSequence.data ?? "",
      supplierId: args.supplierId,
      supplierInteractionId: supplierInteraction.data?.id ?? null,
      exchangeRate: 1,
      exchangeRateUpdatedAt: new Date().toISOString(),
      companyId: context.companyId,
      createdBy: context.userId,
    };

    console.log(
      "[createPurchaseOrderTool] Initial purchase order data:",
      purchaseOrder
    );

    const {
      paymentTermId,
      invoiceSupplierId,
      invoiceSupplierContactId,
      invoiceSupplierLocationId,
    } = supplierPayment.data;

    const { shippingMethodId, shippingTermId } = supplierShipping.data;

    if (supplier.data?.currencyCode) {
      console.log(
        "[createPurchaseOrderTool] Getting currency for code:",
        supplier.data.currencyCode
      );
      const currency = await getCurrencyByCode(
        context.client,
        context.companyId,
        supplier.data?.currencyCode ?? ""
      );
      if (currency.data) {
        console.log(
          "[createPurchaseOrderTool] Updated exchange rate:",
          currency.data.exchangeRate
        );
        purchaseOrder.exchangeRate = currency.data.exchangeRate ?? 1;
        purchaseOrder.exchangeRateUpdatedAt = new Date().toISOString();
      }
    }

    console.log("[createPurchaseOrderTool] Creating purchase order...");
    const order = await context.client
      .from("purchaseOrder")
      .insert(purchaseOrder)
      .select("id, purchaseOrderId");

    if (!order) {
      console.log(
        "[createPurchaseOrderTool] Failed to create purchase order - no order returned"
      );
      return {
        error: "Failed to create purchase order",
      };
    }

    const purchaseOrderId = order.data?.[0]?.id ?? "";
    const locationId = null; // TODO

    console.log(
      "[createPurchaseOrderTool] Created purchase order with ID:",
      purchaseOrderId
    );

    if (!purchaseOrderId) {
      console.log(
        "[createPurchaseOrderTool] Failed to create purchase order - no ID returned"
      );
      return {
        error: "Failed to create purchase order",
      };
    }

    try {
      console.log(
        "[createPurchaseOrderTool] Creating purchase order delivery and payment records..."
      );
      await Promise.all([
        context.client
          .from("purchaseOrderDelivery")
          .insert({
            id: purchaseOrderId,
            locationId: locationId,
            shippingMethodId: shippingMethodId ?? null,
            shippingTermId: shippingTermId ?? null,
            companyId: context.companyId,
          })
          .select("id")
          .single(),
        context.client
          .from("purchaseOrderPayment")
          .insert({
            id: purchaseOrderId,
            invoiceSupplierId: invoiceSupplierId,
            invoiceSupplierContactId: invoiceSupplierContactId,
            invoiceSupplierLocationId: invoiceSupplierLocationId,
            paymentTermId: paymentTermId,
            companyId: context.companyId,
          })
          .select("id")
          .single(),
      ]);

      console.log(
        "[createPurchaseOrderTool] Creating purchase order lines for",
        args.parts.length,
        "parts..."
      );
      // Create purchase order lines for each part
      await Promise.all(
        args.parts.map(async (part: { partId: string; quantity: number }) => {
          console.log(
            "[createPurchaseOrderTool] Processing part:",
            part.partId,
            "quantity:",
            part.quantity
          );

          // Get item details
          const [item, supplierPart] = await Promise.all([
            context.client
              .from("item")
              .select("*")
              .eq("id", part.partId)
              .eq("companyId", context.companyId)
              .single(),
            context.client
              .from("supplierPart")
              .select("*")
              .eq("itemId", part.partId)
              .eq("companyId", context.companyId)
              .eq("supplierId", args.supplierId)
              .single(),
          ]);

          console.log(
            "[createPurchaseOrderTool] Retrieved item data for part:",
            part.partId,
            "found:",
            !!item.data
          );
          console.log(
            "[createPurchaseOrderTool] Retrieved supplier part data for part:",
            part.partId,
            "found:",
            !!supplierPart.data
          );

          if (!item.data) {
            console.log(
              "[createPurchaseOrderTool] Item not found:",
              part.partId
            );
            throw new Error(`Item not found: ${part.partId}`);
          }

          // Get item cost and replenishment info
          const [itemCost, itemReplenishment] = await Promise.all([
            context.client
              .from("itemCost")
              .select("*")
              .eq("itemId", part.partId)
              .eq("companyId", context.companyId)
              .single(),
            context.client
              .from("itemReplenishment")
              .select("*")
              .eq("itemId", part.partId)
              .eq("companyId", context.companyId)
              .single(),
          ]);

          console.log(
            "[createPurchaseOrderTool] Retrieved cost and replenishment data for part:",
            part.partId
          );

          const lineData = {
            purchaseOrderId: purchaseOrderId,
            itemId: part.partId,
            description: item.data?.name,
            purchaseOrderLineType: item.data?.type,
            purchaseQuantity: part.quantity,
            supplierUnitPrice:
              (supplierPart?.data?.unitPrice ?? itemCost?.data?.unitCost ?? 0) /
              purchaseOrder.exchangeRate,
            supplierShippingCost: 0,
            purchaseUnitOfMeasureCode:
              supplierPart?.data?.supplierUnitOfMeasureCode ??
              itemReplenishment?.data?.purchasingUnitOfMeasureCode ??
              item.data?.unitOfMeasureCode ??
              "EA",
            inventoryUnitOfMeasureCode: item.data?.unitOfMeasureCode ?? "EA",
            conversionFactor:
              supplierPart?.data?.conversionFactor ??
              itemReplenishment?.data?.conversionFactor ??
              1,
            locationId: locationId,
            shelfId: null,
            supplierTaxAmount: 0,
            companyId: context.companyId,
            createdBy: context.userId,
          };

          console.log(
            "[createPurchaseOrderTool] Creating purchase order line for part:",
            part.partId,
            "with data:",
            lineData
          );

          // Create the purchase order line
          return context.client
            .from("purchaseOrderLine")
            .insert(lineData)
            .select("id")
            .single();
        })
      );

      console.log(
        "[createPurchaseOrderTool] Successfully created purchase order:",
        order.data
      );
      return {
        ...order.data,
        link: `${getAppUrl()}${path.to.purchaseOrder(purchaseOrderId)}`,
      };
    } catch (error) {
      console.log(
        "[createPurchaseOrderTool] Error creating purchase order details:",
        error
      );
      if (purchaseOrderId) {
        console.log(
          "[createPurchaseOrderTool] Cleaning up purchase order:",
          purchaseOrderId
        );
        await deletePurchaseOrder(context.client, purchaseOrderId);
      }
      return {
        error: `Failed to create purchase order details: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  },
});
