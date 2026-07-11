"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type DocType, type InvoiceStatus } from "@prisma/client";
import { db, requireWriter, requireOwner } from "@/lib/tenant";
import { documentDraftSchema, documentConversionSchema } from "@/lib/validation";
import { computeTotals, nextDocumentNumber } from "@/lib/invoice";
import { validateForIssue } from "@/lib/poka-yoke";
import { docMeta, allowedTransitions, conversionTargets, effectiveTaxSetting, canConvertStatus } from "@/lib/docTypes";
import { writeAudit } from "@/lib/audit";
import { formatBaht } from "@/lib/money";
import { calcTax } from "@/lib/tax";

export type InvoiceActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; missing?: string[] };

/** Parse an optional yyyy-mm-dd string into a Date (or null). */
function asDate(v: string | undefined | null): Date | null {
  return v ? new Date(`${v}T00:00:00.000Z`) : null;
}

/**
 * Create a DRAFT document of any type. Totals (incl. discounts) + the per-series number
 * are computed server-side. Tenant + writer enforced; client-sent totals never trusted.
 */
export async function createDocument(raw: unknown): Promise<InvoiceActionResult> {
  const ctx = await requireWriter();
  const parsed = documentDraftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const meta = docMeta(d.docType);

  // customer + tax setting must belong to this tenant
  const [customer, setting] = await Promise.all([
    db.customer.findFirst({ where: { id: d.customerId, companyId: ctx.companyId } }),
    db.taxSetting.findFirst({ where: { companyId: ctx.companyId, jobType: d.jobType } }),
  ]);
  if (!customer) return { ok: false, error: "ไม่พบลูกค้า" };
  if (!setting) return { ok: false, error: "ไม่พบการตั้งค่าภาษีของประเภทงานนี้" };

  const taxSetting = effectiveTaxSetting(d.docType, setting);

  const totals = computeTotals(
    d.items.map((it) => ({
      description: it.description,
      qty: it.qty,
      unitPriceBaht: it.unitPriceBaht,
      pricingMode: it.pricingMode,
      discountBaht: it.discountBaht,
      discountPct: it.discountPct,
    })),
    taxSetting,
    { docDiscountBaht: d.docDiscountBaht, docDiscountPct: d.docDiscountPct }
  );

  // race-safe numbering: retry a few times on the unique([companyId, number]) guard
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await db.$transaction(async (tx) => {
        const number = await nextDocumentNumber(tx, ctx.companyId, d.docType);
        const created = await tx.invoice.create({
          data: {
            companyId: ctx.companyId,
            docType: d.docType,
            number,
            customerId: customer.id,
            issueDate: asDate(d.issueDate)!,
            dueDate: meta.dateField === "dueDate" ? asDate(d.dueDate) : null,
            validUntil: meta.dateField === "validUntil" ? asDate(d.validUntil) : null,
            receivedDate: meta.dateField === "receivedDate" ? asDate(d.receivedDate) : null,
            paymentMethod: d.paymentMethod || null,
            payeeName: d.payeeName || null,
            reason: d.reason || null,
            refDocNumber: d.refDocNumber || null,
            status: "DRAFT",
            jobType: d.jobType,
            subtotalSatang: totals.subtotalSatang,
            docDiscountSatang: totals.docDiscountSatang,
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
        await writeAudit(tx, ctx, "DOC_CREATE", "Invoice", created.id, `สร้าง${meta.short}ฉบับร่าง ${created.number} · สุทธิ ${formatBaht(totals.netSatang)} บาท`);
        return created;
      });
      revalidatePath("/documents");
      revalidatePath("/invoices");
      return { ok: true, id: created.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, error: "ออกเลขที่เอกสารไม่สำเร็จ กรุณาลองใหม่" };
}

/** Back-compat alias for the original tax-invoice create path. */
export const createInvoice = createDocument;

/** Issue: run the type's poka-yoke gate, then move DRAFT -> SENT and stamp the issue date. */
export async function issueInvoice(id: string): Promise<InvoiceActionResult> {
  const ctx = await requireWriter();
  const invoice = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { customer: true, items: true, company: true },
  });
  if (!invoice) return { ok: false, error: "ไม่พบเอกสาร" };
  const meta = docMeta(invoice.docType);

  const missing = validateForIssue({
    docType: invoice.docType,
    company: invoice.company,
    customer: invoice.customer,
    invoice: { number: invoice.number, issueDate: invoice.issueDate, payeeName: invoice.payeeName, reason: invoice.reason, refDocNumber: invoice.refDocNumber, sourceId: invoice.sourceId },
    items: invoice.items,
  });
  if (missing.length > 0) {
    return { ok: false, error: `ออก${meta.short}ไม่ได้: ข้อมูลไม่ครบ`, missing };
  }

  // Stamp the legal issue moment at issue time, not the draft date. The status: "DRAFT"
  // guard keeps this a no-op if the document was already issued.
  const issued = await db.$transaction(async (tx) => {
    const result = await tx.invoice.updateMany({
      where: { id, companyId: ctx.companyId, status: "DRAFT" },
      data: { status: "SENT", issueDate: new Date() },
    });
    if (result.count === 0) return false;
    await writeAudit(tx, ctx, "DOC_ISSUE", "Invoice", id, `${meta.issueVerb} ${invoice.number}`);
    return true;
  });
  if (!issued) return { ok: false, error: "เอกสารถูกออกไปแล้วหรือสถานะเปลี่ยนแปลง กรุณาโหลดใหม่" };
  revalidatePath("/documents");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true, id };
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<InvoiceActionResult> {
  const ctx = await requireWriter();
  const current = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { status: true, docType: true },
  });
  if (!current) return { ok: false, error: "ไม่พบเอกสาร" };

  // No-op transition (e.g. SENT→SENT) is harmless; otherwise enforce the per-type machine.
  if (current.status !== status && !allowedTransitions(current.docType, current.status).includes(status)) {
    return { ok: false, error: `เปลี่ยนสถานะจาก ${current.status} เป็น ${status} ไม่ได้` };
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.invoice.updateMany({ where: { id, companyId: ctx.companyId, status: current.status }, data: { status } });
    if (result.count === 0) return false;
    await writeAudit(tx, ctx, "DOC_STATUS", "Invoice", id, `เปลี่ยนสถานะเป็น ${status}`);
    return true;
  });
  if (!updated) return { ok: false, error: "สถานะเอกสารถูกเปลี่ยนแปลง กรุณาโหลดใหม่" };
  revalidatePath("/documents");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true, id };
}

