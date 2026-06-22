import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient, type Role } from "@prisma/client";

// Mock session + cache so server actions run outside a request (same pattern as
// tests/invoices.test.ts).
const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createDocument, convertDocument, issueInvoice } from "../app/actions/invoices";
import { nextDocumentNumber } from "../lib/invoice";
import { validateForIssue } from "../lib/poka-yoke";
import { conversionTargets, allowedTransitions, docMeta } from "../lib/docTypes";

const db = new PrismaClient();
let companyId = "";
let customerId = "";
let ownerId = "";

type Sess = { role: Role; companyId: string; userId: string };
let current: Sess | null = null;
const asUser = (s: Sess | null) => { current = s; };

beforeAll(async () => {
  getServerSession.mockImplementation(async () =>
    current ? { user: { id: current.userId, companyId: current.companyId, role: current.role, name: "tester", email: "t@test.co" } } : null
  );
  const c = await db.company.create({
    data: {
      name: "DOCS-TEST ขนส่ง", taxId: "0105550000030", address: "กทม.",
      taxSettings: { create: { jobType: "service", label: "บริการ", vatRate: 0.07, whtRate: 0.03, vatApplicable: true } },
    },
  });
  companyId = c.id;
  customerId = (await db.customer.create({
    data: { companyId, name: "ลูกค้า DOCS", taxId: "0105550000031", address: "เชียงใหม่", branch: "สำนักงานใหญ่", isVatRegistered: true },
  })).id;
  ownerId = (await db.user.create({ data: { companyId, email: `docs-${Date.now()}@t.test`, passwordHash: "x", name: "owner", role: "OWNER" } })).id;
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { companyId } });
  await db.invoiceItem.deleteMany({ where: { invoice: { companyId } } });
  await db.invoice.deleteMany({ where: { companyId } });
  await db.documentCounter.deleteMany({ where: { companyId } });
  await db.invoiceCounter.deleteMany({ where: { companyId } });
  await db.customer.deleteMany({ where: { companyId } });
  await db.taxSetting.deleteMany({ where: { companyId } });
  await db.user.deleteMany({ where: { companyId } });
  await db.company.deleteMany({ where: { id: companyId } });
  await db.$disconnect();
});

beforeEach(() => asUser({ role: "OWNER", companyId, userId: ownerId }));

describe("docTypes metadata", () => {
  it("defines the right conversion edges", () => {
    expect(conversionTargets("QUOTATION")).toEqual(expect.arrayContaining(["BILLING_NOTE", "TAX_INVOICE"]));
    expect(conversionTargets("TAX_INVOICE")).toEqual(expect.arrayContaining(["RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE"]));
    expect(conversionTargets("RECEIPT")).toEqual([]); // terminal
  });

  it("uses per-type status machines", () => {
    expect(allowedTransitions("QUOTATION", "SENT")).toEqual(expect.arrayContaining(["ACCEPTED", "REJECTED", "EXPIRED"]));
    expect(allowedTransitions("TAX_INVOICE", "SENT")).toEqual(expect.arrayContaining(["PAID", "OVERDUE"]));
    expect(allowedTransitions("TAX_INVOICE", "PAID")).not.toContain("SENT"); // can't un-pay to sent
  });

  it("keeps TAX_INVOICE on the legacy INV series", () => {
    expect(docMeta("TAX_INVOICE").series).toBe("INV");
    expect(docMeta("QUOTATION").series).toBe("QUO");
  });
});

