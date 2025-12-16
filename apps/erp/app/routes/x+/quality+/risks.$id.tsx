import { requirePermissions } from "@carbon/auth/auth.server";
import { validationError, validator } from "@carbon/form";
import { useDisclosure } from "@carbon/react";
import {
  type ActionFunctionArgs,
  data,
  type LoaderFunctionArgs,
  useLoaderData,
  useNavigate
} from "react-router";
import invariant from "tiny-invariant";
import { riskRegisterValidator } from "~/modules/quality/quality.models";
import { getRisk, upsertRisk } from "~/modules/quality/quality.service";
import RiskRegisterForm from "~/modules/quality/ui/RiskRegister/RiskRegisterForm";
import { path } from "~/utils/path";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { client } = await requirePermissions(request, {
    view: "quality",
    role: "employee"
  });
  const { id } = params;
  invariant(id, "id is required");

  const risk = await getRisk(client, id);
  if (risk.error || !risk.data) {
    throw new Response("Not Found", { status: 404 });
  }

  return data({ risk: risk.data });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { client, userId, companyId } = await requirePermissions(request, {
    update: "quality",
    role: "employee"
  });

  const formData = await request.formData();
  const validation = await validator(riskRegisterValidator).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  const result = await upsertRisk(client, {
    ...validation.data,
    id: validation.data.id!,
    companyId,
    updatedBy: userId
  });

  if (result.error) {
    return data(
      {
        data: null,
        error: result.error,
        success: false
      },
      { status: 500 }
    );
  }

  return data({
    data: result.data,
    success: true,
    error: null
  });
};

export default function EditRiskRoute() {
  const { risk } = useLoaderData<typeof loader>();
  const formDisclosure = useDisclosure({
    defaultIsOpen: true
  });
  const onClose = () => {
    formDisclosure.onClose();
  };

  return (
    <RiskRegisterForm
      open={formDisclosure.isOpen}
      initialValues={{
        ...risk,
        id: risk.id,
        title: risk.title || "",
        description: risk.description ?? undefined,
        source: risk.source,
        status: risk.status || "Open",
        severity: risk.severity ?? undefined,
        likelihood: risk.likelihood ?? undefined,
        assigneeUserId: risk.assigneeUserId ?? undefined,
        sourceId: risk.sourceId ?? undefined
      }}
      onClose={onClose}
    />
  );
}
