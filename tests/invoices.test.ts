import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient, type InvoiceStatus, type Role } from "@prisma/client";

// --- mock the session + Next cache so server actions run outside a request ---
// vi.hoisted lets the factory reference getServerSession (vi.mock is hoisted above imports).
const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createInvoice,
  issueInvoice,
  setInvoiceStatus,
  duplicateInvoice,
  deleteInvoice,
} from "../app/actions/invoices";

const db = new PrismaClient();

let companyId = "";
let otherCompanyId = "";
let customerId = "";
let ownerId = "";

type Sess = { role: Role; companyId: string; userId: string };
let current: Sess | null = null;

function asUser(s: Sess | null) {
  current = s;
}

beforeAll(async () => {
  getServerSession.mockImplementation(async () =>
    current ? { user: { id: current.userId, companyId: current.companyId, role: current.role, name: "tester", email: "t@test.co" } } : null
  );

  const c = await db.company.create({
    data: {
      name: "ACT-TEST ขนส่ง", taxId: "0105550000010", address: "กทม.",
      taxSettings: { create: { jobType: "transport_service", label: "ขนส่งพ่วงบริการ", vatRate: 0.07, whtRate: 0.03, vatApplicable: true } },
    },
  });
  companyId = c.id;
  const other = await db.company.create({ data: { name: "ACT-OTHER", taxId: "0105550000011", address: "กทม." } });
  otherCompanyId = other.id;

  customerId = (await db.customer.create({
    data: { companyId, name: "ลูกค้า ACT", taxId: "0105550000012", address: "เชียงใหม่", branch: "สำนักงานใหญ่", isVatRegistered: true },
  })).id;

  ownerId = (await db.user.create({
    data: { companyId, email: `act-${Date.now()}@t.test`, passwordHash: "x", name: "owner", role: "OWNER" },
  })).id;
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await db.invoiceItem.deleteMany({ where: { invoice: { companyId } } });
  await db.invoice.deleteMany({ where: { companyId } });
  await db.invoiceCounter.deleteMany({ where: { companyId } });
  await db.customer.deleteMany({ where: { companyId } });
  await db.taxSetting.deleteMany({ where: { companyId } });
  await db.user.deleteMany({ where: { companyId } });
  await db.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await db.$disconnect();
});

beforeEach(() => asUser({ role: "OWNER", companyId, userId: ownerId }));

// helper: create a DRAFT invoice directly in the DB at a chosen status
async function makeInvoice(status: InvoiceStatus = "DRAFT", overrides: Record<string, unknown> = {}) {
  return db.$transaction(async (tx) => {
    const counter = await tx.invoiceCounter.upsert({
      where: { companyId_year: { companyId, year: 2088 } },
      create: { companyId, year: 2088, lastSeq: 1 },
      update: { lastSeq: { increment: 1 } },
    });
    return tx.invoice.create({
      data: {
        companyId, number: `INV-2088-${String(counter.lastSeq).padStart(4, "0")}`,
        customerId, jobType: "transport_service", status,
        issueDate: new Date("2020-01-01"), // deliberately stale to test A9 stamping
        subtotalSatang: 2_000_000, vatSatang: 140_000, whtSatang: 60_000, netSatang: 2_080_000,
        createdById: ownerId,
        items: { create: [{ description: "ค่าขนส่ง", pricingMode: "FLAT", qty: 1, unitPriceSatang: 2_000_000, lineTotalSatang: 2_000_000 }] },
        ...overrides,
      },
    });
  });
}

describe("setInvoiceStatus — transition whitelist (A3)", () => {
  it("allows SENT->PAID, SENT->OVERDUE, OVERDUE->PAID", async () => {
    const a = await makeInvoice("SENT");
    expect(await setInvoiceStatus(a.id, "PAID")).toEqual({ ok: true, id: a.id });

    const b = await makeInvoice("SENT");
    expect(await setInvoiceStatus(b.id, "OVERDUE")).toEqual({ ok: true, id: b.id });

    const c = await makeInvoice("OVERDUE");
    expect(await setInvoiceStatus(c.id, "PAID")).toEqual({ ok: true, id: c.id });
  });

  it("rejects un-issuing a legal document (PAID/SENT/OVERDUE -> DRAFT)", async () => {
    for (const from of ["PAID", "SENT", "OVERDUE"] as InvoiceStatus[]) {
      const inv = await makeInvoice(from);
      const res = await setInvoiceStatus(inv.id, "DRAFT");
      expect(res.ok).toBe(false);
      const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect(after.status).toBe(from); // unchanged
    }
  });

  it("rejects PAID->SENT (not in the whitelist)", async () => {
    const inv = await makeInvoice("PAID");
    expect((await setInvoiceStatus(inv.id, "SENT")).ok).toBe(false);
  });

  it("returns 'ไม่พบใบแจ้งหนี้' for a cross-tenant invoice id", async () => {
    const inv = await makeInvoice("SENT");
    asUser({ role: "OWNER", companyId: otherCompanyId, userId: ownerId });
    const res = await setInvoiceStatus(inv.id, "PAID");
    expect(res).toEqual({ ok: false, error: "ไม่พบใบแจ้งหนี้" });
  });
});

