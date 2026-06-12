"use server";

import { revalidatePath } from "next/cache";
import { db, requireWriter } from "@/lib/tenant";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateTaxSetting(
  jobType: string,
  input: { vatRate: number; whtRate: number; vatApplicable: boolean }
): Promise<ActionResult> {
  const ctx = await requireWriter();
  const vatRate = input.vatRate / 100; // UI is in %, store as fraction
  const whtRate = input.whtRate / 100;
  if (vatRate < 0 || vatRate > 1 || whtRate < 0 || whtRate > 1) {
    return { ok: false, error: "อัตราภาษีต้องอยู่ระหว่าง 0–100%" };
  }
  const res = await db.taxSetting.updateMany({
    where: { companyId: ctx.companyId, jobType },
    data: { vatRate, whtRate, vatApplicable: input.vatApplicable },
  });
  if (res.count === 0) return { ok: false, error: "ไม่พบการตั้งค่า" };
  revalidatePath("/settings");
  return { ok: true };
}
