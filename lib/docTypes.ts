import type { DocType, InvoiceStatus } from "@prisma/client";

/**
 * Single source of truth for every document type Sendo issues. The `Invoice` table is a
 * shared, discriminated store; this file is what makes each row behave like its real
 * Thai document (title, numbering series, which legal gate applies, status flow, fields).
 */

export type IssueGate =
  | "FULL" // full มาตรา 86/4 tax-invoice gate (8 mandatory fields)
  | "LIGHT" // commercial doc: seller + buyer name + ≥1 item + number + date
  | "SUBSTITUTE"; // ใบรับรองแทนใบเสร็จ: payer (us) + payee name + reason + ≥1 item

export type DocTypeMeta = {
  type: DocType;
  series: string; // number prefix, e.g. "QUO"
  title: string; // printed document title (PDF + page heading)
  short: string; // nav / tab label
  emoji: string; // small visual marker in the type chooser
  isTaxDoc: boolean; // carries VAT and uses the WHT/tax machinery
  countsForVatReport: boolean; // included in the ภ.พ.30 / ภ.ง.ด. monthly summary
  showWht: boolean; // WHT row is relevant for this type
  gate: IssueGate; // which poka-yoke gate runs before issue
  dateLabel: string; // label for the secondary date field
  dateField: "dueDate" | "validUntil" | "receivedDate" | "none";
  issueVerb: string; // button text, e.g. "ออกใบกำกับภาษี"
};

export const DOC_TYPES: Record<DocType, DocTypeMeta> = {
  QUOTATION: {
    type: "QUOTATION", series: "QUO", title: "ใบเสนอราคา", short: "ใบเสนอราคา", emoji: "📝",
    isTaxDoc: false, countsForVatReport: false, showWht: false, gate: "LIGHT",
    dateLabel: "ยืนราคาถึงวันที่", dateField: "validUntil", issueVerb: "ส่งใบเสนอราคา",
  },
  BILLING_NOTE: {
    type: "BILLING_NOTE", series: "BILL", title: "ใบแจ้งหนี้ / ใบวางบิล", short: "ใบแจ้งหนี้", emoji: "📄",
    isTaxDoc: false, countsForVatReport: false, showWht: true, gate: "LIGHT",
    dateLabel: "ครบกำหนดชำระ", dateField: "dueDate", issueVerb: "ออกใบแจ้งหนี้",
  },
  TAX_INVOICE: {
    type: "TAX_INVOICE", series: "INV", title: "ใบกำกับภาษี / ใบแจ้งหนี้", short: "ใบกำกับภาษี", emoji: "🧾",
    isTaxDoc: true, countsForVatReport: true, showWht: true, gate: "FULL",
    dateLabel: "ครบกำหนดชำระ", dateField: "dueDate", issueVerb: "ออกใบกำกับภาษี",
  },
  RECEIPT: {
    type: "RECEIPT", series: "REC", title: "ใบเสร็จรับเงิน / ใบกำกับภาษี", short: "ใบเสร็จรับเงิน", emoji: "✅",
    isTaxDoc: true, countsForVatReport: false, showWht: true, gate: "FULL",
    dateLabel: "วันที่รับเงิน", dateField: "receivedDate", issueVerb: "ออกใบเสร็จรับเงิน",
  },
  RECEIPT_SUBSTITUTE: {
    type: "RECEIPT_SUBSTITUTE", series: "RCS", title: "ใบรับรองแทนใบเสร็จรับเงิน", short: "ใบรับรองแทนใบเสร็จ", emoji: "🧷",
    isTaxDoc: false, countsForVatReport: false, showWht: false, gate: "SUBSTITUTE",
    dateLabel: "วันที่จ่ายเงิน", dateField: "receivedDate", issueVerb: "ออกใบรับรอง",
  },
  CREDIT_NOTE: {
    type: "CREDIT_NOTE", series: "CN", title: "ใบลดหนี้", short: "ใบลดหนี้", emoji: "↘️",
    isTaxDoc: true, countsForVatReport: false, showWht: false, gate: "FULL",
    dateLabel: "วันที่", dateField: "none", issueVerb: "ออกใบลดหนี้",
  },
  DEBIT_NOTE: {
    type: "DEBIT_NOTE", series: "DN", title: "ใบเพิ่มหนี้", short: "ใบเพิ่มหนี้", emoji: "↗️",
    isTaxDoc: true, countsForVatReport: false, showWht: false, gate: "FULL",
    dateLabel: "วันที่", dateField: "none", issueVerb: "ออกใบเพิ่มหนี้",
  },
};

export const ALL_DOC_TYPES = Object.values(DOC_TYPES);

export function docMeta(type: DocType): DocTypeMeta {
  return DOC_TYPES[type] ?? DOC_TYPES.TAX_INVOICE;
}

/**
 * Allowed status transitions per document family (the state machine). DRAFT only leaves
 * via the issue action, so it has no manual transitions. A legally-issued document can
 * never be un-issued back to DRAFT.
 */
const QUOTATION_FLOW: Partial<Record<InvoiceStatus, InvoiceStatus[]>> = {
  DRAFT: [],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: [],
  REJECTED: ["SENT"],
  EXPIRED: ["SENT"],
};
const INVOICE_FLOW: Partial<Record<InvoiceStatus, InvoiceStatus[]>> = {
  DRAFT: [],
  SENT: ["PAID", "OVERDUE", "VOID"],
  OVERDUE: ["PAID", "SENT", "VOID"],
  PAID: ["OVERDUE"],
};
const NOTE_FLOW: Partial<Record<InvoiceStatus, InvoiceStatus[]>> = {
  DRAFT: [],
  SENT: ["VOID"],
};

export function statusFlow(type: DocType): Partial<Record<InvoiceStatus, InvoiceStatus[]>> {
  if (type === "QUOTATION") return QUOTATION_FLOW;
  if (type === "RECEIPT_SUBSTITUTE" || type === "CREDIT_NOTE" || type === "DEBIT_NOTE") return NOTE_FLOW;
  return INVOICE_FLOW; // BILLING_NOTE, TAX_INVOICE, RECEIPT
}

export function allowedTransitions(type: DocType, from: InvoiceStatus): InvoiceStatus[] {
  return statusFlow(type)[from] ?? [];
}

/**
 * Conversion edges — the workflow Biz108 can't do. A document of `from` type can be
 * converted into any of the listed target types (cloning items + discounts).
 */
export const CONVERSIONS: Partial<Record<DocType, DocType[]>> = {
  QUOTATION: ["BILLING_NOTE", "TAX_INVOICE"],
  BILLING_NOTE: ["TAX_INVOICE", "RECEIPT"],
  TAX_INVOICE: ["RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE"],
};

export function conversionTargets(type: DocType): DocType[] {
  return CONVERSIONS[type] ?? [];
}
