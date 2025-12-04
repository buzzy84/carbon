import { Status } from "@carbon/react";
import type { supplierQuoteStatusType } from "../../purchasing.models";

type SupplierQuoteStatusProps = {
  status?: (typeof supplierQuoteStatusType)[number] | null;
};

const SupplierQuoteStatus = ({ status }: SupplierQuoteStatusProps) => {
  switch (status) {
    case "Active":
    case "Partial":
    case "Ordered":
      return <Status color="green">{status}</Status>;
    case "Sent":
    case "Submitted":
      return <Status color="yellow">{status}</Status>;
    case "Declined":
      return <Status color="gray">{status}</Status>;
    case "Expired":
      return <Status color="red">{status}</Status>;
    default:
      return null;
  }
};

export default SupplierQuoteStatus;
