import {
  assertIsPost,
  error,
  getCarbonServiceRole,
  success
} from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import { type ActionFunctionArgs, data } from "react-router";
import { maintenanceDispatchValidator } from "~/services/models";

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { companyId, userId } = await requirePermissions(request, {});

  const formData = await request.formData();
  const validation = await validator(maintenanceDispatchValidator).validate(
    formData
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const serviceRole = await getCarbonServiceRole();

  // Get the next sequence for maintenance dispatch
  const nextSequence = await serviceRole.rpc("get_next_sequence", {
    sequence_name: "maintenanceDispatch",
    company_id: companyId
  });

  if (nextSequence.error) {
    return data(
      {},
      await flash(
        request,
        error(nextSequence.error, "Failed to get next sequence")
      )
    );
  }

  const content = validation.data.content
    ? JSON.parse(validation.data.content)
    : {};

  // If operator performed, set status to Completed
  const isOperatorPerformed = validation.data.severity === "Operator Performed";
  const status = isOperatorPerformed
    ? validation.data.actualEndTime
      ? "Completed"
      : "In Progress"
    : "Open";

  const insertDispatch = await serviceRole
    .from("maintenanceDispatch")
    .insert([
      {
        maintenanceDispatchId: nextSequence.data,
        status,
        priority: validation.data.priority,
        severity: validation.data.severity,
        source: "Reactive", // Coming from MES is always reactive
        workCenterId: validation.data.workCenterId,
        suspectedFailureModeId:
          validation.data.suspectedFailureModeId || undefined,
        actualFailureModeId: validation.data.actualFailureModeId || undefined,
        isFailure: validation.data.isFailure || false,
        actualStartTime: validation.data.actualStartTime || undefined,
        actualEndTime: validation.data.actualEndTime || undefined,
        content,
        companyId,
        createdBy: userId
      }
    ])
    .select("id")
    .single();

  if (insertDispatch.error) {
    return data(
      {},
      await flash(
        request,
        error(insertDispatch.error, "Failed to create maintenance dispatch")
      )
    );
  }

  return data(
    { id: insertDispatch.data?.id },
    await flash(request, success("Maintenance dispatch created"))
  );
}
