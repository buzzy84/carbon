import { useCarbon } from "@carbon/auth";
import { Select, Submit, ValidatedForm } from "@carbon/form";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Copy,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIcon,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Heading,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  toast,
  useDisclosure,
  useMount,
  VStack
} from "@carbon/react";
import { useState } from "react";
import {
  LuChevronDown,
  LuCircleX,
  LuEllipsisVertical,
  LuEye,
  LuGitCompare,
  LuLoaderCircle,
  LuPanelLeft,
  LuPanelRight,
  LuSend,
  LuShare2,
  LuTrash,
  LuTriangleAlert
} from "react-icons/lu";
import type { FetcherWithComponents } from "react-router";
import { Link, useFetcher, useParams } from "react-router";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { usePanels } from "~/components/Layout";
import ConfirmDelete from "~/components/Modals/ConfirmDelete";
import { usePermissions, useRouteData, useUser } from "~/hooks";
import { useIntegrations } from "~/hooks/useIntegrations";
import { path } from "~/utils/path";
import type { PurchasingRFQ, PurchasingRFQLine } from "../../types";
import { SupplierQuoteCompareDrawer } from "../SupplierQuote";
import FinalizeRFQModal from "./FinalizeRFQModal";
import PurchasingRFQStatus from "./PurchasingRFQStatus";