/** Copy an existing document into a fresh DRAFT of the SAME type (new number, today's date). */
export async function duplicateInvoice(id: string): Promise<InvoiceActionResult> {
  const ctx = await requireWriter();
  const src = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { items: true, shipments: true },
  });
  if (!src) return { ok: false, error: "ไม่พบเอกสาร" };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const copy = await db.$transaction(async (tx) => {
        const number = await nextDocumentNumber(tx, ctx.companyId, src.docType);
        const created = await tx.invoice.create({
          data: {
            companyId: ctx.companyId,
            docType: src.docType,
            number,
            customerId: src.customerId,
            issueDate: new Date(),
            dueDate: null,
            status: "DRAFT",
            jobType: src.jobType,
            subtotalSatang: src.subtotalSatang,
            docDiscountSatang: src.docDiscountSatang,
            vatSatang: src.vatSatang,
            whtSatang: src.whtSatang,
            netSatang: src.netSatang,
            trackingNo: src.trackingNo,
            note: src.note,
            paymentMethod: src.paymentMethod,
            createdById: ctx.userId,
            items: { create: src.items.map((it) => ({ description: it.description, pricingMode: it.pricingMode, qty: it.qty, unitPriceSatang: it.unitPriceSatang, discountSatang: it.discountSatang, lineTotalSatang: it.lineTotalSatang })) },
            shipments: src.shipments.length
              ? { create: src.shipments.map((s) => ({ trackingNo: s.trackingNo, note: s.note })) }
              : undefined,
          },
        });
        await writeAudit(tx, ctx, "INVOICE_COPY", "Invoice", created.id, `ก๊อปจาก ${src.number} → ${created.number}`);
        return created;
      });
      revalidatePath("/documents");
      revalidatePath("/invoices");
      return { ok: true, id: copy.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, error: "ก๊อปเอกสารไม่สำเร็จ กรุณาลองใหม่" };
}

/**
 * Convert an issued document into a downstream type (the workflow Biz108 can't do):
 * quotation → invoice/tax-invoice, invoice → receipt, tax-invoice → credit/debit note.
 * Clones items + discounts into a fresh DRAFT, links `sourceId`, and audits it.
 */
