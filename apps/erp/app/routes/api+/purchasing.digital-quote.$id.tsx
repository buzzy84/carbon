import { assertIsPost, getCarbonServiceRole, notFound } from "@carbon/auth";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import {
  externalSupplierQuoteValidator,
  selectedLinesValidator,
} from "~/modules/purchasing/purchasing.models";
import {
  convertSupplierQuoteToOrder,
  getSupplierQuoteByExternalId,
  getSupplierQuoteLines,
} from "~/modules/purchasing/purchasing.service";
import { getCompanySettings } from "~/modules/settings";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);

  const { id } = params;
  if (!id) throw notFound("id not found");

  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  const serviceRole = getCarbonServiceRole();
  const quote = await getSupplierQuoteByExternalId(serviceRole, id);

  if (quote.error || !quote.data) {
    console.error("Quote not found", quote.error);
    return json({
      success: false,
      message: "Quote not found",
    });
  }

  const companySettings = await getCompanySettings(
    serviceRole,
    quote.data.companyId
  );

  switch (intent) {
    case "accept": {
      const digitalSupplierQuoteSubmittedBy = String(
        formData.get("digitalSupplierQuoteSubmittedBy") ?? ""
      );
      const digitalSupplierQuoteSubmittedByEmail = String(
        formData.get("digitalSupplierQuoteSubmittedByEmail") ?? ""
      );
      const selectedLinesRaw = formData.get("selectedLines") ?? "{}";

      if (typeof selectedLinesRaw !== "string") {
        return json({ success: false, message: "Invalid selected lines data" });
      }

      const parseResult = selectedLinesValidator.safeParse(
        JSON.parse(selectedLinesRaw)
      );

      if (!parseResult.success) {
        console.error("Validation error:", parseResult.error);
        return json({ success: false, message: "Invalid selected lines data" });
      }

      const selectedLines = parseResult.data;

      // Convert quote to purchase order
      const convert = await convertSupplierQuoteToOrder(serviceRole, {
        id: quote.data.id,
        companyId: quote.data.companyId,
        userId: quote.data.createdBy,
        selectedLines,
      });

      if (convert.error) {
        console.error("Failed to convert quote to order", convert.error);
        return json({
          success: false,
          message: "Failed to convert quote to order",
        });
      }

      const now = new Date().toISOString();

      // Update quote status to Ordered
      await serviceRole
        .from("supplierQuote")
        .update({
          status: "Ordered",
          updatedAt: now,
          externalNotes: {
            ...((quote.data.externalNotes as Record<string, unknown>) || {}),
            acceptedBy: digitalSupplierQuoteSubmittedBy,
            acceptedByEmail: digitalSupplierQuoteSubmittedByEmail,
            acceptedAt: now,
          },
        })
        .eq("id", quote.data.id);

      // Update externalLink if it exists
      if (quote.data.externalLinkId) {
        await serviceRole
          .from("externalLink")
          .update({
            submittedAt: now,
            submittedBy: digitalSupplierQuoteSubmittedBy,
            submittedByEmail: digitalSupplierQuoteSubmittedByEmail,
          })
          .eq("id", quote.data.externalLinkId);
      }

      if (companySettings.error) {
        console.error("Failed to get company settings", companySettings.error);
      }

      return json({
        success: true,
        message: "Quote accepted and purchase order created successfully",
      });
    }

    case "decline": {
      const validation = await validator(
        externalSupplierQuoteValidator
      ).validate(formData);

      if (validation.error) {
        return validationError(validation.error);
      }

      const {
        digitalSupplierQuoteSubmittedBy,
        digitalSupplierQuoteSubmittedByEmail,
        note,
      } = validation.data;
      const now = new Date().toISOString();

      // Update supplierQuote
      await serviceRole
        .from("supplierQuote")
        .update({
          status: "Declined",
          updatedAt: now,
          externalNotes: {
            ...((quote.data.externalNotes as Record<string, unknown>) || {}),
            declineNote: note ?? null,
            declinedBy: digitalSupplierQuoteSubmittedBy,
            declinedByEmail: digitalSupplierQuoteSubmittedByEmail,
            declinedAt: now,
          },
        })
        .eq("id", quote.data.id);

      // Update externalLink if it exists
      if (quote.data.externalLinkId) {
        await serviceRole
          .from("externalLink")
          .update({
            declinedAt: now,
            declinedBy: digitalSupplierQuoteSubmittedBy,
            declinedByEmail: digitalSupplierQuoteSubmittedByEmail,
            declineNote: note ?? null,
          })
          .eq("id", quote.data.externalLinkId);
      }

      return json({
        success: true,
        message: "Quote declined successfully",
      });
    }

    case "submit": {
      const validation = await validator(
        externalSupplierQuoteValidator
      ).validate(formData);

      if (validation.error) {
        return validationError(validation.error);
      }

      const {
        digitalSupplierQuoteSubmittedBy,
        digitalSupplierQuoteSubmittedByEmail,
      } = validation.data;

      const selectedLinesRaw = formData.get("selectedLines") ?? "{}";

      if (typeof selectedLinesRaw !== "string") {
        return json({ success: false, message: "Invalid selected lines data" });
      }

      const parseResult = selectedLinesValidator.safeParse(
        JSON.parse(selectedLinesRaw)
      );

      if (!parseResult.success) {
        console.error("Validation error:", parseResult.error);
        return json({ success: false, message: "Invalid selected lines data" });
      }

      const selectedLines = parseResult.data;

      // Update prices for selected lines only
      const updates = [];

      for (const [lineId, selectedLine] of Object.entries(selectedLines)) {
        // Only update if quantity > 0 (line is selected)
        if (selectedLine.quantity > 0) {
          updates.push(
            serviceRole
              .from("supplierQuoteLinePrice")
              .update({
                supplierUnitPrice: selectedLine.supplierUnitPrice,
                unitPrice: selectedLine.unitPrice,
                leadTime: selectedLine.leadTime,
                shippingCost: selectedLine.shippingCost,
                supplierShippingCost: selectedLine.supplierShippingCost,
                supplierTaxAmount: selectedLine.supplierTaxAmount,
              })
              .eq("supplierQuoteLineId", lineId)
              .eq("quantity", selectedLine.quantity)
          );
        }
      }

      await Promise.all(updates);

      // Get all quote lines to determine if submission is partial or full
      const allLines = await getSupplierQuoteLines(serviceRole, quote.data.id);
      const allLineIds = new Set(
        (allLines.data ?? [])
          .map((line) => line.id)
          .filter((id): id is string => !!id)
      );
      const selectedLineIds = new Set(
        Object.keys(selectedLines).filter(
          (lineId) => selectedLines[lineId].quantity > 0
        )
      );

      // Determine if partial or full submission
      const isPartial = selectedLineIds.size < allLineIds.size;
      const newStatus = isPartial ? "Partial" : "Ordered";

      // Convert quote to purchase order for submitted lines
      const convert = await convertSupplierQuoteToOrder(serviceRole, {
        id: quote.data.id,
        companyId: quote.data.companyId,
        userId: quote.data.createdBy,
        selectedLines,
      });

      if (convert.error) {
        console.error("Failed to convert quote to order", convert.error);
        return json({
          success: false,
          message: "Failed to convert quote to order",
        });
      }

      const now = new Date().toISOString();

      // Update quote status based on partial/full submission
      await serviceRole
        .from("supplierQuote")
        .update({
          status: newStatus,
          updatedAt: now,
          externalNotes: {
            ...((quote.data.externalNotes as Record<string, unknown>) || {}),
            lastSubmittedBy: digitalSupplierQuoteSubmittedBy,
            lastSubmittedByEmail: digitalSupplierQuoteSubmittedByEmail,
            lastSubmittedAt: now,
          },
        })
        .eq("id", quote.data.id);

      // Update externalLink if it exists
      if (quote.data.externalLinkId) {
        await serviceRole
          .from("externalLink")
          .update({
            submittedAt: now,
            submittedBy: digitalSupplierQuoteSubmittedBy,
            submittedByEmail: digitalSupplierQuoteSubmittedByEmail,
          })
          .eq("id", quote.data.externalLinkId);
      }

      if (companySettings.error) {
        console.error("Failed to get company settings", companySettings.error);
      }

      return json({
        success: true,
        message: `Quote submitted successfully${
          isPartial ? " (partial)" : ""
        } and purchase order created`,
      });
    }

    default:
      return json({ success: false, message: "Invalid intent" });
  }
}
