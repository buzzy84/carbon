import type { Database } from "@carbon/database";
import type {
  getApprovalConfiguration,
  getApprovalHistory
} from "./approvals.service";

export type ApprovalRequest =
  Database["public"]["Views"]["approvalRequests"]["Row"];

export type ApprovalHistory = NonNullable<
  Awaited<ReturnType<typeof getApprovalHistory>>["data"]
>;

export type ApprovalConfiguration = NonNullable<
  Awaited<ReturnType<typeof getApprovalConfiguration>>["data"]
>;

export type ApprovalStatus = Database["public"]["Enums"]["approvalStatus"];

export type ApprovalDocumentType =
  Database["public"]["Enums"]["approvalDocumentType"];
