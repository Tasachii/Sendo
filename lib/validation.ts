import { z } from "zod";

// Shared Zod schemas — used by both server actions and client forms (build spec §1).

export const registerSchema = z.object({
  companyName: z.string().min(1, "กรุณากรอกชื่อบริษัท"),
  companyTaxId: z.string().min(10, "เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก").max(13),
  companyAddress: z.string().min(1, "กรุณากรอกที่อยู่บริษัท"),
  ownerName: z.string().min(1, "กรุณากรอกชื่อผู้ใช้"),
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านอย่างน้อย 8 ตัวอักษร"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const teamMemberSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อ"),
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านอย่างน้อย 8 ตัวอักษร"),
  role: z.enum(["OWNER", "STAFF", "VIEWER"]),
});
export type TeamMemberInput = z.infer<typeof teamMemberSchema>;

export const customerSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อลูกค้า"),
  taxId: z.string().optional().or(z.literal("")),
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
});

export const shipmentSchema = z.object({
  trackingNo: z.string().min(1, "กรุณากรอกเลข tracking"),
  note: z.string().optional().or(z.literal("")),
});

export const invoiceDraftSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  jobType: z.string().min(1, "กรุณาเลือกประเภทงาน"),
  issueDate: z.string().min(1, "กรุณาระบุวันที่"),
  dueDate: z.string().optional().or(z.literal("")),
  trackingNo: z.string().optional().or(z.literal("")),
  note: z.string().optional().or(z.literal("")),
  items: z.array(invoiceItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  shipments: z.array(shipmentSchema).default([]),
});
export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>;
