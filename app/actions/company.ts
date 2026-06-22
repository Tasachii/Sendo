"use server";

import { revalidatePath } from "next/cache";
import { db, requireOwner } from "@/lib/tenant";
import { companyProfileSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export type CompanyActionResult = { ok: true } | { ok: false; error: string };

// Max decoded size per image. Logos/seals/signatures are small; keep rows light and
// renders fast. base64 inflates ~4/3, so guard the decoded byte count.
const MAX_BYTES = 300 * 1024;
const DATA_URL_RE = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/;

type BrandingField = "logoDataUrl" | "sealDataUrl" | "signatureDataUrl";

/** Validate one base64 image data URL. Empty/undefined clears the field. */
function validateImage(dataUrl: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (dataUrl == null || dataUrl === "") return { ok: true, value: null };
  if (typeof dataUrl !== "string") return { ok: false, error: "รูปแบบไฟล์ไม่ถูกต้อง" };
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return { ok: false, error: "รองรับเฉพาะไฟล์ PNG หรือ JPG เท่านั้น" };
  const bytes = Math.floor((m[2].replace(/=+$/, "").length * 3) / 4);
  if (bytes > MAX_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกินไป (จำกัด 300KB ต่อรูป)" };
  return { ok: true, value: dataUrl };
}

/**
 * Update company branding shown on every document PDF. OWNER-only. A key that is
 * present is set (string) or cleared (null/empty); an absent key is left untouched.
 */
export async function updateCompanyBranding(input: Partial<Record<BrandingField, string | null>>): Promise<CompanyActionResult> {
  const ctx = await requireOwner();
  const data: Partial<Record<BrandingField, string | null>> = {};
  for (const key of ["logoDataUrl", "sealDataUrl", "signatureDataUrl"] as BrandingField[]) {
    if (!(key in input)) continue;
    const res = validateImage(input[key]);
    if (!res.ok) return res;
    data[key] = res.value;
  }
  if (Object.keys(data).length === 0) return { ok: true };

  await db.company.updateMany({ where: { id: ctx.companyId }, data });
  await logAudit(ctx, "COMPANY_BRANDING", "Company", ctx.companyId, "อัปเดตโลโก้/ตราประทับ/ลายเซ็น");
  revalidatePath("/settings");
  return { ok: true };
}

/** Update the company's legal profile (seller identity on every document). OWNER-only. */
export async function updateCompanyProfile(formData: FormData): Promise<CompanyActionResult> {
  const ctx = await requireOwner();
  const parsed = companyProfileSchema.safeParse({
    name: formData.get("name"),
    taxId: formData.get("taxId"),
    address: formData.get("address"),
    branch: formData.get("branch") || "สำนักงานใหญ่",
    isVatRegistered: formData.get("isVatRegistered") === "on" || formData.get("isVatRegistered") === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await db.company.updateMany({ where: { id: ctx.companyId }, data: parsed.data });
  await logAudit(ctx, "COMPANY_PROFILE", "Company", ctx.companyId, "อัปเดตข้อมูลบริษัท");
  revalidatePath("/settings");
  return { ok: true };
}
