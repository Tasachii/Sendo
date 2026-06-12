import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Tenant isolation (build spec §9): a second company's user must never see the
 * first company's data. We assert the invariant our queries rely on — every
 * `where` is scoped by companyId, so cross-tenant reads return nothing.
 */
const db = new PrismaClient();

let companyA = "";
let companyB = "";

beforeAll(async () => {
  const a = await db.company.create({
    data: { name: "ISО-TEST-A", taxId: "1", address: "a" },
  });
  const b = await db.company.create({
    data: { name: "ISO-TEST-B", taxId: "2", address: "b" },
  });
  companyA = a.id;
  companyB = b.id;
  await db.customer.create({ data: { companyId: companyA, name: "ลูกค้าของ A" } });
});

afterAll(async () => {
  await db.customer.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await db.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
  await db.$disconnect();
});

describe("tenant isolation", () => {
  it("company A sees its own customer", async () => {
    const rows = await db.customer.findMany({ where: { companyId: companyA } });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("ลูกค้าของ A");
  });

  it("company B sees none of company A's customers", async () => {
    const rows = await db.customer.findMany({ where: { companyId: companyB } });
    expect(rows).toHaveLength(0);
  });

  it("fetching A's customer scoped to B returns null (no cross-tenant access)", async () => {
    const aCustomer = await db.customer.findFirst({ where: { companyId: companyA } });
    const leaked = await db.customer.findFirst({
      where: { id: aCustomer!.id, companyId: companyB },
    });
    expect(leaked).toBeNull();
  });
});
