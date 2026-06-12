/**
 * Poka-yoke issue validation (build spec §4) — the 8 mandatory fields of a Thai
 * full tax invoice (ประมวลรัษฎากร มาตรา 86/4). An invoice cannot leave DRAFT
 * unless ALL are satisfied. Returns a list of Thai messages for what's missing.
 *
 * Fields 1 & 6 ("ใบกำกับภาษี" wording, VAT shown separately) are guaranteed by the
 * PDF template, so they are not re-checked here.
 */

export type IssueCheckInput = {
  company: { name: string; address: string; taxId: string; branch: string };
  customer: {
    name: string;
    address: string | null;
    branch: string;
    taxId: string | null;
    isVatRegistered: boolean;
  };
  invoice: { number: string; issueDate: Date | null };
  items: { description: string; qty: number; unitPriceSatang: number }[];
};

export function validateForIssue(input: IssueCheckInput): string[] {
  const errors: string[] = [];
  const { company, customer, invoice, items } = input;

  // 2 — seller: name + address + taxId
  if (!company.name?.trim()) errors.push("ผู้ขาย: ยังไม่ได้ระบุชื่อบริษัท");
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

  // 4 — invoice number
  if (!invoice.number?.trim()) errors.push("ยังไม่มีเลขที่ใบกำกับภาษี");

  // 7 — issue date
  if (!invoice.issueDate) errors.push("ยังไม่ได้ระบุวันที่ออกเอกสาร");

  // 5 — at least one valid line item
  if (!items.length) {
    errors.push("ต้องมีรายการสินค้า/บริการอย่างน้อย 1 รายการ");
  } else {
    items.forEach((it, i) => {
      if (!it.description?.trim()) errors.push(`รายการที่ ${i + 1}: ยังไม่ได้ระบุรายละเอียด`);
      if (!(it.qty > 0)) errors.push(`รายการที่ ${i + 1}: จำนวนต้องมากกว่า 0`);
      if (it.unitPriceSatang < 0) errors.push(`รายการที่ ${i + 1}: ราคาต้องไม่ติดลบ`);
    });
  }

  return errors;
}