const PurchasingRFQHeader = () => {
  const { rfqId } = useParams();
  if (!rfqId) throw new Error("rfqId not found");

  const finalizeModal = useDisclosure();
  const requiresSuppliersAlert = useDisclosure();
  const cancelReasonModal = useDisclosure();
  const deleteRFQModal = useDisclosure();
  const compareQuotesModal = useDisclosure();
  const { toggleExplorer, toggleProperties } = usePanels();

  const permissions = usePermissions();
  const integrations = useIntegrations();
  const canEmail = integrations.has("resend");
  const finalizeFetcher = useFetcher<{ error: string | null }>();

  const routeData = useRouteData<{
    rfqSummary: PurchasingRFQ;
    lines: PurchasingRFQLine[];
    suppliers: {
      id: string;
      supplierId: string;
      supplier: { id: string; name: string };
      quoteExternalLinkId?: string;
    }[];
    linkedQuotes: unknown[];
  }>(path.to.purchasingRfq(rfqId));

  const status = routeData?.rfqSummary?.status ?? "Draft";

  const statusFetcher = useFetcher<{}>();

  const hasSuppliers = (routeData?.suppliers?.length ?? 0) > 0;
  const activeLinkedQuotes = (routeData?.linkedQuotes ?? []).filter(
    (q: any) => q.status === "Active"
  );
  const canCompareQuotes = activeLinkedQuotes.length > 1;

  return (
    <div className="flex flex-shrink-0 items-center justify-between p-2 bg-card border-b h-[50px] overflow-x-auto scrollbar-hide ">
      <HStack className="w-full justify-between">
        <HStack>
          <IconButton
            aria-label="Toggle Explorer"
            icon={<LuPanelLeft />}
            onClick={toggleExplorer}
            variant="ghost"
          />
          <Link to={path.to.purchasingRfqDetails(rfqId)}>
            <Heading size="h4" className="flex items-center gap-2">
              <span>{routeData?.rfqSummary?.rfqId}</span>
            </Heading>
          </Link>
          <Copy text={routeData?.rfqSummary?.rfqId ?? ""} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                aria-label="More options"
                icon={<LuEllipsisVertical />}
                variant="secondary"
                size="sm"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                disabled={
                  !permissions.can("delete", "purchasing") ||
                  !permissions.is("employee")
                }
                destructive
                onClick={deleteRFQModal.onOpen}
              >
                <DropdownMenuIcon icon={<LuTrash />} />
                Delete RFQ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PurchasingRFQStatus status={routeData?.rfqSummary?.status} />
        </HStack>
        <HStack>
          {/* Preview Button - for Draft status */}
          {status === "Draft" && (
            <Button variant="secondary" leftIcon={<LuEye />} asChild>
              <Link to={path.to.purchasingRfqPreview(rfqId)} target="_blank">
                Preview
              </Link>
            </Button>
          )}

          {/* Share Dropdown - for Requested status with external links */}
          {status === "Requested" && hasSuppliers && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  leftIcon={<LuShare2 />}
                  rightIcon={<LuChevronDown />}
                >
                  Share
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {routeData?.suppliers?.map((supplier) => (
                  <DropdownMenuItem
                    key={supplier.id}
                    disabled={!supplier.quoteExternalLinkId}
                    onClick={() => {
                      if (supplier.quoteExternalLinkId) {
                        window.open(
                          path.to.externalSupplierQuote(
                            supplier.quoteExternalLinkId
                          ),
                          "_blank"
                        );
                      }
                    }}
                  >
                    <DropdownMenuIcon icon={<LuShare2 />} />
                    {supplier.supplier.name}
                    {supplier.quoteExternalLinkId && (
                      <Copy
                        className="ml-2"
                        text={`${window.location.origin}${path.to.externalSupplierQuote(supplier.quoteExternalLinkId)}`}
                      />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {hasSuppliers ? (
            canEmail ? (
              // With Resend: Open modal for contact selection
              <Button
                isDisabled={
                  status !== "Draft" ||
                  routeData?.lines?.length === 0 ||
                  !permissions.can("create", "purchasing")
                }
                leftIcon={<LuSend />}
                variant={status === "Draft" ? "primary" : "secondary"}
                onClick={finalizeModal.onOpen}
              >
                Finalize
              </Button>
            ) : (
              // Without Resend: Submit directly
              <finalizeFetcher.Form
                method="post"
                action={path.to.purchasingRfqFinalize(rfqId)}
              >
                {routeData?.suppliers?.map((supplier, index) => (
                  <span key={supplier.id}>
                    <input
                      type="hidden"
                      name={`suppliers[${index}].supplierId`}
                      value={supplier.supplierId}
                    />
                    <input
                      type="hidden"
                      name={`suppliers[${index}].rfqSupplierId`}
                      value={supplier.id}
                    />
                  </span>
                ))}
                <Button
                  type="submit"
                  isDisabled={
                    status !== "Draft" ||
                    routeData?.lines?.length === 0 ||
                    !permissions.can("create", "purchasing") ||
                    finalizeFetcher.state !== "idle"
                  }
                  isLoading={finalizeFetcher.state !== "idle"}
                  leftIcon={<LuSend />}
                  variant={status === "Draft" ? "primary" : "secondary"}
                >
                  Finalize
                </Button>
              </finalizeFetcher.Form>
            )
          ) : (
            <Button
              isDisabled={
                status !== "Draft" ||
                routeData?.lines?.length === 0 ||
                !permissions.can("create", "purchasing")
              }
              leftIcon={<LuSend />}
              variant={status === "Draft" ? "primary" : "secondary"}
              onClick={requiresSuppliersAlert.onOpen}
            >
              Finalize
            </Button>
          )}

          {/* Cancel Button - sets status to Closed */}
          <Button
            onClick={cancelReasonModal.onOpen}
            isDisabled={
              status !== "Draft" ||
              statusFetcher.state !== "idle" ||
              !permissions.can("update", "purchasing")
            }
            isLoading={
              statusFetcher.state !== "idle" &&
              statusFetcher.formData?.get("status") === "Closed"
            }
            leftIcon={<LuCircleX />}
            variant="secondary"
          >
            Cancel
          </Button>

          {canCompareQuotes && (
            <Button
              onClick={compareQuotesModal.onOpen}
              leftIcon={<LuGitCompare />}
              variant="secondary"
            >
              Compare Quotes
            </Button>
          )}

          <statusFetcher.Form
            method="post"
            action={path.to.purchasingRfqStatus(rfqId)}
          >
            <input type="hidden" name="status" value="Draft" />
            <Button
              isDisabled={
                status !== "Closed" ||
                statusFetcher.state !== "idle" ||
                !permissions.can("update", "purchasing")
              }
              isLoading={
                statusFetcher.state !== "idle" &&
                statusFetcher.formData?.get("status") === "Draft"
              }
              leftIcon={<LuLoaderCircle />}
              type="submit"
              variant="secondary"
            >
              Reopen
            </Button>
          </statusFetcher.Form>

          <IconButton
            aria-label="Toggle Properties"
            icon={<LuPanelRight />}
            onClick={toggleProperties}
            variant="ghost"
          />
        </HStack>
      </HStack>
      {finalizeModal.isOpen && (
        <FinalizeRFQModal
          lines={routeData?.lines ?? []}
          suppliers={routeData?.suppliers ?? []}
          rfqId={rfqId}
          onClose={finalizeModal.onClose}
        />
      )}
      {requiresSuppliersAlert.isOpen && (
        <RequiresSuppliersAlert onClose={requiresSuppliersAlert.onClose} />
      )}
      {cancelReasonModal.isOpen && (
        <CancelReasonModal
          fetcher={statusFetcher}
          rfqId={rfqId}
          onClose={cancelReasonModal.onClose}
        />
      )}
      {deleteRFQModal.isOpen && (
        <ConfirmDelete
          action={path.to.deletePurchasingRfq(rfqId)}
          isOpen={deleteRFQModal.isOpen}
          name={routeData?.rfqSummary?.rfqId!}
          text={`Are you sure you want to delete ${routeData?.rfqSummary
            ?.rfqId!}? This cannot be undone.`}
          onCancel={() => {
            deleteRFQModal.onClose();
          }}
          onSubmit={() => {
            deleteRFQModal.onClose();
          }}
        />
      )}
      {compareQuotesModal.isOpen && (
        <SupplierQuoteCompareDrawer
          isOpen={compareQuotesModal.isOpen}
          onClose={compareQuotesModal.onClose}
          purchasingRfqId={rfqId}
        />
      )}
    </div>
  );
};

export default PurchasingRFQHeader;

const rfqCancelReasonValidator = z.object({
  status: z.enum(["Closed"]),
  noQuoteReasonId: zfd.text(z.string().optional())
});

function CancelReasonModal({
  fetcher,
  rfqId,
  onClose
}: {
  fetcher: FetcherWithComponents<{}>;
  rfqId: string;
  onClose: () => void;
}) {
  const user = useUser();
  const [cancelReasons, setCancelReasons] = useState<
    {
      label: string;
      value: string;
    }[]
  >([]);
  const { carbon } = useCarbon();
  const fetchReasons = async () => {
    if (!carbon) return;
    const { data, error } = await carbon
      .from("noQuoteReason")
      .select("*")
      .eq("companyId", user.company.id);

    if (error) {
      toast.error("Failed to load cancel reasons");
      return;
    }

    setCancelReasons(
      data?.map((reason) => ({ label: reason.name, value: reason.id })) ?? []
    );
  };

  useMount(() => {
    fetchReasons();
  });

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        <ValidatedForm
          method="post"
          action={path.to.purchasingRfqStatus(rfqId)}
          validator={rfqCancelReasonValidator}
          fetcher={fetcher}
          onSubmit={() => {
            onClose();
          }}
        >
          <ModalHeader>
            <ModalTitle>Cancel RFQ</ModalTitle>
            <ModalDescription>
              Select a reason for cancelling this RFQ.
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <input type="hidden" name="status" value="Closed" />
            <VStack spacing={2}>
              <Select
                name="noQuoteReasonId"
                label="Cancel Reason"
                options={cancelReasons}
              />
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={onClose}>
              Back
            </Button>
            <Submit withBlocker={false}>Cancel RFQ</Submit>
          </ModalFooter>
        </ValidatedForm>
      </ModalContent>
    </Modal>
  );
}

function RequiresSuppliersAlert({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Cannot send RFQ</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Alert variant="destructive">
            <LuTriangleAlert className="h-4 w-4" />
            <AlertTitle>RFQ has no suppliers</AlertTitle>
            <AlertDescription>
              In order to send this RFQ to suppliers, you must first add
              suppliers to the RFQ.
            </AlertDescription>
          </Alert>
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose}>OK</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