describe("poka-yoke is gate-aware", () => {
  const seller = { name: "บ. ขนส่ง", address: "กทม.", taxId: "0105551234567", branch: "สำนักงานใหญ่" };
  const bareBuyer = { name: "ลูกค้า", address: null, branch: "สำนักงานใหญ่", taxId: null, isVatRegistered: false };
  const items = [{ description: "บริการ", qty: 1, unitPriceSatang: 50000 }];

  it("LIGHT gate (quotation) passes without buyer address/taxId", () => {
    const errs = validateForIssue({ docType: "QUOTATION", company: seller, customer: bareBuyer, invoice: { number: "QUO-1", issueDate: new Date() }, items });
    expect(errs).toEqual([]);
  });

  it("FULL gate (tax invoice) still requires a buyer address", () => {
    const errs = validateForIssue({ docType: "TAX_INVOICE", company: seller, customer: bareBuyer, invoice: { number: "INV-1", issueDate: new Date() }, items });
    expect(errs.some((e) => e.includes("ที่อยู่"))).toBe(true);
  });

  it("SUBSTITUTE gate requires a payee name and a reason", () => {
    const errs = validateForIssue({ docType: "RECEIPT_SUBSTITUTE", company: seller, customer: { ...bareBuyer, name: "" }, invoice: { number: "RCS-1", issueDate: new Date(), payeeName: "", reason: "" }, items });
    expect(errs.some((e) => e.includes("ผู้รับเงิน"))).toBe(true);
    expect(errs.some((e) => e.includes("เหตุผล"))).toBe(true);
  });
});

describe("nextDocumentNumber — per-series sequences", () => {
  it("numbers each series independently with its own prefix", async () => {
    const out = await db.$transaction(async (tx) => ({
      q1: await nextDocumentNumber(tx, companyId, "QUOTATION", 2095),
      q2: await nextDocumentNumber(tx, companyId, "QUOTATION", 2095),
      r1: await nextDocumentNumber(tx, companyId, "RECEIPT", 2095),
      t1: await nextDocumentNumber(tx, companyId, "TAX_INVOICE", 2095),
    }));
    expect(out.q1).toBe("QUO-2095-0001");
    expect(out.q2).toBe("QUO-2095-0002");
    expect(out.r1).toBe("REC-2095-0001"); // independent series
    expect(out.t1).toBe("INV-2095-0001"); // legacy InvoiceCounter
  });
});

describe("convertDocument — quotation → tax invoice → receipt", () => {
  it("clones items, links the source, and numbers in the target series", async () => {
    // create + issue a quotation
    const made = await createDocument({
      docType: "QUOTATION", customerId, jobType: "service", issueDate: "2026-03-01",
      items: [{ description: "งานออกแบบ", qty: 1, unitPriceBaht: 5000 }], shipments: [],
    });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const quoteId = made.id;
    expect((await db.invoice.findUniqueOrThrow({ where: { id: quoteId } })).number).toMatch(/^QUO-/);
    expect((await issueInvoice(quoteId)).ok).toBe(true);

    // can't convert to a non-allowed target
    expect((await convertDocument(quoteId, "RECEIPT")).ok).toBe(false);

    // quotation → tax invoice
    const toInv = await convertDocument(quoteId, "TAX_INVOICE");
    expect(toInv.ok).toBe(true);
    if (!toInv.ok) return;
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: toInv.id }, include: { items: true } });
    expect(inv.docType).toBe("TAX_INVOICE");
    expect(inv.number).toMatch(/^INV-/);
    expect(inv.sourceId).toBe(quoteId);
    expect(inv.items).toHaveLength(1);
    expect(inv.items[0].description).toBe("งานออกแบบ");

    // issue the invoice, then convert → receipt
    expect((await issueInvoice(inv.id)).ok).toBe(true);
    const toRec = await convertDocument(inv.id, "RECEIPT");
    expect(toRec.ok).toBe(true);
    if (!toRec.ok) return;
    const rec = await db.invoice.findUniqueOrThrow({ where: { id: toRec.id } });
    expect(rec.docType).toBe("RECEIPT");
    expect(rec.number).toMatch(/^REC-/);
    expect(rec.sourceId).toBe(inv.id);

    // the conversion was audited
    const audit = await db.auditLog.findFirst({ where: { companyId, entityId: rec.id, action: "DOC_CONVERT" } });
    expect(audit).not.toBeNull();
  });

  it("refuses to convert a DRAFT document", async () => {
    const made = await createDocument({
      docType: "QUOTATION", customerId, jobType: "service", issueDate: "2026-03-01",
      items: [{ description: "x", qty: 1, unitPriceBaht: 100 }], shipments: [],
    });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect((await convertDocument(made.id, "TAX_INVOICE")).ok).toBe(false); // still DRAFT
  });
});
