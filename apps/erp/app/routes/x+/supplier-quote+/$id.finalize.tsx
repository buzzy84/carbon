import {
  assertIsPost,
  error,
  getCarbonServiceRole,
  success,
} from "@carbon/auth";
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

  const validation = await validator(supplierQuoteFinalizeValidator).validate(
    await request.formData()
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { notification, supplierContact: supplierContactId } = validation.data;

  const serviceRole = getCarbonServiceRole();

  switch (notification) {
    case "Email":
      try {
        if (!supplierContactId) throw new Error("Supplier contact is required");

        const [company, companySettings, supplierContact, supplierQuote, user] =
          await Promise.all([
            getCompany(serviceRole, companyId),
            getCompanySettings(serviceRole, companyId),
            getSupplierContact(serviceRole, supplierContactId),
            getSupplierQuote(serviceRole, id),
            getUser(serviceRole, userId),
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
        const emailBody = `
          Hi ${supplierContact.data.contact.firstName ?? ""},

          Please review the supplier quote ${
            supplierQuote.data.supplierQuoteId
          }.

          You can view and respond to this quote at: ${externalQuoteUrl}

          ${
            quote.data.expirationDate
              ? `This quote expires on ${quote.data.expirationDate}.`
              : ""
          }

          Best regards,
          ${user.data.firstName} ${user.data.lastName}
        `;

        await tasks.trigger<typeof sendEmailResendTask>("send-email-resend", {
          to: [user.data.email, supplierContact.data.contact.email],
          from: user.data.email,
          subject: emailSubject,
          html: emailBody.replace(/\n/g, "<br>"),
          text: emailBody,
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
