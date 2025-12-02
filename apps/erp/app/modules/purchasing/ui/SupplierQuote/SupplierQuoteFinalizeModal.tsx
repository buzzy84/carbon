import { useCarbon } from "@carbon/auth";
import { ValidatedForm } from "@carbon/form";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  useMount,
  VStack,
} from "@carbon/react";
import type { FetcherWithComponents } from "@remix-run/react";
import { useParams } from "@remix-run/react";
import { useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { SelectControlled, SupplierContact } from "~/components/Form";
import { useIntegrations } from "~/hooks/useIntegrations";
import { path } from "~/utils/path";
import { supplierQuoteFinalizeValidator } from "../../purchasing.models";
import {
  getSupplierQuoteLinePricesByQuoteId,
  getSupplierQuoteLines,
} from "../../purchasing.service";
import type {
  SupplierQuote,
  SupplierQuoteLine,
  SupplierQuoteLinePrice,
} from "../../types";

type SupplierQuoteFinalizeModalProps = {
  onClose: () => void;
  quote?: SupplierQuote;
  lines: SupplierQuoteLine[];
  pricing: SupplierQuoteLinePrice[];
  fetcher: FetcherWithComponents<{}>;
};

const SupplierQuoteFinalizeModal = ({
  quote,
  onClose,
  fetcher,
  pricing,
}: SupplierQuoteFinalizeModalProps) => {
  const { id } = useParams();
  if (!id) throw new Error("id not found");

  const integrations = useIntegrations();
  const canEmail = integrations.has("resend");
  const { carbon } = useCarbon();

  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<SupplierQuoteLine[]>([]);
  const [prices, setPrices] = useState<SupplierQuoteLinePrice[]>([]);

  const fetchQuoteData = async () => {
    if (!carbon) return;

    const [linesData, pricesData] = await Promise.all([
      getSupplierQuoteLines(carbon, id),
      getSupplierQuoteLinePricesByQuoteId(carbon, id),
    ]);
    setLines(linesData.data ?? []);
    setPrices(pricesData.data ?? []);

    setLoading(false);
  };

  useMount(() => {
    fetchQuoteData();
  });

  const [notificationType, setNotificationType] = useState(
    canEmail ? "Email" : "Download"
  );

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
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent>
        <ValidatedForm
          method="post"
          validator={supplierQuoteFinalizeValidator}
          action={path.to.supplierQuoteFinalize(id)}
          onSubmit={onClose}
          defaultValues={{
            notification: notificationType as "Email" | "None",
            supplierContact: quote?.supplierContactId ?? undefined,
          }}
          fetcher={fetcher}
        >
          <ModalHeader>
            <ModalTitle>{`Finalize ${quote?.supplierQuoteId}`}</ModalTitle>
            <ModalDescription>
              Are you sure you want to finalize the supplier quote?
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              {warningLineReadableIds.length > 0 && (
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
              {canEmail && (
                <SelectControlled
                  label="Send Via"
                  name="notification"
                  options={[
                    {
                      label: "None",
                      value: "None",
                    },
                    {
                      label: "Email",
                      value: "Email",
                    },
                  ]}
                  value={notificationType}
                  onChange={(t) => {
                    if (t) setNotificationType(t.value);
                  }}
                />
              )}
              {notificationType === "Email" && (
                <SupplierContact
                  name="supplierContact"
                  supplier={quote?.supplierId ?? undefined}
                />
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button isDisabled={loading} type="submit">
              Finalize
            </Button>
          </ModalFooter>
        </ValidatedForm>
      </ModalContent>
    </Modal>
  );
};

export default SupplierQuoteFinalizeModal;
