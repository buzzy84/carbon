import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { sendEmailResendTask } from "@carbon/jobs/trigger/send-email-resend";
import { tasks } from "@trigger.dev/sdk";
import { redirect, type ActionFunctionArgs } from "@vercel/remix";
import {
  getSupplierContact,
  getSupplierQuote,
  sendSupplierQuote,
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

  // Send keeps status as Draft
  try {
    const send = await sendSupplierQuote(client, id, userId);
    if (send.error) {
      throw redirect(
        path.to.supplierQuote(id),
        await flash(request, error(send.error, "Failed to send supplier quote"))
      );
    }
  } catch (err) {
    throw redirect(
      path.to.supplierQuote(id),
      await flash(request, error(err, "Failed to send supplier quote"))
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
    await flash(request, success("Supplier quote sent successfully"))
  );
}
