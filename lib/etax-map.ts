import type { DocType } from "@prisma/client";
import type { ETaxDocument, ETaxLine } from "@/lib/etax";
import { legalDate } from "@/lib/legalDate";

/**
 * Map a stored document into the ETDA e-Tax model (lib/etax.ts). Pure + tested.
 * Only VAT documents map; the route guards the rest.
 *
 *   TAX_INVOICE / RECEIPT → 388 (tax invoice) · DEBIT_NOTE → 80 · CREDIT_NOTE → 81
 *
 * Discounted lines are collapsed to a single net-amount line so the strict
 * `validateETaxDocument` identity (lineTotal === qty × unitPrice) always holds.
 * NOTE: a whole-document discount is reflected in the line totals, not yet as a
 * separate e-Tax allowance line — validate against the official XSD before filing.
 */
const ETAX_DOCTYPE: Partial<Record<DocType, "388" | "80" | "81">> = {
  TAX_INVOICE: "388",
  RECEIPT: "388",
  DEBIT_NOTE: "80",
  CREDIT_NOTE: "81",
};

export function isETaxEligible(docType: DocType): boolean {
  return docType in ETAX_DOCTYPE;
}

/** "สำนักงานใหญ่" → "00000"; otherwise the digits found, left-padded to 5. */
export function toBranchCode(branch: string | null | undefined): string {
  if (!branch || branch.includes("สำนักงานใหญ่")) return "00000";
  const digits = branch.replace(/\D/g, "");
  return digits ? digits.padStart(5, "0").slice(-5) : "00000";
}

type InvLike = {
  docType: DocType;
  number: string;
  issueDate: Date;
  vatSatang: number;
  items: { description: string; qty: number; unitPriceSatang: number; discountSatang: number; lineTotalSatang: number }[];
};
type CompanyLike = { name: string; taxId: string; address: string; branch: string };
type CustomerLike = { name: string; taxId: string | null; address: string | null; branch: string };

export function invoiceToETaxDocument(inv: InvLike, company: CompanyLike, customer: CustomerLike): ETaxDocument {
  const documentType = ETAX_DOCTYPE[inv.docType];
  if (!documentType) throw new Error(`เอกสารประเภท ${inv.docType} ไม่รองรับ e-Tax`);

  const lines: ETaxLine[] = inv.items.map((it) =>
    it.discountSatang > 0
      ? { description: `${it.description} (หลังหักส่วนลด)`, quantity: 1, unitPriceSatang: it.lineTotalSatang, lineTotalSatang: it.lineTotalSatang }
      : { description: it.description, quantity: it.qty, unitPriceSatang: it.unitPriceSatang, lineTotalSatang: it.lineTotalSatang }
  );
  const lineSum = lines.reduce((s, l) => s + l.lineTotalSatang, 0);

  return {
    documentType,
    number: inv.number,
    issueDate: legalDate(inv.issueDate),
    seller: { name: company.name, taxId: company.taxId, branchCode: toBranchCode(company.branch), address: company.address },
    buyer: { name: customer.name, taxId: customer.taxId ?? "", branchCode: toBranchCode(customer.branch), address: customer.address ?? "" },
    lines,
    vatSatang: inv.vatSatang,
    grandTotalSatang: lineSum + inv.vatSatang,
  };
}
