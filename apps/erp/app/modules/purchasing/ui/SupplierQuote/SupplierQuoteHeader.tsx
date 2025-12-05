import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Copy,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIcon,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HStack,
  Heading,
  IconButton,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  InputGroup,
  Input,
  InputRightElement,
  VStack,
} from "@carbon/react";

import { Link, useFetcher, useParams } from "@remix-run/react";
import type { FetcherWithComponents } from "@remix-run/react";
import {
  LuEllipsisVertical,
  LuPanelLeft,
  LuPanelRight,
  LuShoppingCart,
  LuTrash,
  LuShare,
  LuEye,
  LuChevronDown,
  LuExternalLink,
  LuCheckCheck,
  LuCircleStop,
  LuLoaderCircle,
  LuSend,
  LuTriangleAlert,
} from "react-icons/lu";
import { usePanels } from "~/components/Layout";
import ConfirmDelete from "~/components/Modals/ConfirmDelete";

import { usePermissions, useRouteData } from "~/hooks";

import { path } from "~/utils/path";

import type {
  SupplierInteraction,
  SupplierQuote,
  SupplierQuoteLine,
  SupplierQuoteLinePrice,
} from "../../types";
import SupplierQuoteStatus from "./SupplierQuoteStatus";
import SupplierQuoteToOrderDrawer from "./SupplierQuoteToOrderDrawer";
import SupplierQuoteSendModal from "./SupplierQuoteSendModal";