export async function convertDocument(id: string, target: DocType, rawDetails?: unknown): Promise<InvoiceActionResult> {
  const ctx = await requireWriter();
  const parsed = documentConversionSchema.safeParse({
    target,
    reason: typeof rawDetails === "object" && rawDetails !== null && "reason" in rawDetails
      ? (rawDetails as { reason?: unknown }).reason
      : undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const reason = parsed.data.reason?.trim() || null;
  const src = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { items: true },
  });
  if (!src) return { ok: false, error: "ไม่พบเอกสาร" };

  if (!conversionTargets(src.docType).includes(target)) {
    return { ok: false, error: `แปลง ${docMeta(src.docType).short} เป็น ${docMeta(target).short} ไม่ได้` };
  }
  if (!canConvertStatus(src.status)) {
    return { ok: false, error: `ไม่สามารถแปลงเอกสารสถานะ ${src.status} ได้` };
  }

  const targetMeta = docMeta(target);
  const setting = await db.taxSetting.findFirst({ where: { companyId: ctx.companyId, jobType: src.jobType } });
  if (!setting) return { ok: false, error: "ไม่พบการตั้งค่าภาษีของประเภทงานต้นทาง" };
  const tax = calcTax({ subtotalSatang: src.subtotalSatang, ...effectiveTaxSetting(target, setting) });
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const out = await db.$transaction(async (tx) => {
        const number = await nextDocumentNumber(tx, ctx.companyId, target);
        const created = await tx.invoice.create({
          data: {
            companyId: ctx.companyId,
            docType: target,
            number,
            customerId: src.customerId,
            issueDate: new Date(),
            receivedDate: targetMeta.dateField === "receivedDate" ? new Date() : null,
            refDocNumber: target === "CREDIT_NOTE" || target === "DEBIT_NOTE" ? src.number : null,
            reason,
            sourceId: src.id,
            status: "DRAFT",
            jobType: src.jobType,
            subtotalSatang: src.subtotalSatang,
            docDiscountSatang: src.docDiscountSatang,
            vatSatang: tax.vatSatang,
            whtSatang: tax.whtSatang,
            netSatang: tax.netSatang,
            trackingNo: src.trackingNo,
            note: src.note,
            createdById: ctx.userId,
            items: { create: src.items.map((it) => ({ description: it.description, pricingMode: it.pricingMode, qty: it.qty, unitPriceSatang: it.unitPriceSatang, discountSatang: it.discountSatang, lineTotalSatang: it.lineTotalSatang })) },
          },
        });
        await writeAudit(tx, ctx, "DOC_CONVERT", "Invoice", created.id, `แปลง ${src.number} → ${targetMeta.short} ${created.number}`);
        return created;
      });
      revalidatePath("/documents");
      revalidatePath("/invoices");
      revalidatePath(`/invoices/${id}`);
      return { ok: true, id: out.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, error: "แปลงเอกสารไม่สำเร็จ กรุณาลองใหม่" };
}

/**
 * Hard-delete a document. Destructive on a legal document, so it is OWNER-only (A8)
 * and restricted to DRAFT — an issued document must be voided, not erased.
 */
export async function deleteInvoice(id: string): Promise<InvoiceActionResult> {
  const ctx = await requireOwner();
  const target = await db.invoice.findFirst({ where: { id, companyId: ctx.companyId }, select: { number: true, status: true } });
  if (!target) return { ok: false, error: "ไม่พบเอกสาร" };
  if (target.status !== "DRAFT") {
    return { ok: false, error: "ลบได้เฉพาะฉบับร่าง (DRAFT) เท่านั้น เอกสารที่ออกแล้วต้องยกเลิก ไม่ใช่ลบ" };
  }
  const deleted = await db.$transaction(async (tx) => {
    const result = await tx.invoice.deleteMany({ where: { id, companyId: ctx.companyId, status: "DRAFT" } });
    if (result.count === 0) return false;
    await writeAudit(tx, ctx, "INVOICE_DELETE", "Invoice", id, `ลบเอกสาร ${target.number}`);
    return true;
  });
  if (!deleted) return { ok: false, error: "เอกสารถูกเปลี่ยนแปลง กรุณาโหลดใหม่" };
  revalidatePath("/documents");
  revalidatePath("/invoices");
  return { ok: true, id };
}
