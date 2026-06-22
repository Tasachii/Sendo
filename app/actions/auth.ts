"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validation";
import { TAX_DEFAULTS } from "@/lib/taxDefaults";

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
