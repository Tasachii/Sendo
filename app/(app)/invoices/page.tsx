import { redirect } from "next/navigation";

// The invoice list is now the unified document hub.
export default function InvoicesPage() {
  redirect("/documents");
}
