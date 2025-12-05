import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { sendEmailResendTask } from "@carbon/jobs/trigger/send-email-resend";
import { tasks } from "@trigger.dev/sdk";
import { redirect, type ActionFunctionArgs } from "@vercel/remix";
import {
  finalizeSupplierQuote,
  getSupplierContact,
  getSupplierQuote,
  getSupplierQuoteLines,
  getSupplierQuoteLinePricesByQuoteId,
  supplierQuoteFinalizeValidator,
} from "~/modules/purchasing";
import { getCompany, getCompanySettings } from "~/modules/settings";
import { upsertExternalLink } from "~/modules/shared";
import { getUser } from "~/modules/users/users.server";
import { path } from "~/utils/path";

export async function action(args: ActionFunctionArgs) {
  const { request, params } = args;
  assertIsPost(request);

  const { client, companyId, userId } = await requirePermissions(request, {
    create: "purchasing",
    role: "employee",
    bypassRls: true,
  });

  const { id } = params;
  if (!id) throw new Error("Could not find supplier quote id");

  const [quote] = await Promise.all([getSupplierQuote(client, id)]);
  if (quote.error) {
    throw redirect(
      path.to.supplierQuote(id),
      await flash(request, error(quote.error, "Failed to get supplier quote"))
    );
  }

  // Reuse existing external link or create one if it doesn't exist
  const [externalLink] = await Promise.all([
    upsertExternalLink(client, {
      id: quote.data.externalLinkId ?? undefined,
      documentType: "SupplierQuote",
      documentId: id,
      supplierId: quote.data.supplierId,
      expiresAt: quote.data.expirationDate,
      companyId,
    }),
  ]);

  if (externalLink.data && quote.data.externalLinkId !== externalLink.data.id) {
    await client
      .from("supplierQuote")
      .update({
        externalLinkId: externalLink.data.id,
      })
      .eq("id", id);
  }

  // Validate that all quantities have price and lead time
  const [quoteLines, quoteLinePrices] = await Promise.all([
    getSupplierQuoteLines(client, id),
    getSupplierQuoteLinePricesByQuoteId(client, id),
  ]);

  if (quoteLines.error) {
    throw redirect(
      path.to.supplierQuote(id),
      await flash(
        request,
        error(quoteLines.error, "Failed to get supplier quote lines")
      )
    );
  }

  if (quoteLinePrices.error) {
    throw redirect(
      path.to.supplierQuote(id),
      await flash(
        request,
        error(quoteLinePrices.error, "Failed to get supplier quote line prices")
      )
    );
  }

  // Check that each line has at least one quantity with price and lead time
  const lines = quoteLines.data ?? [];
  const prices = quoteLinePrices.data ?? [];

  for (const line of lines) {
    if (!line.id) continue;
    const linePrices = prices.filter((p) => p.supplierQuoteLineId === line.id);
    const quantities =
      Array.isArray(line.quantity) && line.quantity.length > 0
        ? line.quantity
        : linePrices.map((p) => p.quantity);

    if (quantities.length === 0) {
      throw redirect(
        path.to.supplierQuote(id),
        await flash(
          request,
          error(
            null,
            `Line ${line.itemReadableId} must have at least one quantity with price and lead time`
          )
        )
      );
    }

    for (const qty of quantities) {
      const price = linePrices.find(
        (p) => p.supplierQuoteLineId === line.id && p.quantity === qty
      );
      if (
        !price ||
        price.supplierUnitPrice === 0 ||
        price.leadTime === 0 ||
        price.supplierUnitPrice === null ||
        price.leadTime === null
      ) {
        throw redirect(
          path.to.supplierQuote(id),
          await flash(
            request,
            error(
              null,
              `Line ${line.itemReadableId} quantity ${qty} must have price and lead time`
            )
          )
        );
      }
    }
  }

  // TODO: Add PDF generation for supplier quotes when available
  // TODO: Add document creation for supplier quotes when PDF is available

  try {
    const finalize = await finalizeSupplierQuote(client, id, userId);
    if (finalize.error) {
      throw redirect(
        path.to.supplierQuote(id),
        await flash(
          request,
          error(finalize.error, "Failed to finalize supplier quote")
        )
      );
    }
  } catch (err) {
    throw redirect(
      path.to.supplierQuote(id),
      await flash(request, error(err, "Failed to finalize supplier quote"))
    );
  }

  const validation = await validator(supplierQuoteFinalizeValidator).validate(
    await request.formData()
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { notification, supplierContact: supplierContactId } = validation.data;

  switch (notification) {
    case "Email":
      try {
        if (!supplierContactId) throw new Error("Supplier contact is required");

        const [company, companySettings, supplierContact, supplierQuote, user] =
          await Promise.all([
            getCompany(client, companyId),
            getCompanySettings(client, companyId),
            getSupplierContact(client, supplierContactId),
            getSupplierQuote(client, id),
            getUser(client, userId),
          ]);

        if (!company.data) throw new Error("Failed to get company");
        if (!companySettings.data)
          throw new Error("Failed to get company settings");
        if (!supplierContact?.data?.contact)
          throw new Error("Failed to get supplier contact");
        if (!supplierQuote.data)
          throw new Error("Failed to get supplier quote");
        if (!user.data) throw new Error("Failed to get user");

        // For now, we'll send a simple email without PDF attachment
        // TODO: Add PDF generation for supplier quotes when available
        const requestUrl = new URL(request.url);
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
        const externalQuoteUrl = `${baseUrl}${path.to.externalSupplierQuote(
          externalLink.data?.id ?? ""
        )}`;

        const emailSubject = `Supplier Quote ${supplierQuote.data.supplierQuoteId} from ${company.data.name}`;
        const emailBody = `This link is for supplier quote ${supplierQuote.data.supplierQuoteId}. Please go to the link below to fill out the supplier code.`;

        const emailBodyHtml = `This link is for supplier quote ${supplierQuote.data.supplierQuoteId}. Please go to the link below to fill out the supplier code.<br><br><a href="${externalQuoteUrl}">${externalQuoteUrl}</a>`;

        await tasks.trigger<typeof sendEmailResendTask>("send-email-resend", {
          to: [user.data.email, supplierContact.data.contact.email],
          from: user.data.email,
          subject: emailSubject,
          html: emailBodyHtml,
          text: `${emailBody}\n\n${externalQuoteUrl}`,
          companyId,
        });
      } catch (err) {
        throw redirect(
          path.to.supplierQuote(id),
          await flash(request, error(err, "Failed to send email"))
        );
      }

      break;
    case undefined:
    case "None":
      break;
    default:
      throw new Error("Invalid notification type");
  }

  throw redirect(
    path.to.supplierQuote(id),
    await flash(request, success("Supplier quote finalized successfully"))
  );
}
