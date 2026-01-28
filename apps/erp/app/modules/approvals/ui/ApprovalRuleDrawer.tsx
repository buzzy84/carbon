import {
  Boolean as FormBoolean,
  Number as FormNumber,
  Hidden,
  Input,
  SelectControlled,
  Submit,
  ValidatedForm
} from "@carbon/form";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  HStack,
  VStack
} from "@carbon/react";
import { useState } from "react";
import { Employee, Users } from "~/components/Form";
import { usePermissions } from "~/hooks";
import {
  ApprovalDocumentType,
  type ApprovalRule,
  approvalRuleValidator
} from "~/modules/approvals";
import { path } from "~/utils/path";

type ApprovalRuleDrawerProps = {
  rule: ApprovalRule | null;
  documentType: ApprovalDocumentType | null;
  groups?: Array<{ id: string; name: string }>;
  canEdit?: boolean;
  onClose: () => void;
};

const ApprovalRuleDrawer = ({
  rule,
  documentType,
  groups,
  canEdit = true,
  onClose
}: ApprovalRuleDrawerProps) => {
  const permissions = usePermissions();
  const isEditing = !!rule;
  const isDisabled =
    !permissions.can("update", "settings") || (isEditing && !canEdit);

  const [selectedDocumentType, setSelectedDocumentType] =
    useState<ApprovalDocumentType | null>(documentType || null);

  const documentTypeOptions: Array<{
    value: ApprovalDocumentType;
    label: string;
  }> = [
    { value: "purchaseOrder", label: "Purchase Order" },
    { value: "qualityDocument", label: "Quality Document" }
  ];

  const effectiveDocumentType = rule?.documentType || selectedDocumentType;

  const defaultValues = rule
    ? {
        id: rule.id,
        name: rule.name ?? "",
        documentType: rule.documentType,
        enabled: rule.enabled ?? false,
        approverGroupIds: Array.isArray(rule.approverGroupIds)
          ? rule.approverGroupIds
          : [],
        defaultApproverId: rule.defaultApproverId ?? undefined,
        lowerBoundAmount: rule.lowerBoundAmount ?? 0,
        upperBoundAmount: rule.upperBoundAmount ?? undefined,
        escalationDays: rule.escalationDays ?? undefined
      }
    : {
        name: "",
        documentType: selectedDocumentType || undefined,
        enabled: true,
        approverGroupIds: [],
        lowerBoundAmount: 0,
        upperBoundAmount: undefined,
        escalationDays: undefined
      };

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <ValidatedForm
          validator={approvalRuleValidator}
          method="post"
          action={
            isEditing
              ? path.to.approvalRule(rule.id)
              : path.to.newApprovalRule()
          }
          defaultValues={defaultValues}
          className="flex flex-col h-full"
        >
          <DrawerHeader>
            <DrawerTitle>
              {isEditing ? "Edit" : "New"} Approval Rule
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <VStack spacing={4} className="items-stretch">
              {isEditing && rule?.id && <Hidden name="id" value={rule.id} />}

              {!isEditing && (
                <SelectControlled
                  name="documentType"
                  label="Document Type"
                  options={documentTypeOptions}
                  value={selectedDocumentType || ""}
                  onChange={(option) => {
                    if (option) {
                      setSelectedDocumentType(
                        option.value as ApprovalDocumentType
                      );
                    }
                  }}
                />
              )}

              {isEditing && effectiveDocumentType && (
                <Hidden name="documentType" value={effectiveDocumentType} />
              )}

              <FormBoolean
                name="enabled"
                label="Enabled"
                helperText="Enable this rule to automatically require approval for matching documents"
                variant="large"
              />

              <Input name="name" label="Rule Name" required />

              <Users
                type="employee"
                name="approverGroupIds"
                label="Approver Groups"
                placeholder="Select approver groups"
              />

              <Employee
                name="defaultApproverId"
                label="Default Approver (Optional)"
                placeholder="Select a default approver"
              />

              {/* Purchase Order Specific Fields */}
              {effectiveDocumentType === "purchaseOrder" && (
                <>
                  <FormNumber
                    name="lowerBoundAmount"
                    label="Minimum Amount"
                    formatOptions={{
                      style: "currency",
                      currency: "USD"
                    }}
                  />

                  <FormNumber
                    name="upperBoundAmount"
                    label="Maximum Amount (Optional)"
                    formatOptions={{
                      style: "currency",
                      currency: "USD"
                    }}
                  />
                </>
              )}

              <FormNumber
                name="escalationDays"
                label="Escalation Days"
                helperText="Automatically escalate approval requests after this many days. Leave empty to disable escalation."
              />
            </VStack>
          </DrawerBody>
          <DrawerFooter>
            <HStack>
              <Submit isDisabled={isDisabled}>
                {isEditing ? "Update" : "Create"} Rule
              </Submit>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </HStack>
          </DrawerFooter>
        </ValidatedForm>
      </DrawerContent>
    </Drawer>
  );
};

export default ApprovalRuleDrawer;
