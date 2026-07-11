"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validation";
import { TAX_DEFAULTS } from "@/lib/taxDefaults";
import { registrationIdentityThrottle, registrationIpThrottle } from "@/lib/rate-limit";

export type RegisterResult = { ok: true } | { ok: false; error: string };
const GENERIC_REGISTRATION_ERROR = "ไม่สามารถสมัครสมาชิกด้วยข้อมูลนี้ได้ กรุณาตรวจสอบแล้วลองใหม่ หรือใช้อีเมลอื่น";

async function requestIp(): Promise<string> {
  // Trust these headers only when the edge proxy strips caller values and writes the
  // canonical client IP. Otherwise use one conservative process-wide source bucket.
  if (process.env.TRUST_PROXY_HEADERS !== "true") return "untrusted-source";
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

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
  const ipBudget = registrationIpThrottle.checkAndRecord(await requestIp());
  if (!ipBudget.allowed) return { ok: false, error: GENERIC_REGISTRATION_ERROR };
  const identityBudget = registrationIdentityThrottle.checkAndRecord(email);
  if (!identityBudget.allowed) return { ok: false, error: GENERIC_REGISTRATION_ERROR };

  // Generic failure on a taken email: never confirm to an anonymous caller that a
  // specific address is registered (user-enumeration guard). The message stays the
  // same shape as a validation error so the two are indistinguishable.
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: GENERIC_REGISTRATION_ERROR };

  try {
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: GENERIC_REGISTRATION_ERROR };
    }
    throw error;
  }

  return { ok: true };
}
