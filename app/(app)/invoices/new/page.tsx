import { redirect } from "next/navigation";

// Creating a tax invoice is now one option in the unified new-document flow.
export default function NewInvoicePage() {
  redirect("/documents/new?type=TAX_INVOICE");
}
