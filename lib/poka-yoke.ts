/**
 * Poka-yoke issue validation. A document cannot leave DRAFT unless it is legally valid
 * for its type. Returns a list of Thai messages describing what is missing.
 *
 * The gate depends on the document type (see lib/docTypes.ts):
 *   FULL       — the 8 mandatory fields of a Thai full tax invoice (มาตรา 86/4).
 *                Applies to TAX_INVOICE / RECEIPT / CREDIT_NOTE / DEBIT_NOTE.
 *   LIGHT      — commercial document: seller + buyer name, a number, a date, ≥1 item.
 *                Applies to QUOTATION / BILLING_NOTE.
 *   SUBSTITUTE — ใบรับรองแทนใบเสร็จ: our company (payer) + payee name + reason + ≥1 item.
 *
 * Fields 1 & 6 ("ใบกำกับภาษี" wording, VAT shown separately) are guaranteed by the PDF
 * template, so they are not re-checked here. When no docType is supplied the gate
 * defaults to FULL — the historical tax-invoice behaviour.
 */
import type { DocType } from "@prisma/client";
import { docMeta, type IssueGate } from "@/lib/docTypes";

export type IssueCheckInput = {
  docType?: DocType;
  company: { name: string; address: string; taxId: string; branch: string };
  customer: {
    name: string;
    address: string | null;
    branch: string;
    taxId: string | null;
    isVatRegistered: boolean;
  };
  invoice: {
    number: string;
    issueDate: Date | null;
    payeeName?: string | null;
    reason?: string | null;
    refDocNumber?: string | null;
    sourceId?: string | null;
  };
  items: { description: string; qty: number; unitPriceSatang: number }[];
};

function checkItems(items: IssueCheckInput["items"], errors: string[]) {
  if (!items.length) {
    errors.push("ต้องมีรายการสินค้า/บริการอย่างน้อย 1 รายการ");
    return;
  }
  items.forEach((it, i) => {
    if (!it.description?.trim()) errors.push(`รายการที่ ${i + 1}: ยังไม่ได้ระบุรายละเอียด`);
    if (!(it.qty > 0)) errors.push(`รายการที่ ${i + 1}: จำนวนต้องมากกว่า 0`);
    if (it.unitPriceSatang < 0) errors.push(`รายการที่ ${i + 1}: ราคาต้องไม่ติดลบ`);
  });
}

export function validateForIssue(input: IssueCheckInput): string[] {
  const errors: string[] = [];
  const { company, customer, invoice, items } = input;
  const gate: IssueGate = input.docType ? docMeta(input.docType).gate : "FULL";

  // Seller (us) — always required.
  if (!company.name?.trim()) errors.push("ผู้ขาย: ยังไม่ได้ระบุชื่อบริษัท");

  if (gate === "SUBSTITUTE") {
    // ใบรับรองแทนใบเสร็จ: we are the payer; need a payee name and a reason.
    const payee = invoice.payeeName?.trim() || customer.name?.trim();
    if (!payee) errors.push("ยังไม่ได้ระบุผู้รับเงิน");
    if (!invoice.reason?.trim()) errors.push("ยังไม่ได้ระบุเหตุผล/รายละเอียดการจ่าย");
    if (!invoice.issueDate) errors.push("ยังไม่ได้ระบุวันที่");
    checkItems(items, errors);
    return errors;
  }

  if (gate === "FULL") {
    // 2 — seller: name (above) + address + taxId
    if (!company.address?.trim()) errors.push("ผู้ขาย: ยังไม่ได้ระบุที่อยู่");
    if (!company.taxId?.trim()) errors.push("ผู้ขาย: ยังไม่ได้ระบุเลขประจำตัวผู้เสียภาษี");
    // 8 — seller branch
    if (!company.branch?.trim()) errors.push("ผู้ขาย: ยังไม่ได้ระบุสำนักงานใหญ่/สาขา");
    // 3 — buyer: name + address (+ taxId if VAT-registered)
    if (!customer.name?.trim()) errors.push("ผู้ซื้อ: ยังไม่ได้ระบุชื่อลูกค้า");
    if (!customer.address?.trim()) errors.push("ผู้ซื้อ: ยังไม่ได้ระบุที่อยู่");
    if (customer.isVatRegistered && !customer.taxId?.trim())
      errors.push("ผู้ซื้อ: ลูกค้าจด VAT ต้องระบุเลขประจำตัวผู้เสียภาษี");
    // 8 — buyer branch
    if (!customer.branch?.trim()) errors.push("ผู้ซื้อ: ยังไม่ได้ระบุสำนักงานใหญ่/สาขา");
    if (input.docType === "CREDIT_NOTE" || input.docType === "DEBIT_NOTE") {
      if (!invoice.reason?.trim()) errors.push("ยังไม่ได้ระบุเหตุผลของใบลดหนี้/ใบเพิ่มหนี้");
      if (!invoice.sourceId && !invoice.refDocNumber?.trim()) errors.push("ยังไม่ได้ระบุเอกสารต้นทางที่อ้างอิง");
    }
  } else {
    // LIGHT — commercial document: just need the buyer's name.
    if (!customer.name?.trim()) errors.push("ผู้ซื้อ: ยังไม่ได้ระบุชื่อลูกค้า");
  }

  // 4 — document number
  if (!invoice.number?.trim()) errors.push("ยังไม่มีเลขที่เอกสาร");
  // 7 — issue date
  if (!invoice.issueDate) errors.push("ยังไม่ได้ระบุวันที่ออกเอกสาร");
  // 5 — at least one valid line item
  checkItems(items, errors);

  return errors;
}
