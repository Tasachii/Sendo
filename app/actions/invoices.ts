"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db, requireWriter, requireOwner } from "@/lib/tenant";
import { invoiceDraftSchema } from "@/lib/validation";
import { computeTotals, nextInvoiceNumber } from "@/lib/invoice";
import { validateForIssue } from "@/lib/poka-yoke";
import { logAudit } from "@/lib/audit";
import { formatBaht } from "@/lib/money";

export type InvoiceActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; missing?: string[] };

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE";

/**
 * Allowed status transitions (state machine). A legally-issued document can never
 * be un-issued back to DRAFT. DRAFT only leaves via `issueInvoice` (→ SENT), so it
 * has no manual transitions here.
 */
const STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: [],
  SENT: ["PAID", "OVERDUE"],
  OVERDUE: ["PAID", "SENT"],
  PAID: ["OVERDUE"],
};

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
    d.items.map((it) => ({ description: it.description, qty: it.qty, unitPriceBaht: it.unitPriceBaht, pricingMode: it.pricingMode })),
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
            shipments: d.shipments.length
              ? { create: d.shipments.map((s) => ({ trackingNo: s.trackingNo, note: s.note || null })) }
              : undefined,
          },
        });
      });
      await logAudit(ctx, "INVOICE_CREATE", "Invoice", created.id, `สร้างฉบับร่าง ${created.number} · สุทธิ ${formatBaht(totals.netSatang)} บาท`);
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

  // Stamp the legal issue moment (มาตรา 86/4 field 7) at issue time, not the draft date.
  // The status: "DRAFT" guard keeps this a no-op if the invoice was already issued.
  await db.invoice.updateMany({
    where: { id, companyId: ctx.companyId, status: "DRAFT" },
    data: { status: "SENT", issueDate: new Date() },
  });
  await logAudit(ctx, "INVOICE_ISSUE", "Invoice", id, `ออกใบกำกับภาษี ${invoice.number}`);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true, id };
}

export async function setInvoiceStatus(
  id: string,
  status: InvoiceStatus
): Promise<InvoiceActionResult> {
  const ctx = await requireWriter();
  const current = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { status: true },
  });
  if (!current) return { ok: false, error: "ไม่พบใบแจ้งหนี้" };

  // No-op transition (e.g. SENT→SENT) is harmless; otherwise enforce the state machine.
  if (current.status !== status && !STATUS_TRANSITIONS[current.status].includes(status)) {
    return { ok: false, error: `เปลี่ยนสถานะจาก ${current.status} เป็น ${status} ไม่ได้` };
  }

  await db.invoice.updateMany({ where: { id, companyId: ctx.companyId }, data: { status } });
  await logAudit(ctx, "INVOICE_STATUS", "Invoice", id, `เปลี่ยนสถานะเป็น ${status}`);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true, id };
}

/** Copy an existing invoice into a fresh DRAFT (new number, today's date). */
export async function duplicateInvoice(id: string): Promise<InvoiceActionResult> {
  const ctx = await requireWriter();
  const src = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { items: true, shipments: true },
  });
  if (!src) return { ok: false, error: "ไม่พบใบแจ้งหนี้" };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const copy = await db.$transaction(async (tx) => {
        const number = await nextInvoiceNumber(tx, ctx.companyId);
        return tx.invoice.create({
          data: {
            companyId: ctx.companyId,
            number,
            customerId: src.customerId,
            issueDate: new Date(),
            dueDate: null,
            status: "DRAFT",
            jobType: src.jobType,
            subtotalSatang: src.subtotalSatang,
            vatSatang: src.vatSatang,
            whtSatang: src.whtSatang,
            netSatang: src.netSatang,
            trackingNo: src.trackingNo,
            note: src.note,
            createdById: ctx.userId,
            items: { create: src.items.map((it) => ({ description: it.description, pricingMode: it.pricingMode, qty: it.qty, unitPriceSatang: it.unitPriceSatang, lineTotalSatang: it.lineTotalSatang })) },
            shipments: src.shipments.length
              ? { create: src.shipments.map((s) => ({ trackingNo: s.trackingNo, note: s.note })) }
              : undefined,
          },
        });
      });
      await logAudit(ctx, "INVOICE_COPY", "Invoice", copy.id, `ก๊อปจาก ${src.number} → ${copy.number}`);
      revalidatePath("/invoices");
      return { ok: true, id: copy.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, error: "ก๊อปใบแจ้งหนี้ไม่สำเร็จ กรุณาลองใหม่" };
}

/**
 * Hard-delete an invoice. Destructive on a legal document, so it is OWNER-only
 * (A8 policy) and restricted to DRAFT — a SENT/PAID/OVERDUE tax document must
 * never be deleted (audit + number continuity). Issued docs should be voided, not erased.
 */
export async function deleteInvoice(id: string): Promise<InvoiceActionResult> {
  const ctx = await requireOwner();
  const target = await db.invoice.findFirst({ where: { id, companyId: ctx.companyId }, select: { number: true, status: true } });
  if (!target) return { ok: false, error: "ไม่พบใบแจ้งหนี้" };
  if (target.status !== "DRAFT") {
    return { ok: false, error: "ลบได้เฉพาะฉบับร่าง (DRAFT) เท่านั้น เอกสารที่ออกแล้วต้องยกเลิก ไม่ใช่ลบ" };
  }
  await db.invoice.deleteMany({ where: { id, companyId: ctx.companyId, status: "DRAFT" } });
  await logAudit(ctx, "INVOICE_DELETE", "Invoice", id, `ลบใบแจ้งหนี้ ${target.number}`);
  revalidatePath("/invoices");
  return { ok: true, id };
}
