import { z } from "zod";

// Shared Zod schemas — used by both server actions and client forms (build spec §1).

// Thai นิติบุคคล tax ID — exactly 13 digits, no other characters.
const taxId13 = /^\d{13}$/;

export const registerSchema = z.object({
  companyName: z.string().min(1, "กรุณากรอกชื่อบริษัท"),
  companyTaxId: z.string().regex(taxId13, "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก"),
  companyAddress: z.string().min(1, "กรุณากรอกที่อยู่บริษัท"),
  ownerName: z.string().min(1, "กรุณากรอกชื่อผู้ใช้"),
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านอย่างน้อย 8 ตัวอักษร"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const companyProfileSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อบริษัท"),
  taxId: z.string().regex(taxId13, "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก"),
  address: z.string().min(1, "กรุณากรอกที่อยู่บริษัท"),
  branch: z.string().min(1, "กรุณาระบุสำนักงานใหญ่/สาขา").default("สำนักงานใหญ่"),
  isVatRegistered: z.boolean().default(true),
});
export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

export const teamMemberSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อ"),
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านอย่างน้อย 8 ตัวอักษร"),
  role: z.enum(["OWNER", "STAFF", "VIEWER"]),
});
export type TeamMemberInput = z.infer<typeof teamMemberSchema>;

export const customerSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อลูกค้า"),
  // Optional for non-VAT buyers; but when provided it must be a valid 13-digit Thai tax ID,
  // so a VAT-registered customer can never be saved with a malformed taxId (A6 / poka-yoke).
  taxId: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || taxId13.test(v), "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก"),
  address: z.string().optional().or(z.literal("")),
  branch: z.string().min(1, "กรุณาระบุสำนักงานใหญ่/สาขา").default("สำนักงานใหญ่"),
  contactPhone: z.string().optional().or(z.literal("")),
  contactEmail: z.string().email("อีเมลไม่ถูกต้อง").optional().or(z.literal("")),
  isVatRegistered: z.boolean().default(false),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const serviceSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อรายการ"),
  defaultJobType: z.string().min(1, "กรุณาเลือกประเภทงาน"),
  defaultUnitPriceBaht: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ").default(0),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

export const pricingModeSchema = z.enum(["FLAT", "WEIGHT", "DISTANCE"]);
export type PricingMode = z.infer<typeof pricingModeSchema>;

export const invoiceItemSchema = z.object({
  description: z.string().min(1, "กรุณากรอกรายละเอียด"),
  pricingMode: pricingModeSchema.default("FLAT"),
  qty: z.coerce.number().gt(0, "จำนวนต้องมากกว่า 0"),
  unitPriceBaht: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ"),
  // Optional per-line discount. Percentage wins over a flat baht amount if both are sent.
  discountBaht: z.coerce.number().min(0, "ส่วนลดต้องไม่ติดลบ").optional(),
  discountPct: z.coerce.number().min(0).max(100, "ส่วนลดต้องไม่เกิน 100%").optional(),
});

export const shipmentSchema = z.object({
  trackingNo: z.string().min(1, "กรุณากรอกเลข tracking"),
  note: z.string().optional().or(z.literal("")),
});

export const docTypeSchema = z.enum([
  "QUOTATION",
  "BILLING_NOTE",
  "TAX_INVOICE",
  "RECEIPT",
  "RECEIPT_SUBSTITUTE",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
]);
export type DocTypeInput = z.infer<typeof docTypeSchema>;

const optStr = z.string().optional().or(z.literal(""));

export const documentDraftSchema = z.object({
  docType: docTypeSchema.default("TAX_INVOICE"),
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  jobType: z.string().min(1, "กรุณาเลือกประเภทงาน"),
  issueDate: z.string().min(1, "กรุณาระบุวันที่"),
  dueDate: optStr,
  validUntil: optStr, // QUOTATION
  receivedDate: optStr, // RECEIPT / RECEIPT_SUBSTITUTE
  paymentMethod: optStr, // RECEIPT
  payeeName: optStr, // RECEIPT_SUBSTITUTE
  reason: optStr, // CREDIT/DEBIT note + RECEIPT_SUBSTITUTE
  refDocNumber: optStr, // CREDIT/DEBIT note reference
  trackingNo: optStr,
  note: optStr,
  docDiscountBaht: z.coerce.number().min(0).optional(),
  docDiscountPct: z.coerce.number().min(0).max(100).optional(),
  items: z.array(invoiceItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  shipments: z.array(shipmentSchema).default([]),
});
export type DocumentDraftInput = z.infer<typeof documentDraftSchema>;

// Back-compat alias — older call sites referenced invoiceDraftSchema.
export const invoiceDraftSchema = documentDraftSchema;
export type InvoiceDraftInput = DocumentDraftInput;
