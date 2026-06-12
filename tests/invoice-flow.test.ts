import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { computeTotals, nextInvoiceNumber } from "../lib/invoice";
import { validateForIssue } from "../lib/poka-yoke";

const db = new PrismaClient();
let companyId = "";
let customerId = "";
let ownerId = "";

beforeAll(async () => {
  const c = await db.company.create({
    data: {
      name: "FLOW-TEST ขนส่ง", taxId: "0105550000001", address: "กทม.",
      taxSettings: { create: { jobType: "transport_service", label: "ขนส่งพ่วงบริการ", vatRate: 0.07, whtRate: 0.03, vatApplicable: true } },
    },
  });
  companyId = c.id;
  const cust = await db.customer.create({
    data: { companyId, name: "ลูกค้า FLOW", taxId: "0105550000002", address: "เชียงใหม่", isVatRegistered: true },
  });
  customerId = cust.id;
  const owner = await db.user.create({
    data: { companyId, email: `flow-${Date.now()}@t.test`, passwordHash: "x", name: "u" },
  });
  ownerId = owner.id;
});

afterAll(async () => {
  await db.invoiceItem.deleteMany({ where: { invoice: { companyId } } });
  await db.invoice.deleteMany({ where: { companyId } });
  await db.invoiceCounter.deleteMany({ where: { companyId } });
  await db.customer.deleteMany({ where: { companyId } });
  await db.taxSetting.deleteMany({ where: { companyId } });
  await db.user.deleteMany({ where: { companyId } });
  await db.company.deleteMany({ where: { id: companyId } });
  await db.$disconnect();
});

async function createInvoice(amountBaht: number) {
  const setting = await db.taxSetting.findFirstOrThrow({ where: { companyId, jobType: "transport_service" } });
  const totals = computeTotals([{ description: "ค่าขนส่งพ่วงบริการ", qty: 1, unitPriceBaht: amountBaht }], setting);
  return db.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx, companyId, 2099);
    return tx.invoice.create({
      data: {
        companyId, number, customerId, jobType: "transport_service", status: "DRAFT",
        subtotalSatang: totals.subtotalSatang, vatSatang: totals.vatSatang, whtSatang: totals.whtSatang, netSatang: totals.netSatang,
        createdById: ownerId, items: { create: totals.items },
      },
      include: { items: true },
    });
  });
}

describe("invoice flow (numbering + totals + poka-yoke)", () => {
  it("assigns sequential, gap-free numbers per year", async () => {
    const a = await createInvoice(20000);
    const b = await createInvoice(20000);
    expect(a.number).toBe("INV-2099-0001");
    expect(b.number).toBe("INV-2099-0002");
  });

  it("computes totals authoritatively (20,000 -> vat 1,400 / wht 600 / net 20,800)", async () => {
    const inv = await db.invoice.findFirstOrThrow({ where: { companyId, number: "INV-2099-0001" } });
    expect(inv.subtotalSatang).toBe(2_000_000);
    expect(inv.vatSatang).toBe(140_000);
    expect(inv.whtSatang).toBe(60_000);
    expect(inv.netSatang).toBe(2_080_000);
  });

  it("a complete invoice passes poka-yoke and can be issued", async () => {
    const inv = await db.invoice.findFirstOrThrow({ where: { companyId, number: "INV-2099-0001" }, include: { customer: true, items: true, company: true } });
    const missing = validateForIssue({
      company: inv.company, customer: inv.customer,
      invoice: { number: inv.number, issueDate: inv.issueDate }, items: inv.items,
    });
    expect(missing).toEqual([]);
  });

  it("concurrent creates never collide on the number", async () => {
    const results = await Promise.all([createInvoice(1000), createInvoice(1000), createInvoice(1000)]);
    const numbers = results.map((r) => r.number);
    expect(new Set(numbers).size).toBe(3); // all unique
  });
});
