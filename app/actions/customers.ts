"use server";

import { revalidatePath } from "next/cache";
import { db, requireWriter } from "@/lib/tenant";
import { customerSchema } from "@/lib/validation";

export type ActionResult = { ok: true } | { ok: false; error: string };

function parse(formData: FormData) {
  return customerSchema.safeParse({
    name: formData.get("name"),
    taxId: formData.get("taxId") ?? "",
    address: formData.get("address") ?? "",
    branch: formData.get("branch") || "สำนักงานใหญ่",
    contactPhone: formData.get("contactPhone") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    isVatRegistered: formData.get("isVatRegistered") === "on" || formData.get("isVatRegistered") === "true",
  });
}

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  const ctx = await requireWriter();
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  await db.customer.create({
    data: {
      companyId: ctx.companyId, // tenant scope — never from client
      name: d.name,
      taxId: d.taxId || null,
      address: d.address || null,
      branch: d.branch,
      contactPhone: d.contactPhone || null,
      contactEmail: d.contactEmail || null,
      isVatRegistered: d.isVatRegistered,
    },
  });
  revalidatePath("/customers");
  return { ok: true };
}

export async function updateCustomer(id: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireWriter();
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  // scope the update by companyId so a forged id can't touch another tenant's row
  const res = await db.customer.updateMany({
    where: { id, companyId: ctx.companyId },
    data: {
      name: d.name,
      taxId: d.taxId || null,
      address: d.address || null,
      branch: d.branch,
      contactPhone: d.contactPhone || null,
      contactEmail: d.contactEmail || null,
      isVatRegistered: d.isVatRegistered,
    },
  });
  if (res.count === 0) return { ok: false, error: "ไม่พบลูกค้า" };
  revalidatePath("/customers");
  return { ok: true };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const ctx = await requireWriter();
  const used = await db.invoice.count({ where: { companyId: ctx.companyId, customerId: id } });
  if (used > 0) return { ok: false, error: "ลบไม่ได้: ลูกค้านี้มีใบแจ้งหนี้อยู่" };
  await db.customer.deleteMany({ where: { id, companyId: ctx.companyId } });
  revalidatePath("/customers");
  return { ok: true };
}
