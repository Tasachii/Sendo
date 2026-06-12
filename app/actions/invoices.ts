"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db, requireWriter } from "@/lib/tenant";
import { invoiceDraftSchema } from "@/lib/validation";
import { computeTotals, nextInvoiceNumber } from "@/lib/invoice";
import { validateForIssue } from "@/lib/poka-yoke";

export type InvoiceActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; missing?: string[] };

/** Create a DRAFT invoice. Totals + number are computed server-side. */
export async function createInvoice(raw: unknown): Promise<InvoiceActionResult> {
  const ctx = await requireWriter();
  const parsed = invoiceDraftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  // customer + tax setting must belong to this tenant
  const [customer, setting] = await Promise.all([
    db.customer.findFirst({ where: { id: d.customerId, companyId: ctx.companyId } }),
    db.taxSetting.findFirst({ where: { companyId: ctx.companyId, jobType: d.jobType } }),
  ]);
  if (!customer) return { ok: false, error: "ไม่พบลูกค้า" };
  if (!setting) return { ok: false, error: "ไม่พบการตั้งค่าภาษีของประเภทงานนี้" };

  const totals = computeTotals(
    d.items.map((it) => ({ description: it.description, qty: it.qty, unitPriceBaht: it.unitPriceBaht })),
    setting
  );

  // race-safe numbering: retry a few times on the unique([companyId, number]) guard
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await db.$transaction(async (tx) => {
        const number = await nextInvoiceNumber(tx, ctx.companyId);
        return tx.invoice.create({
          data: {
            companyId: ctx.companyId,
            number,
            customerId: customer.id,
            issueDate: new Date(d.issueDate),
            dueDate: d.dueDate ? new Date(d.dueDate) : null,
            status: "DRAFT",
            jobType: d.jobType,
            subtotalSatang: totals.subtotalSatang,
            vatSatang: totals.vatSatang,
            whtSatang: totals.whtSatang,
            netSatang: totals.netSatang,
            trackingNo: d.trackingNo || null,
            note: d.note || null,
            createdById: ctx.userId,
            items: { create: totals.items },
          },
        });
      });
      revalidatePath("/invoices");
      return { ok: true, id: created.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, error: "ออกเลขที่ใบแจ้งหนี้ไม่สำเร็จ กรุณาลองใหม่" };
}

/** Issue: run poka-yoke (มาตรา 86/4) then move DRAFT -> SENT. */
export async function issueInvoice(id: string): Promise<InvoiceActionResult> {
  const ctx = await requireWriter();
  const invoice = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { customer: true, items: true, company: true },
  });
  if (!invoice) return { ok: false, error: "ไม่พบใบแจ้งหนี้" };

  const missing = validateForIssue({
    company: invoice.company,
    customer: invoice.customer,
    invoice: { number: invoice.number, issueDate: invoice.issueDate },
    items: invoice.items,
  });
  if (missing.length > 0) {
    return { ok: false, error: "ออกใบกำกับภาษีไม่ได้: ข้อมูลไม่ครบตามมาตรา 86/4", missing };
  }

  await db.invoice.updateMany({
    where: { id, companyId: ctx.companyId, status: "DRAFT" },
    data: { status: "SENT" },
  });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true, id };
}

export async function setInvoiceStatus(
  id: string,
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE"
): Promise<InvoiceActionResult> {
  const ctx = await requireWriter();
  const res = await db.invoice.updateMany({ where: { id, companyId: ctx.companyId }, data: { status } });
  if (res.count === 0) return { ok: false, error: "ไม่พบใบแจ้งหนี้" };
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true, id };
}

export async function deleteInvoice(id: string): Promise<InvoiceActionResult> {
  const ctx = await requireWriter();
  await db.invoice.deleteMany({ where: { id, companyId: ctx.companyId } });
  revalidatePath("/invoices");
  return { ok: true, id };
}
