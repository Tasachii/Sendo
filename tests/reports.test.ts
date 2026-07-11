import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { InvoiceStatus, PrismaClient } from "@prisma/client";
import { monthlySummary } from "../lib/reports";

const db = new PrismaClient();
let companyId = "";
let customerId = "";
let ownerId = "";

const Y = 2097; // a year with no other data

beforeAll(async () => {
  const c = await db.company.create({ data: { name: "REPORT-TEST", taxId: "1", address: "a" } });
  companyId = c.id;
  customerId = (await db.customer.create({ data: { companyId, name: "ลูกค้า" } })).id;
  ownerId = (await db.user.create({ data: { companyId, email: `r-${Date.now()}@t.test`, passwordHash: "x", name: "u" } })).id;

  const base = (status: InvoiceStatus, month: number, n: number, issueDate?: Date) => ({
    companyId, number: `R-${month}-${n}`, customerId, createdById: ownerId,
    issueDate: issueDate ?? new Date(Date.UTC(Y, month, 15, 12)), status, jobType: "service",
    subtotalSatang: 1_000_000, vatSatang: 70_000, whtSatang: 30_000, netSatang: 1_040_000,
  });
  // two issued in Jan, one draft in Jan (must be excluded), one issued in Feb
  await db.invoice.create({ data: base("SENT", 0, 1) });
  await db.invoice.create({ data: base("SENT", 0, 2) });
  await db.invoice.create({ data: base("DRAFT", 0, 3) });
  await db.invoice.create({ data: base("VOID", 0, 4) });
  await db.invoice.create({ data: base("REJECTED", 0, 5) });
  await db.invoice.create({ data: base("EXPIRED", 0, 6) });
  await db.invoice.create({ data: base("SENT", 1, 1) });
  // 18:30Z is already the next legal day/month in Asia/Bangkok.
  await db.invoice.create({
    data: base("SENT", 7, 1, new Date(`${Y}-07-31T18:30:00.000Z`)),
  });
});

afterAll(async () => {
  await db.invoice.deleteMany({ where: { companyId } });
  await db.customer.deleteMany({ where: { companyId } });
  await db.user.deleteMany({ where: { companyId } });
  await db.company.deleteMany({ where: { id: companyId } });
  await db.$disconnect();
});

describe("monthlySummary", () => {
  it("sums countable issued invoices and excludes DRAFT/VOID/REJECTED/EXPIRED", async () => {
    const rows = await monthlySummary(companyId, Y);
    const jan = rows[0];
    expect(jan.count).toBe(2); // draft excluded
    expect(jan.vatSatang).toBe(140_000);
    expect(jan.whtSatang).toBe(60_000);
    const feb = rows[1];
    expect(feb.count).toBe(1);
    expect(feb.subtotalSatang).toBe(1_000_000);
  });

  it("groups a UTC boundary instant by its Asia/Bangkok legal month", async () => {
    const rows = await monthlySummary(companyId, Y);
    expect(rows[6].count).toBe(0); // July UTC instant is August in Bangkok
    expect(rows[7].count).toBe(1);
  });

  it("returns 12 months", async () => {
    const rows = await monthlySummary(companyId, Y);
    expect(rows).toHaveLength(12);
    expect(rows[11].count).toBe(0);
  });
});
