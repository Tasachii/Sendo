"use server";

import { revalidatePath } from "next/cache";
import { db, requireWriter } from "@/lib/tenant";
import { serviceSchema } from "@/lib/validation";
import { bahtToSatang } from "@/lib/money";

export type ActionResult = { ok: true } | { ok: false; error: string };

function parse(formData: FormData) {
  return serviceSchema.safeParse({
    name: formData.get("name"),
    defaultJobType: formData.get("defaultJobType"),
    defaultUnitPriceBaht: formData.get("defaultUnitPriceBaht") ?? 0,
  });
}

export async function createService(formData: FormData): Promise<ActionResult> {
  const ctx = await requireWriter();
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  await db.service.create({
    data: {
      companyId: ctx.companyId,
      name: d.name,
      defaultJobType: d.defaultJobType,
      defaultUnitPriceSatang: bahtToSatang(d.defaultUnitPriceBaht),
    },
  });
  revalidatePath("/services");
  return { ok: true };
}

export async function updateService(id: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireWriter();
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const res = await db.service.updateMany({
    where: { id, companyId: ctx.companyId },
    data: {
      name: d.name,
      defaultJobType: d.defaultJobType,
      defaultUnitPriceSatang: bahtToSatang(d.defaultUnitPriceBaht),
    },
  });
  if (res.count === 0) return { ok: false, error: "ไม่พบรายการ" };
  revalidatePath("/services");
  return { ok: true };
}

export async function deleteService(id: string): Promise<ActionResult> {
  const ctx = await requireWriter();
  await db.service.deleteMany({ where: { id, companyId: ctx.companyId } });
  revalidatePath("/services");
  return { ok: true };
}
