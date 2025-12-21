import { useCarbon } from "@carbon/auth";
import {
  Boolean,
  DateTimePicker,
  Hidden,
  Select,
  Submit,
  ValidatedForm
} from "@carbon/form";
import type { JSONContent } from "@carbon/react";
import {
  Button,
  HStack,
  IconButton,
  Label,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
  useDisclosure,
  VStack
} from "@carbon/react";
import { Editor } from "@carbon/react/Editor";
import { PostgrestResponse } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { useEffect, useState } from "react";
import { BsExclamationSquareFill } from "react-icons/bs";
import { LuWrench } from "react-icons/lu";
import { useFetcher } from "react-router";
import { HighPriorityIcon } from "~/assets/icons/HighPriorityIcon";
import { LowPriorityIcon } from "~/assets/icons/LowPriorityIcon";
import { MediumPriorityIcon } from "~/assets/icons/MediumPriorityIcon";
import { useUser } from "~/hooks";
import {
  maintenanceDispatchPriority,
  maintenanceDispatchValidator,
  maintenanceSeverity
} from "~/services/models";
import { getPrivateUrl, path } from "~/utils/path";

function getPriorityIcon(
  priority: (typeof maintenanceDispatchPriority)[number]
) {
  switch (priority) {
    case "Critical":
      return <BsExclamationSquareFill className="text-red-500" />;
    case "High":
      return <HighPriorityIcon />;
    case "Medium":
      return <MediumPriorityIcon />;
    case "Low":
      return <LowPriorityIcon />;
  }
}

function getSeverityLabel(severity: (typeof maintenanceSeverity)[number]) {
  switch (severity) {
    case "Preventive":
      return "Preventive";
    case "Operator Performed":
      return "Operator Performed";
    case "Maintenance Required":
      return "Maintenance Required";
    case "OEM Required":
      return "OEM Required";
  }
}