describe("deleteInvoice — DRAFT-only + OWNER-only (A7 / A8)", () => {
  it("OWNER can delete a DRAFT", async () => {
    const inv = await makeInvoice("DRAFT");
    expect(await deleteInvoice(inv.id)).toEqual({ ok: true, id: inv.id });
    expect(await db.invoice.findUnique({ where: { id: inv.id } })).toBeNull();
  });

  it("cannot delete SENT/PAID/OVERDUE (record stays)", async () => {
    for (const st of ["SENT", "PAID", "OVERDUE"] as InvoiceStatus[]) {
      const inv = await makeInvoice(st);
      const res = await deleteInvoice(inv.id);
      expect(res.ok).toBe(false);
      expect(await db.invoice.findUnique({ where: { id: inv.id } })).not.toBeNull();
    }
  });

  it("STAFF cannot delete even a DRAFT (requireOwner)", async () => {
    const inv = await makeInvoice("DRAFT");
    asUser({ role: "STAFF", companyId, userId: ownerId });
    await expect(deleteInvoice(inv.id)).rejects.toThrow("FORBIDDEN_OWNER_ONLY");
    expect(await db.invoice.findUnique({ where: { id: inv.id } })).not.toBeNull();
  });

  it("cross-tenant delete is a no-op (not found)", async () => {
    const inv = await makeInvoice("DRAFT");
    asUser({ role: "OWNER", companyId: otherCompanyId, userId: ownerId });
    const res = await deleteInvoice(inv.id);
    expect(res.ok).toBe(false);
    expect(await db.invoice.findUnique({ where: { id: inv.id } })).not.toBeNull();
  });
});

describe("issueInvoice (A9 — stamp issueDate at issue)", () => {
  it("stamps issueDate to ~now and moves DRAFT -> SENT", async () => {
    const inv = await makeInvoice("DRAFT");
    const before = Date.now();
    const res = await issueInvoice(inv.id);
    expect(res.ok).toBe(true);
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe("SENT");
    expect(after.issueDate.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(after.issueDate.getFullYear()).toBe(new Date().getFullYear()); // not the stale 2020 date
  });

  it("re-issuing an already-SENT invoice is a no-op on the date (status guard)", async () => {
    const inv = await makeInvoice("DRAFT");
    await issueInvoice(inv.id);
    const firstIssue = (await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).issueDate.getTime();
    await issueInvoice(inv.id); // SENT now → updateMany where status DRAFT matches nothing
    const secondIssue = (await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).issueDate.getTime();
    expect(secondIssue).toBe(firstIssue);
  });
});

describe("duplicateInvoice", () => {
  it("copies into a fresh DRAFT with a new number, today's issueDate, null dueDate, and identical amounts/items", async () => {
    const src = await makeInvoice("SENT", { dueDate: new Date("2099-12-31") });
    const res = await duplicateInvoice(src.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const copy = await db.invoice.findUniqueOrThrow({ where: { id: res.id }, include: { items: true } });
    expect(copy.status).toBe("DRAFT");
    expect(copy.number).not.toBe(src.number);
    expect(copy.dueDate).toBeNull();
    expect(copy.issueDate.getFullYear()).toBe(new Date().getFullYear());
    // amounts copied verbatim (no recompute drift)
    expect(copy.subtotalSatang).toBe(src.subtotalSatang);
    expect(copy.vatSatang).toBe(src.vatSatang);
    expect(copy.whtSatang).toBe(src.whtSatang);
    expect(copy.netSatang).toBe(src.netSatang);
    expect(copy.items).toHaveLength(1);
    expect(copy.items[0].lineTotalSatang).toBe(2_000_000);

    const audit = await db.auditLog.findFirst({ where: { companyId, entityId: copy.id, action: "INVOICE_COPY" } });
    expect(audit).not.toBeNull();
  });

  it("returns 'ไม่พบใบแจ้งหนี้' for a cross-tenant id", async () => {
    const src = await makeInvoice("SENT");
    asUser({ role: "OWNER", companyId: otherCompanyId, userId: ownerId });
    expect(await duplicateInvoice(src.id)).toEqual({ ok: false, error: "ไม่พบใบแจ้งหนี้" });
  });
});

describe("server-action auth boundary", () => {
  it("VIEWER is blocked from every write action", async () => {
    const inv = await makeInvoice("DRAFT");
    asUser({ role: "VIEWER", companyId, userId: ownerId });
    // writer-gated actions reject a VIEWER specifically
    await expect(createInvoice({})).rejects.toThrow("FORBIDDEN_VIEWER_READONLY");
    await expect(issueInvoice(inv.id)).rejects.toThrow("FORBIDDEN_VIEWER_READONLY");
    await expect(setInvoiceStatus(inv.id, "SENT")).rejects.toThrow("FORBIDDEN_VIEWER_READONLY");
    await expect(duplicateInvoice(inv.id)).rejects.toThrow("FORBIDDEN_VIEWER_READONLY");
    // delete is owner-gated, so a VIEWER is blocked as not-OWNER (A8) — still forbidden
    await expect(deleteInvoice(inv.id)).rejects.toThrow("FORBIDDEN_OWNER_ONLY");
  });

  it("STAFF may issue/duplicate/status but NOT delete (A8 policy)", async () => {
    const inv = await makeInvoice("DRAFT");
    asUser({ role: "STAFF", companyId, userId: ownerId });
    // status change allowed for STAFF
    await issueInvoice(inv.id);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("SENT");
    expect((await setInvoiceStatus(inv.id, "PAID")).ok).toBe(true);
    expect((await duplicateInvoice(inv.id)).ok).toBe(true);
    // delete is OWNER-only
    await expect(deleteInvoice(inv.id)).rejects.toThrow("FORBIDDEN_OWNER_ONLY");
  });

  it("unauthenticated requests throw UNAUTHENTICATED", async () => {
    const inv = await makeInvoice("DRAFT");
    asUser(null);
    await expect(issueInvoice(inv.id)).rejects.toThrow("UNAUTHENTICATED");
    await expect(deleteInvoice(inv.id)).rejects.toThrow("UNAUTHENTICATED");
  });
});
