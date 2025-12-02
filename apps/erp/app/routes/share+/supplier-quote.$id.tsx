import { getCarbonServiceRole } from "@carbon/auth";
import { Input, TextArea, ValidatedForm } from "@carbon/form";
import type { JSONContent } from "@carbon/react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  generateHTML,
  Heading,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  ModalTitle,
  RadioGroup,
  RadioGroupItem,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure,
  VStack,
} from "@carbon/react";
import { useMode } from "@carbon/remix";
import { formatDate } from "@carbon/utils";
import { useLocale } from "@react-aria/i18n";
import { useFetcher, useLoaderData, useParams } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import { motion } from "framer-motion";
import MotionNumber from "motion-number";
import { useEffect, useRef, useState } from "react";
import { LuChevronRight, LuCircleX, LuImage } from "react-icons/lu";
import type { Company } from "~/modules/settings";
import { getCompany, getCompanySettings } from "~/modules/settings";
import { getBase64ImageFromSupabase } from "~/modules/shared";
import { path } from "~/utils/path";
import {
  getSupplierQuoteByExternalId,
  getSupplierQuoteLines,
  getSupplierQuoteLinePricesByQuoteId,
} from "~/modules/purchasing/purchasing.service";
import type {
  SupplierQuote,
  SupplierQuoteLine,
  SupplierQuoteLinePrice,
} from "~/modules/purchasing/types";
import type { action } from "~/routes/api+/purchasing.digital-quote.$id";
import { externalSupplierQuoteValidator } from "~/modules/purchasing/purchasing.models";
import type { Dispatch, SetStateAction } from "react";

export const meta = () => {
  return [{ title: "Supplier Quote" }];
};

enum QuoteState {
  Valid,
  Expired,
  NotFound,
}

type SelectedLine = {
  quantity: number;
  supplierUnitPrice: number;
  unitPrice: number;
  leadTime: number;
  shippingCost: number;
  supplierShippingCost: number;
  supplierTaxAmount: number;
};

const deselectedLine: SelectedLine = {
  quantity: 0,
  supplierUnitPrice: 0,
  unitPrice: 0,
  leadTime: 0,
  shippingCost: 0,
  supplierShippingCost: 0,
  supplierTaxAmount: 0,
};

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { id } = params;
  if (!id) {
    return json({
      state: QuoteState.NotFound,
      data: null,
    });
  }

  const serviceRole = getCarbonServiceRole();
  const quote = await getSupplierQuoteByExternalId(serviceRole, id);

  if (quote.error) {
    return json({
      state: QuoteState.NotFound,
      data: null,
    });
  }

  // Update lastAccessedAt on externalLink when the page is loaded
  if (quote.data.externalLinkId) {
    await serviceRole
      .from("externalLink")
      .update({
        lastAccessedAt: new Date().toISOString(),
      })
      .eq("id", quote.data.externalLinkId);
  }

  if (
    quote.data.expirationDate &&
    new Date(quote.data.expirationDate) < new Date() &&
    quote.data.status === "Sent"
  ) {
    return json({
      state: QuoteState.Expired,
      data: null,
    });
  }

  const [company, companySettings, quoteLines, quoteLinePrices] =
    await Promise.all([
      getCompany(serviceRole, quote.data.companyId),
      getCompanySettings(serviceRole, quote.data.companyId),
      getSupplierQuoteLines(serviceRole, quote.data.id),
      getSupplierQuoteLinePricesByQuoteId(serviceRole, quote.data.id),
    ]);

  const thumbnailPaths = quoteLines.data?.reduce<Record<string, string | null>>(
    (acc, line) => {
      if (line.thumbnailPath) {
        acc[line.id!] = line.thumbnailPath;
      }
      return acc;
    },
    {}
  );

  const thumbnails: Record<string, string | null> =
    (thumbnailPaths
      ? await Promise.all(
          Object.entries(thumbnailPaths).map(([id, path]) => {
            if (!path) {
              return null;
            }
            return getBase64ImageFromSupabase(serviceRole, path).then(
              (data) => ({
                id,
                data,
              })
            );
          })
        )
      : []
    )?.reduce<Record<string, string | null>>((acc, thumbnail) => {
      if (thumbnail) {
        acc[thumbnail.id] = thumbnail.data;
      }
      return acc;
    }, {}) ?? {};

  return json({
    state: QuoteState.Valid,
    data: {
      quote: quote.data,
      company: company.data,
      companySettings: companySettings.data,
      quoteLines: quoteLines.data ?? [],
      thumbnails: thumbnails,
      quoteLinePrices: quoteLinePrices.data ?? [],
    },
  });
}

