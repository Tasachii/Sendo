"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validation";

const TAX_DEFAULTS = [
  { jobType: "transport_only", label: "ขนส่งล้วน (จดทะเบียนขนส่ง)", vatRate: 0, whtRate: 0.01, vatApplicable: false },
  { jobType: "transport_service", label: "ขนส่งพ่วงบริการ", vatRate: 0.07, whtRate: 0.03, vatApplicable: true },
  { jobType: "service", label: "ค่าบริการ / รับจ้างทำของ", vatRate: 0.07, whtRate: 0.03, vatApplicable: true },
  { jobType: "rent", label: "ค่าเช่า", vatRate: 0.07, whtRate: 0.05, vatApplicable: true },
  { jobType: "advertising", label: "ค่าโฆษณา", vatRate: 0.07, whtRate: 0.02, vatApplicable: true },
  { jobType: "custom", label: "กำหนดเอง", vatRate: 0.07, whtRate: 0.03, vatApplicable: true },
];

export type RegisterResult = { ok: true } | { ok: false; error: string };

/** Register a new company + its first OWNER user. Seeds tax defaults. */
export async function registerCompany(formData: FormData): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse({
    companyName: formData.get("companyName"),
    companyTaxId: formData.get("companyTaxId"),
    companyAddress: formData.get("companyAddress"),
    ownerName: formData.get("ownerName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const data = parsed.data;
  const email = data.email.toLowerCase().trim();

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "อีเมลนี้ถูกใช้งานแล้ว" };

  await db.company.create({
    data: {
      name: data.companyName,
      taxId: data.companyTaxId,
      address: data.companyAddress,
      branch: "สำนักงานใหญ่",
      isVatRegistered: true,
      taxSettings: { create: TAX_DEFAULTS },
      users: {
        create: {
          email,
          name: data.ownerName,
          passwordHash: await bcrypt.hash(data.password, 10),
          role: "OWNER",
        },
      },
    },
  });

  return { ok: true };
}