const SupplierQuoteHeader = () => {
  const { id } = useParams();
  if (!id) throw new Error("id not found");

  const { toggleExplorer, toggleProperties } = usePanels();
  const permissions = usePermissions();

  const routeData = useRouteData<{
    quote: SupplierQuote;
    lines: SupplierQuoteLine[];
    interaction: SupplierInteraction;
    prices: SupplierQuoteLinePrice[];
  }>(path.to.supplierQuote(id));

  const isOutsideProcessing =
    routeData?.quote?.supplierQuoteType === "Outside Processing";

  const convertToOrderModal = useDisclosure();
  const deleteModal = useDisclosure();
  const shareModal = useDisclosure();
  const finalizeModal = useDisclosure();
  const sendModal = useDisclosure();

  const finalizeFetcher = useFetcher<{}>();
  const sendFetcher = useFetcher<{}>();
  const statusFetcher = useFetcher<{}>();
  const canShare =
    routeData?.quote.externalLinkId &&
    ["Draft", "Active"].includes(routeData?.quote?.status ?? "");

  const hasLines = routeData?.lines && routeData.lines.length > 0;

  // Validation logic for missing prices and leadtimes
  const lines = routeData?.lines ?? [];
  const prices = routeData?.prices ?? [];

  const linesMissingQuoteLinePrices = lines
    .filter((line) => {
      if (!line.quantity || !Array.isArray(line.quantity)) return false;
      return line.quantity.some(
        (qty) =>
          !prices.some(
            (price) =>
              price.supplierQuoteLineId === line.id && price.quantity === qty
          )
      );
    })
    .map((line) => line.itemReadableId)
    .filter((id): id is string => id !== undefined);

  const linesWithZeroPriceOrLeadTime = prices
    .filter((price) => price.supplierUnitPrice === 0 || price.leadTime === 0)
    .map((price) => {
      const line = lines.find((line) => line.id === price.supplierQuoteLineId);
      return line?.itemReadableId;
    })
    .filter((id): id is string => id !== undefined);

  const warningLineReadableIds = [
    ...new Set([
      ...linesMissingQuoteLinePrices,
      ...linesWithZeroPriceOrLeadTime,
    ]),
  ];

  return (
    <>
      <div className="flex flex-shrink-0 items-center justify-between p-2 bg-card border-b h-[50px] overflow-x-auto scrollbar-hide">
        <HStack className="w-full justify-between">
          <HStack>
            <IconButton
              aria-label="Toggle Explorer"
              icon={<LuPanelLeft />}
              onClick={toggleExplorer}
              variant="ghost"
            />
            <Link to={path.to.supplierQuoteDetails(id)}>
              <Heading size="h4">
                <span>{routeData?.quote?.supplierQuoteId}</span>
              </Heading>
            </Link>
            <Copy text={routeData?.quote?.supplierQuoteId ?? ""} />
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
                  onClick={deleteModal.onOpen}
                >
                  <DropdownMenuIcon icon={<LuTrash />} />
                  Delete Supplier Quote
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SupplierQuoteStatus status={routeData?.quote?.status} />
            {isOutsideProcessing && (
              <Badge variant="default">
                {routeData?.quote?.supplierQuoteType}
              </Badge>
            )}
          </HStack>
          <HStack>
            {canShare && (
              <Button
                leftIcon={<LuShare />}
                variant="secondary"
                onClick={shareModal.onOpen}
              >
                Share
              </Button>
            )}
            {canShare && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    leftIcon={<LuEye />}
                    variant="secondary"
                    rightIcon={<LuChevronDown />}
                  >
                    Preview
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem asChild>
                    <a
                      target="_blank"
                      href={path.to.externalSupplierQuote(
                        (routeData?.quote as any).externalLinkId
                      )}
                      rel="noreferrer"
                    >
                      <DropdownMenuIcon icon={<LuExternalLink />} />
                      Digital Quote
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {routeData?.quote?.status === "Draft" && (
              <Button
                onClick={sendModal.onOpen}
                isLoading={sendFetcher.state !== "idle"}
                isDisabled={
                  sendFetcher.state !== "idle" ||
                  !permissions.can("update", "purchasing") ||
                  !hasLines
                }
                variant="primary"
                leftIcon={<LuSend />}
              >
                Send
              </Button>
            )}

            {routeData?.quote?.status === "Draft" && (
              <Button
                onClick={finalizeModal.onOpen}
                isLoading={finalizeFetcher.state !== "idle"}
                isDisabled={
                  finalizeFetcher.state !== "idle" ||
                  !permissions.can("update", "purchasing") ||
                  !hasLines
                }
                variant="secondary"
                leftIcon={<LuCheckCheck />}
              >
                Finalize
              </Button>
            )}

            {routeData?.quote?.status === "Active" && (
              <Button
                isDisabled={!permissions.can("update", "purchasing")}
                variant="primary"
                leftIcon={<LuShoppingCart />}
                onClick={convertToOrderModal.onOpen}
              >
                Order
              </Button>
            )}

            {routeData?.quote?.status === "Draft" && (
              <statusFetcher.Form
                method="post"
                action={path.to.supplierQuoteStatus(id)}
              >
                <input type="hidden" name="status" value="Cancelled" />
                <Button
                  isDisabled={
                    statusFetcher.state !== "idle" ||
                    !permissions.can("update", "purchasing")
                  }
                  isLoading={
                    statusFetcher.state !== "idle" &&
                    statusFetcher.formData?.get("status") === "Cancelled"
                  }
                  leftIcon={<LuCircleStop />}
                  type="submit"
                  variant="secondary"
                >
                  Cancel
                </Button>
              </statusFetcher.Form>
            )}

            {routeData?.quote?.status !== "Draft" && (
              <statusFetcher.Form
                method="post"
                action={path.to.supplierQuoteStatus(id)}
              >
                <input type="hidden" name="status" value="Draft" />
                <Button
                  isDisabled={
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
            )}

            <IconButton
              aria-label="Toggle Properties"
              icon={<LuPanelRight />}
              onClick={toggleProperties}
              variant="ghost"
            />
          </HStack>
        </HStack>
      </div>

      <SupplierQuoteToOrderDrawer
        isOpen={convertToOrderModal.isOpen}
        onClose={convertToOrderModal.onClose}
        quote={routeData?.quote!}
        lines={routeData?.lines ?? []}
        pricing={routeData?.prices ?? []}
      />
      {deleteModal.isOpen && (
        <ConfirmDelete
          action={path.to.deleteSupplierQuote(id)}
          isOpen={deleteModal.isOpen}
          name={routeData?.quote?.supplierQuoteId ?? "supplier quote"}
          text={`Are you sure you want to delete ${routeData?.quote?.supplierQuoteId}? This cannot be undone.`}
          onCancel={() => {
            deleteModal.onClose();
          }}
          onSubmit={() => {
            deleteModal.onClose();
          }}
        />
      )}
      {finalizeModal.isOpen && (
        <SupplierQuoteFinalizeModal
          quote={routeData?.quote}
          onClose={finalizeModal.onClose}
          fetcher={finalizeFetcher}
          warningLineReadableIds={warningLineReadableIds}
        />
      )}
      {sendModal.isOpen && (
        <SupplierQuoteSendModal
          quote={routeData?.quote}
          onClose={sendModal.onClose}
          fetcher={sendFetcher}
        />
      )}
      {finalizeModal.isOpen && (
        <SupplierQuoteFinalizeModal
          quote={routeData?.quote}
          onClose={finalizeModal.onClose}
          fetcher={sendFetcher}
          warningLineReadableIds={warningLineReadableIds}
        />
      )}
      <ShareQuoteModal
        id={id}
        externalLinkId={(routeData?.quote as any)?.externalLinkId}
        onClose={shareModal.onClose}
        isOpen={shareModal.isOpen}
      />
    </>
  );
};

function SupplierQuoteFinalizeModal({
  quote,
  onClose,
  fetcher,
  warningLineReadableIds,
}: {
  quote?: SupplierQuote;
  onClose: () => void;
  fetcher: FetcherWithComponents<{}>;
  warningLineReadableIds: string[];
}) {
  const { id } = useParams();
  if (!id) throw new Error("id not found");

  const hasErrors = warningLineReadableIds.length > 0;

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Finalize {quote?.supplierQuoteId}</ModalTitle>
          <ModalDescription>
            Are you sure you want to finalize the supplier quote?
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <VStack spacing={4}>
            {hasErrors && (
              <Alert variant="destructive">
                <LuTriangleAlert className="h-4 w-4" />
                <AlertTitle>Lines need prices or lead times</AlertTitle>
                <AlertDescription>
                  The following line items are missing prices or lead times:
                  <ul className="list-disc py-2 pl-4">
                    {warningLineReadableIds.map((readableId) => (
                      <li key={readableId}>{readableId}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <fetcher.Form
            method="post"
            action={path.to.supplierQuoteFinalize(id)}
            onSubmit={onClose}
          >
            <Button
              type="submit"
              isDisabled={hasErrors || fetcher.state !== "idle"}
              isLoading={fetcher.state !== "idle"}
            >
              Finalize
            </Button>
          </fetcher.Form>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function ShareQuoteModal({
  id,
  externalLinkId,
  onClose,
  isOpen,
}: {
  id?: string;
  externalLinkId?: string;
  onClose: () => void;
  isOpen: boolean;
}) {
  if (!externalLinkId) return null;
  if (typeof window === "undefined") return null;

  const digitalQuoteUrl = `${
    window.location.origin
  }${path.to.externalSupplierQuote(externalLinkId)}`;
  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Share Quote</ModalTitle>
          <ModalDescription>
            Copy this link to share the quote with a supplier
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <InputGroup>
            <Input value={digitalQuoteUrl} />
            <InputRightElement>
              <Copy text={digitalQuoteUrl} />
            </InputRightElement>
          </InputGroup>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default SupplierQuoteHeader;
