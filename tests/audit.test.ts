import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { writeAudit } from "../lib/audit";

const db = new PrismaClient();
let companyId = "";
let customerId = "";
let userId = "";

beforeAll(async () => {
  const company = await db.company.create({ data: { name: "AUDIT-TEST", taxId: "1", address: "a" } });
  companyId = company.id;
  customerId = (await db.customer.create({ data: { companyId, name: "customer" } })).id;
  userId = (await db.user.create({ data: { companyId, email: `audit-${Date.now()}@test.co`, passwordHash: "x", name: "user" } })).id;
});

afterAll(async () => {
  await db.invoice.deleteMany({ where: { companyId } });
  await db.auditLog.deleteMany({ where: { companyId } });
  await db.customer.deleteMany({ where: { companyId } });
  await db.user.deleteMany({ where: { companyId } });
  await db.company.delete({ where: { id: companyId } });
  await db.$disconnect();
});

describe("required audit transaction", () => {
  it("rolls back the business write when the audit write fails", async () => {
    const number = `AUDIT-ROLLBACK-${Date.now()}`;
    await expect(db.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          companyId, customerId, createdById: userId, number, jobType: "service",
          subtotalSatang: 100, vatSatang: 0, whtSatang: 0, netSatang: 100,
        },
      });
      await writeAudit(tx, {
        companyId: "missing-company", userId, role: "OWNER", name: "user", email: "user@test.co",
      }, "DOC_CREATE", "Invoice", invoice.id);
    })).rejects.toThrow();

    expect(await db.invoice.findFirst({ where: { number } })).toBeNull();
  });
});