export function MaintenanceDispatch({
  workCenter
}: {
  workCenter: { id: string; name: string };
}) {
  const disclosure = useDisclosure();
  const fetcher = useFetcher<{ id?: string }>();
  const failureModeFetcher =
    useFetcher<
      PostgrestResponse<{
        id: string;
        name: string;
      }>
    >();
  const {
    company: { id: companyId }
  } = useUser();
  const { carbon } = useCarbon();

  const [content, setContent] = useState<JSONContent>({});
  const [isFailure, setIsFailure] = useState(false);
  const [severity, setSeverity] =
    useState<(typeof maintenanceSeverity)[number]>("Operator Performed");
  const [actualStartTime, setActualStartTime] = useState<string>(
    new Date().toISOString()
  );
  const [actualEndTime, setActualEndTime] = useState<string>("");

  const failureModes = failureModeFetcher.data?.data ?? [];

  const onOpen = () => {
    failureModeFetcher.load(path.to.api.failureModes);
    disclosure.onOpen();
  };

  const onClose = () => {
    setContent({});
    setIsFailure(false);
    setSeverity("Operator Performed");
    setActualStartTime(new Date().toISOString());
    setActualEndTime("");
    disclosure.onClose();
  };

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.id) {
      toast.success("Maintenance dispatch created");
      onClose();
    }
  }, [fetcher.state, fetcher.data]);

  const onUploadImage = async (file: File) => {
    const fileType = file.name.split(".").pop();
    const fileName = `${companyId}/maintenance/${nanoid()}.${fileType}`;

    const result = await carbon?.storage.from("private").upload(fileName, file);

    if (result?.error) {
      toast.error("Failed to upload image");
      throw new Error(result.error.message);
    }

    if (!result?.data) {
      throw new Error("Failed to upload image");
    }

    return getPrivateUrl(result.data.path);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger>
          <IconButton
            aria-label="Maintenance"
            variant="secondary"
            icon={<LuWrench />}
            onClick={onOpen}
          />
        </TooltipTrigger>
        <TooltipContent align="end">
          <span>Maintenance Dispatch</span>
        </TooltipContent>
      </Tooltip>
      {disclosure.isOpen && (
        <Modal
          open={disclosure.isOpen}
          onOpenChange={(open) => {
            if (!open) {
              onClose();
            }
          }}
        >
          <ModalContent size="xlarge">
            <ValidatedForm
              method="post"
              action={path.to.maintenanceDispatch}
              validator={maintenanceDispatchValidator}
              defaultValues={{
                workCenterId: workCenter.id,
                isFailure: false,
                priority: "Medium",
                severity: "Operator Performed",
                suspectedFailureModeId: undefined
              }}
              fetcher={fetcher}
            >
              <ModalHeader>
                <ModalTitle>Maintenance for {workCenter.name}</ModalTitle>
              </ModalHeader>
              <ModalBody>
                <Hidden name="workCenterId" value={workCenter.id} />
                <Hidden name="content" value={JSON.stringify(content)} />
                <Hidden name="actualStartTime" value={actualStartTime} />
                <Hidden name="actualEndTime" value={actualEndTime} />
                <VStack spacing={4}>
                  <div className="flex flex-col gap-2 w-full">
                    <Label>Description</Label>
                    <Editor
                      initialValue={content}
                      onUpload={onUploadImage}
                      onChange={(value) => {
                        setContent(value);
                      }}
                      className="[&_.is-empty]:text-muted-foreground min-h-[120px] py-3 px-4 border rounded-md w-full"
                    />
                  </div>
                  <div className="grid w-full gap-x-8 gap-y-4 grid-cols-1 md:grid-cols-2">
                    <Select
                      name="priority"
                      label="Priority"
                      options={maintenanceDispatchPriority.map((priority) => ({
                        value: priority,
                        label: (
                          <div className="flex gap-1 items-center">
                            {getPriorityIcon(priority)}
                            <span>{priority}</span>
                          </div>
                        )
                      }))}
                    />
                    <Select
                      name="severity"
                      label="Severity"
                      options={maintenanceSeverity.map((s) => ({
                        value: s,
                        label: getSeverityLabel(s)
                      }))}
                      onChange={(option) => {
                        if (option?.value) {
                          setSeverity(
                            option.value as (typeof maintenanceSeverity)[number]
                          );
                        }
                      }}
                    />
                    {severity === "Operator Performed" && (
                      <>
                        <DateTimePicker
                          name="actualStartTimeDisplay"
                          label="Start Time"
                          defaultValue={actualStartTime}
                          onChange={(value) => {
                            if (value) setActualStartTime(value.toISOString());
                          }}
                        />
                        <DateTimePicker
                          name="actualEndTimeDisplay"
                          label="End Time"
                          onChange={(value) => {
                            if (value) setActualEndTime(value.toISOString());
                          }}
                        />
                      </>
                    )}
                    <Boolean
                      name="isFailure"
                      label="Failure"
                      onChange={(checked) => setIsFailure(checked)}
                    />
                    {isFailure &&
                      failureModes.length > 0 &&
                      (severity === "Operator Performed" ? (
                        <Select
                          name="actualFailureModeId"
                          label="Actual Failure Mode"
                          options={failureModes.map((mode) => ({
                            value: mode.id,
                            label: mode.name
                          }))}
                          isClearable
                        />
                      ) : (
                        <Select
                          name="suspectedFailureModeId"
                          label="Suspected Failure Mode"
                          options={failureModes.map((mode) => ({
                            value: mode.id,
                            label: mode.name
                          }))}
                          isClearable
                        />
                      ))}
                  </div>
                </VStack>
              </ModalBody>
              <ModalFooter>
                <HStack>
                  <Button variant="secondary" onClick={onClose}>
                    Cancel
                  </Button>
                  <Submit>Create Dispatch</Submit>
                </HStack>
              </ModalFooter>
            </ValidatedForm>
          </ModalContent>
        </Modal>
      )}
    </>
  );
}
