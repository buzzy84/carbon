import { ValidatedForm } from "@carbon/form";
import {
  Button,
  HStack,
  ModalDrawer,
  ModalDrawerBody,
  ModalDrawerContent,
  ModalDrawerFooter,
  ModalDrawerHeader,
  ModalDrawerProvider,
  ModalDrawerTitle,
  toast,
  VStack
} from "@carbon/react";
import type { PostgrestResponse } from "@supabase/supabase-js";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import type { z } from "zod/v3";
import {
  Employee,
  Hidden,
  Input,
  Number as NumberInput,
  Select,
  Submit,
  TextArea
} from "~/components/Form";
import { usePermissions } from "~/hooks";
import {
  riskRegisterValidator,
  riskStatus
} from "~/modules/quality/quality.models";
import { path } from "~/utils/path";

type RiskRegisterFormProps = {
  initialValues: z.infer<typeof riskRegisterValidator>;
  type?: "modal" | "drawer";
  open?: boolean;
  onClose: () => void;
};

const RiskRegisterForm = ({
  initialValues,
  open = true,
  type = "drawer",
  onClose
}: RiskRegisterFormProps) => {
  const permissions = usePermissions();
  const fetcher = useFetcher<{
    data: { id: string } | null;
    error: any;
    success?: boolean;
  }>();

  useEffect(() => {
    // Only process the response when fetcher is idle (request complete)
    if (fetcher.state === "idle" && fetcher.data?.success === true) {
      toast.success(`Saved risk`);
      onClose();
    } else if (fetcher.state === "idle" && fetcher.data?.success === false) {
      toast.error(`Failed to save risk: ${fetcher.data?.error?.message}`);
    }
  }, [fetcher.state, fetcher.data?.success, fetcher.data?.error, onClose]);

  const isEditing = !!initialValues.id;
  const isDisabled = isEditing
    ? !permissions.can("update", "quality")
    : !permissions.can("create", "quality");

  // Set default values for severity and likelihood
  const formInitialValues = {
    ...initialValues,
    severity: initialValues.severity ?? 1,
    likelihood: initialValues.likelihood ?? 1
  };

  return (
    <ModalDrawerProvider type={type}>
      <ModalDrawer
        open={open}
        onOpenChange={(isOpen) => {
          // Prevent closing while submitting to avoid cancelling the request
          if (!isOpen && fetcher.state === "idle") {
            onClose?.();
          }
        }}
      >
        <ModalDrawerContent>
          <ValidatedForm
            validator={riskRegisterValidator}
            method="post"
            action={
              isEditing ? path.to.risk(initialValues.id!) : path.to.newRisk
            }
            defaultValues={formInitialValues}
            fetcher={fetcher}
            className="flex flex-col h-full"
          >
            <ModalDrawerHeader>
              <ModalDrawerTitle>
                {isEditing ? "Edit" : "New"} Risk
              </ModalDrawerTitle>
            </ModalDrawerHeader>
            <ModalDrawerBody>
              <Hidden name="id" />
              <Hidden name="source" />
              {/* Context field for the source entity ID */}
              <Hidden name="sourceId" />

              <VStack spacing={4}>
                <Input name="title" label="Title" />
                <TextArea name="description" label="Description" />

                <Select
                  name="status"
                  label="Status"
                  options={riskStatus.map((s) => ({ value: s, label: s }))}
                />

                <HStack spacing={4} className="w-full">
                  <NumberInput
                    name="severity"
                    label="Severity (1-5)"
                    minValue={1}
                    maxValue={5}
                  />
                  <NumberInput
                    name="likelihood"
                    label="Likelihood (1-5)"
                    minValue={1}
                    maxValue={5}
                  />
                </HStack>

                <Employee name="assigneeUserId" label="Assignee" />
              </VStack>
            </ModalDrawerBody>
            <ModalDrawerFooter>
              <HStack>
                <Submit isDisabled={isDisabled}>Save</Submit>
                <Button
                  size="md"
                  variant="solid"
                  onClick={() => onClose?.()}
                  isDisabled={fetcher.state !== "idle"}
                >
                  Cancel
                </Button>
              </HStack>
            </ModalDrawerFooter>
          </ValidatedForm>
        </ModalDrawerContent>
      </ModalDrawer>
    </ModalDrawerProvider>
  );
};

export default RiskRegisterForm;
