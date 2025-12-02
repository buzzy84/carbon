import {
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
} from "@carbon/react";

import { Link, useFetcher, useParams } from "@remix-run/react";
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
import SupplierQuoteFinalizeModal from "./SupplierQuoteFinalizeModal";

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

  const finalizeFetcher = useFetcher<{}>();
  const statusFetcher = useFetcher<{}>();

  const hasLines = routeData?.lines && routeData.lines.length > 0;

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
            {routeData?.quote?.status === "Sent" &&
            (routeData?.quote as any)?.externalLinkId ? (
              <Button
                onClick={shareModal.onOpen}
                leftIcon={<LuShare />}
                variant="secondary"
              >
                Share
              </Button>
            ) : (
              (routeData?.quote as any)?.externalLinkId && (
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
              )
            )}

            <Button
              onClick={finalizeModal.onOpen}
              isLoading={finalizeFetcher.state !== "idle"}
              isDisabled={
                routeData?.quote?.status !== "Active" ||
                finalizeFetcher.state !== "idle" ||
                !permissions.can("update", "purchasing") ||
                !hasLines
              }
              variant={
                routeData?.quote?.status === "Active" ? "primary" : "secondary"
              }
              leftIcon={<LuCheckCheck />}
            >
              Finalize
            </Button>

            <Button
              isDisabled={
                routeData?.quote?.status !== "Sent" ||
                !permissions.can("update", "purchasing")
              }
              leftIcon={<LuShoppingCart />}
              onClick={convertToOrderModal.onOpen}
            >
              Order
            </Button>

            {routeData?.quote?.status === "Active" ? (
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
            ) : (
              <statusFetcher.Form
                method="post"
                action={path.to.supplierQuoteStatus(id)}
              >
                <input type="hidden" name="status" value="Active" />
                <Button
                  isDisabled={
                    statusFetcher.state !== "idle" ||
                    !permissions.can("update", "purchasing")
                  }
                  isLoading={
                    statusFetcher.state !== "idle" &&
                    statusFetcher.formData?.get("status") === "Active"
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
          lines={routeData?.lines ?? []}
          pricing={routeData?.prices ?? []}
          onClose={finalizeModal.onClose}
          fetcher={finalizeFetcher}
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
