import type { Database } from "@carbon/database";
import type { GenericQueryFilters } from "@carbon/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setGenericQueryFilters } from "~/utils/query";

// Get all approvals requests for a user
export async function getApprovalsForUser(
  client: SupabaseClient<Database>,
  userId: string,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
    status: string | null;
    dateFrom: string | null;
    dateTo: string | null;
  }
) {
  let query = client
    .from("approvalRequests")
    .select("*", { count: "exact" })
    .eq("companyId", companyId)
    .eq("userId", userId);

  if (args?.documentType) {
    query = query.eq("documentType", args.documentType);
  }

  if (args.status) {
    query = query.eq("status", args.status);
  }

  if (args.dateFrom) {
    query = query.gte("requestedAt", args.dateFrom);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "requestedAt", ascending: false }
    ]);
  }

  return query;
}

// Get pending approvals for a specific approver
export async function getPendingApprovalsForApprover(
  client: SupabaseClient<Database>,
  approverId: string,
  companyId: string
) {
  const userGroups = await client
    .from("membership")
    .select("groupId")
    .eq("memberUserId", approverId);

  const groupIds = userGroups.data?.map((group) => group.groupId) ?? [];

  let query = client
    .from("approvalRequests")
    .select("*", { count: "exact" })
    .eq("companyId", companyId)
    .eq("approverId", approverId)
    .eq("status", "Pending");

  if (groupIds.length > 0) {
    query = query.or(
      `approverId.eq.${approverId},approverGroupId.in.(${groupIds.join(",")})`
    );
  } else {
    query = query.eq("approverId", approverId);
  }

  return query.orderBy("requestedAt", { ascending: false });
}