const Header = ({ company, quote }: { company: any; quote: any }) => (
  <CardHeader className="flex flex-col sm:flex-row items-start sm:items-start justify-between space-y-4 sm:space-y-2 pb-7">
    <div className="flex items-center space-x-4">
      <div>
        <CardTitle className="text-3xl">{company?.name ?? ""}</CardTitle>
        {quote?.supplierQuoteId && (
          <p className="text-lg text-muted-foreground">
            {quote.supplierQuoteId}
          </p>
        )}
        {quote?.expirationDate && (
          <p className="text-lg text-muted-foreground">
            Expires {formatDate(quote.expirationDate)}
          </p>
        )}
      </div>
    </div>
  </CardHeader>
);

const LineItems = ({
  currencyCode,
  locale,
  selectedLines,
  setSelectedLines,
  quoteStatus,
  quoteLinePrices,
}: {
  currencyCode: string;
  locale: string;
  selectedLines: Record<string, SelectedLine>;
  setSelectedLines: Dispatch<SetStateAction<Record<string, SelectedLine>>>;
  quoteStatus: SupplierQuote["status"];
  quoteLinePrices: SupplierQuoteLinePrice[];
}) => {
  const { quoteLines, thumbnails } = useLoaderData<typeof loader>().data!;
  const [openItems, setOpenItems] = useState<string[]>(() =>
    Array.isArray(quoteLines) && quoteLines.length > 0
      ? quoteLines.map((line) => line.id!).filter(Boolean)
      : []
  );

  useEffect(() => {
    Object.entries(selectedLines).forEach(([lineId, line]) => {
      if (line.quantity === 0 && openItems.includes(lineId)) {
        setOpenItems((prev) => prev.filter((item) => item !== lineId));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLines]);

  const toggleOpen = (id: string) => {
    setOpenItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <VStack spacing={8} className="w-full">
      {quoteLines?.map((line) => {
        if (!line.id) return null;

        return (
          <motion.div
            key={line.id}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="border-b border-input py-6 w-full"
          >
            <HStack spacing={4} className="items-start">
              {thumbnails[line.id] ? (
                <img
                  alt={line.itemReadableId!}
                  className="w-24 h-24 bg-gradient-to-bl from-muted to-muted/40 rounded-lg"
                  src={thumbnails[line.id] ?? undefined}
                />
              ) : (
                <div className="w-24 h-24 bg-gradient-to-bl from-muted to-muted/40 rounded-lg p-4">
                  <LuImage className="w-16 h-16 text-muted-foreground" />
                </div>
              )}

              <VStack spacing={0} className="w-full">
                <div
                  className="flex flex-col cursor-pointer w-full"
                  onClick={() => toggleOpen(line.id!)}
                >
                  <div className="flex items-center gap-x-4 justify-between flex-grow">
                    <Heading>{line.itemReadableId}</Heading>
                    <HStack spacing={4}>
                      {selectedLines[line.id!]?.quantity > 0 && (
                        <MotionNumber
                          className="font-bold text-xl"
                          value={
                            selectedLines[line.id!].supplierUnitPrice *
                              selectedLines[line.id!].quantity +
                            selectedLines[line.id!].supplierShippingCost +
                            selectedLines[line.id!].supplierTaxAmount
                          }
                          format={{
                            style: "currency",
                            currency: currencyCode,
                          }}
                          locales={locale}
                        />
                      )}
                      <motion.div
                        animate={{
                          rotate: openItems.includes(line.id!) ? 90 : 0,
                        }}
                        transition={{ duration: 0.3 }}
                      >
                        <LuChevronRight size={24} />
                      </motion.div>
                    </HStack>
                  </div>
                  <span className="text-muted-foreground text-base truncate">
                    {line.description}
                  </span>
                  {Object.keys(line.externalNotes ?? {}).length > 0 && (
                    <div
                      className="prose dark:prose-invert mt-2 text-muted-foreground"
                      dangerouslySetInnerHTML={{
                        __html: generateHTML(line.externalNotes as JSONContent),
                      }}
                    />
                  )}
                </div>
              </VStack>
            </HStack>

            <motion.div
              initial="collapsed"
              animate={openItems.includes(line.id) ? "open" : "collapsed"}
              variants={{
                open: { opacity: 1, height: "auto", marginTop: 16 },
                collapsed: { opacity: 0, height: 0, marginTop: 0 },
              }}
              transition={{ duration: 0.3 }}
              className="w-full overflow-hidden"
            >
              <LinePricing
                line={line}
                currencyCode={currencyCode}
                locale={locale}
                selectedLine={selectedLines[line.id] || deselectedLine}
                setSelectedLines={setSelectedLines}
                quoteStatus={quoteStatus}
                quoteLinePrices={quoteLinePrices}
              />
            </motion.div>
          </motion.div>
        );
      })}
    </VStack>
  );
};

const LinePricing = ({
  line,
  currencyCode,
  locale,
  selectedLine,
  setSelectedLines,
  quoteStatus,
  quoteLinePrices,
}: {
  line: SupplierQuoteLine;
  currencyCode: string;
  locale: string;
  selectedLine: SelectedLine;
  setSelectedLines: Dispatch<SetStateAction<Record<string, SelectedLine>>>;
  quoteStatus: SupplierQuote["status"];
  quoteLinePrices: SupplierQuoteLinePrice[];
}) => {
  const pricingOptions =
    quoteLinePrices
      ?.filter((price) => price.supplierQuoteLineId === line.id)
      .sort((a, b) => a.quantity - b.quantity) ?? [];

  const [selectedValue, setSelectedValue] = useState<string | null>(
    selectedLine?.quantity?.toString() ?? null
  );

  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
  });

  return (
    <VStack spacing={4}>
      <RadioGroup
        className="w-full"
        value={selectedValue ?? undefined}
        disabled={[
          "Ordered",
          "Partial",
          "Expired",
          "Cancelled",
          "Declined",
        ].includes(quoteStatus || "")}
        onValueChange={(value) => {
          if (value === "0") {
            setSelectedLines((prev) => ({
              ...prev,
              [line.id!]: deselectedLine,
            }));
            setSelectedValue("0");
            return;
          }

          const selectedOption = pricingOptions.find(
            (opt) => opt.quantity.toString() === value
          );

          if (selectedOption) {
            setSelectedLines((prev) => ({
              ...prev,
              [line.id!]: {
                quantity: selectedOption.quantity,
                supplierUnitPrice: selectedOption.supplierUnitPrice ?? 0,
                unitPrice: selectedOption.unitPrice ?? 0,
                leadTime: selectedOption.leadTime ?? 0,
                shippingCost: selectedOption.shippingCost ?? 0,
                supplierShippingCost: selectedOption.supplierShippingCost ?? 0,
                supplierTaxAmount: selectedOption.supplierTaxAmount ?? 0,
              },
            }));
            setSelectedValue(value);
          }
        }}
      >
        <Table>
          <Thead>
            <Tr>
              <Th />
              <Th className="w-[100px]">Quantity</Th>
              <Th>Unit Price</Th>
              <Th>Lead Time</Th>
              <Th>Total</Th>
            </Tr>
          </Thead>
          <Tbody>
            {!Array.isArray(pricingOptions) || pricingOptions.length === 0 ? (
              <Tr>
                <Td colSpan={5} className="text-center py-8">
                  No pricing options found
                </Td>
              </Tr>
            ) : (
              <>
                {pricingOptions.map((option, index) => (
                  <Tr key={index}>
                    <Td>
                      <RadioGroupItem
                        value={option.quantity.toString()}
                        id={`${line.id}:${option.quantity.toString()}`}
                      />
                      <label
                        htmlFor={`${line.id}:${option.quantity.toString()}`}
                        className="sr-only"
                      >
                        {option.quantity}
                      </label>
                    </Td>
                    <Td>{option.quantity}</Td>
                    <Td>{formatter.format(option.supplierUnitPrice ?? 0)}</Td>
                    <Td>
                      {new Intl.NumberFormat(locale, {
                        style: "unit",
                        unit: "day",
                      }).format(option.leadTime ?? 0)}
                    </Td>
                    <Td>
                      {formatter.format(
                        (option.supplierUnitPrice ?? 0) * option.quantity
                      )}
                    </Td>
                  </Tr>
                ))}
              </>
            )}
          </Tbody>
        </Table>
      </RadioGroup>

      {selectedLine.quantity !== 0 && (
        <div className="w-full">
          <Table>
            <Tbody>
              <Tr key="extended-price" className="border-b border-border">
                <Td>Extended Price</Td>
                <Td className="text-right">
                  <MotionNumber
                    value={
                      selectedLine.supplierUnitPrice * selectedLine.quantity
                    }
                    format={{ style: "currency", currency: currencyCode }}
                    locales={locale}
                  />
                </Td>
              </Tr>
              {selectedLine.supplierShippingCost > 0 && (
                <Tr key="shipping" className="border-b border-border">
                  <Td>Shipping</Td>
                  <Td className="text-right">
                    <MotionNumber
                      value={selectedLine.supplierShippingCost}
                      format={{ style: "currency", currency: currencyCode }}
                      locales={locale}
                    />
                  </Td>
                </Tr>
              )}
              {selectedLine.supplierTaxAmount > 0 && (
                <Tr key="tax" className="border-b border-border">
                  <Td>Tax</Td>
                  <Td className="text-right">
                    <MotionNumber
                      value={selectedLine.supplierTaxAmount}
                      format={{ style: "currency", currency: currencyCode }}
                      locales={locale}
                    />
                  </Td>
                </Tr>
              )}
              <Tr key="total" className="font-bold">
                <Td>Total</Td>
                <Td className="text-right">
                  <MotionNumber
                    value={
                      selectedLine.supplierUnitPrice * selectedLine.quantity +
                      selectedLine.supplierShippingCost +
                      selectedLine.supplierTaxAmount
                    }
                    format={{ style: "currency", currency: currencyCode }}
                    locales={locale}
                  />
                </Td>
              </Tr>
            </Tbody>
          </Table>
        </div>
      )}

      {selectedLine.quantity !== 0 && (
        <HStack spacing={2} className="w-full justify-end items-center">
          <Button
            variant="secondary"
            leftIcon={<LuCircleX />}
            onClick={() => {
              setSelectedValue("0");
              setSelectedLines((prev) => ({
                ...prev,
                [line.id!]: deselectedLine,
              }));
            }}
          >
            Remove
          </Button>
        </HStack>
      )}
    </VStack>
  );
};

const Quote = ({
  data,
}: {
  data: {
    company: Company;
    quote: SupplierQuote;
    quoteLines: SupplierQuoteLine[];
    quoteLinePrices: SupplierQuoteLinePrice[];
  };
}) => {
  const { company, quote, quoteLines, quoteLinePrices } = data;
  const { locale } = useLocale();
  const { id } = useParams();
  if (!id) throw new Error("Could not find external quote id");

  const submitModal = useDisclosure();
  const declineModal = useDisclosure();
  const fetcher = useFetcher<typeof action>();
  const submitted = useRef<boolean>(false);
  const mode = useMode();
  const logo = mode === "dark" ? company?.logoDark : company?.logoLight;

  useEffect(() => {
    if (fetcher.state === "idle" && submitted.current) {
      submitModal.onClose();
      declineModal.onClose();
      submitted.current = false;
    }
  }, [fetcher.state, submitModal, declineModal]);

  // Initialize selected lines from loaded prices
  const [selectedLines, setSelectedLines] = useState<
    Record<string, SelectedLine>
  >(() => {
    return (
      quoteLines?.reduce<Record<string, SelectedLine>>(
        (acc, line: SupplierQuoteLine) => {
          if (!line.id) {
            return acc;
          }

          // Find the first available price option for this line
          const price = quoteLinePrices?.find(
            (p: SupplierQuoteLinePrice) =>
              p.supplierQuoteLineId === line.id &&
              line.quantity?.includes(p.quantity)
          );

          if (!price) {
            acc[line.id] = deselectedLine;
            return acc;
          }

          acc[line.id] = {
            quantity: price.quantity ?? 0,
            supplierUnitPrice: price.supplierUnitPrice ?? 0,
            unitPrice: price.unitPrice ?? 0,
            leadTime: price.leadTime ?? 0,
            shippingCost: price.shippingCost ?? 0,
            supplierShippingCost: price.supplierShippingCost ?? 0,
            supplierTaxAmount: price.supplierTaxAmount ?? 0,
          };
          return acc;
        },
        {}
      ) ?? {}
    );
  });

  // Calculate grand total for display (only selected lines)
  const grandTotal = Object.values(selectedLines).reduce((acc, line) => {
    if (line.quantity === 0) return acc;
    return (
      acc +
      line.supplierUnitPrice * line.quantity +
      line.supplierShippingCost +
      line.supplierTaxAmount
    );
  }, 0);

  return (
    <VStack spacing={8} className="w-full items-center p-2 md:p-8">
      {logo && (
        <img
          src={logo}
          alt={company?.name ?? ""}
          className="w-auto mx-auto max-w-5xl"
        />
      )}
      <Card className="w-full max-w-5xl mx-auto">
        <div className="w-full text-center">
          {quote?.status === "Expired" && <Badge variant="red">Expired</Badge>}
        </div>
        <Header company={company} quote={quote} />
        <CardContent>
          <LineItems
            currencyCode={quote.currencyCode ?? "USD"}
            locale={locale}
            selectedLines={selectedLines}
            setSelectedLines={setSelectedLines}
            quoteStatus={quote.status}
            quoteLinePrices={quoteLinePrices}
          />

          <div className="mt-8 border-t pt-4">
            <HStack className="justify-between text-xl font-bold w-full">
              <span>Estimated Total:</span>
              <MotionNumber
                value={grandTotal}
                format={{
                  style: "currency",
                  currency: quote.currencyCode ?? "USD",
                }}
                locales={locale}
              />
            </HStack>
          </div>

          <div className="flex flex-col gap-2">
            {quote?.status === "Sent" && (
              <VStack className="w-full mt-8 gap-4">
                <Button
                  onClick={submitModal.onOpen}
                  size="lg"
                  variant="primary"
                  isDisabled={grandTotal === 0}
                  className="w-full text-lg"
                >
                  Submit Quote
                </Button>{" "}
                <Button
                  onClick={declineModal.onOpen}
                  size="lg"
                  variant="secondary"
                  className="w-full text-lg"
                >
                  Decline Quote
                </Button>
              </VStack>
            )}
          </div>
        </CardContent>
      </Card>

      {submitModal.isOpen && (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) submitModal.onClose();
          }}
        >
          <ModalOverlay />
          <ModalContent>
            <ValidatedForm
              validator={externalSupplierQuoteValidator}
              action={path.to.api.digitalSupplierQuote(id)}
              method="post"
              fetcher={fetcher}
              onSubmit={() => {
                submitted.current = true;
              }}
            >
              <ModalHeader>
                <ModalTitle>Submit Quote</ModalTitle>
                <ModalDescription>
                  Are you sure you want to submit the updated pricing?
                </ModalDescription>
              </ModalHeader>
              <ModalBody>
                <input type="hidden" name="intent" value="submit" />
                <input
                  type="hidden"
                  name="selectedLines"
                  value={JSON.stringify(selectedLines)}
                />
                <div className="space-y-4 py-4">
                  <Input
                    name="digitalSupplierQuoteSubmittedBy"
                    label="Your Name"
                    placeholder="Enter your name"
                  />
                  <Input
                    name="digitalSupplierQuoteSubmittedByEmail"
                    label="Your Email"
                    placeholder="Enter your email"
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onClick={submitModal.onClose}>
                  Cancel
                </Button>
                <Button
                  isLoading={fetcher.state !== "idle"}
                  isDisabled={fetcher.state !== "idle"}
                  type="submit"
                >
                  Submit
                </Button>
              </ModalFooter>
            </ValidatedForm>
          </ModalContent>
        </Modal>
      )}

      {declineModal.isOpen && (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) declineModal.onClose();
          }}
        >
          <ModalOverlay />
          <ModalContent>
            <ValidatedForm
              validator={externalSupplierQuoteValidator}
              action={path.to.api.digitalSupplierQuote(id)}
              method="post"
              fetcher={fetcher}
              onSubmit={() => {
                submitted.current = true;
              }}
            >
              <ModalHeader>
                <ModalTitle>Decline Quote</ModalTitle>
                <ModalDescription>
                  Are you sure you want to decline this quote?
                </ModalDescription>
              </ModalHeader>
              <ModalBody>
                <input type="hidden" name="intent" value="decline" />
                <div className="space-y-4 py-4">
                  <TextArea
                    name="note"
                    label="Reason for declining (Optional)"
                  />
                  <Input
                    name="digitalSupplierQuoteSubmittedBy"
                    label="Your Name"
                    placeholder="Enter your name"
                  />
                  <Input
                    name="digitalSupplierQuoteSubmittedByEmail"
                    label="Your Email"
                    placeholder="Enter your email"
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onClick={declineModal.onClose}>
                  Cancel
                </Button>
                <Button
                  isLoading={fetcher.state !== "idle"}
                  isDisabled={fetcher.state !== "idle"}
                  type="submit"
                  variant="destructive"
                >
                  Decline Quote
                </Button>
              </ModalFooter>
            </ValidatedForm>
          </ModalContent>
        </Modal>
      )}
    </VStack>
  );
};

export const ErrorMessage = ({
  title,
  message,
}: {
  title: string;
  message: string;
}) => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-lg text-muted-foreground">{message}</p>
    </div>
  );
};

export default function ExternalSupplierQuote() {
  const { state, data } = useLoaderData<typeof loader>();

  switch (state) {
    case QuoteState.Valid:
      if (data) {
        // TODO: Remove any (gaurav)
        return <Quote data={data as any} />;
      }
      return (
        <ErrorMessage
          title="Quote not found"
          message="Oops! The link you're trying to access is not valid."
        />
      );
    case QuoteState.Expired:
      return (
        <ErrorMessage
          title="Quote expired"
          message="Oops! The link you're trying to access has expired or is no longer valid."
        />
      );
    case QuoteState.NotFound:
      return (
        <ErrorMessage
          title="Quote not found"
          message="Oops! The link you're trying to access is not valid."
        />
      );
  }
}
