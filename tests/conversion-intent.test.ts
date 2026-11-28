import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestSchema } from "./database-test-utils";

const fixture = await createTestSchema("conversion-intent");
const clients = Array.from({ length: 4 }, () => new PrismaClient({ datasourceUrl: fixture.databaseUrl }));
const [db] = clients;
const request = new AsyncLocalStorage<{ client: PrismaClient; userId: string }>();
vi.mock("@/lib/db", () => ({ get db() { return request.getStore()?.client ?? db; } }));
vi.mock("next-auth", () => ({
  getServerSession: () => ({ user: { id: request.getStore()?.userId } }),
}));
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { convertDocument, deleteInvoice } from "../app/actions/invoices";

async function tenant() {
  const company = await db.company.create({
    data: {
      name: "Synthetic tenant", address: "Test", taxId: "0000000000000",
      customers: { create: { name: "Synthetic buyer" } },
      users: { create: { name: "Owner", role: "OWNER", email: `${randomUUID()}@example.test`, passwordHash: "unused" } },
      taxSettings: { create: { jobType: "test", label: "Test", vatApplicable: false, vatRate: 0, whtRate: 0 } },
    },
    include: { users: true, customers: true },
  });
  const userId = company.users[0].id;
  const source = await db.invoice.create({
    data: {
      companyId: company.id, createdById: userId, customerId: company.customers[0].id,
      number: "INV-OLD-0001", status: "SENT", jobType: "test", subtotalSatang: 50,
      vatSatang: 0, whtSatang: 0, netSatang: 50,
      items: { create: { description: "Synthetic item", qty: 1, unitPriceSatang: 50, lineTotalSatang: 50 } },
    },
  });
  return { companyId: company.id, sourceId: source.id, userId };
}

const as = <T>(userId: string, call: () => Promise<T>, client = db) => request.run({ userId, client }, call);

beforeAll(() => fixture.migrate());
afterAll(async () => {
  await Promise.all(clients.map((c) => c.$disconnect()));
  await fixture.cleanup();
});

describe("one conversion per scoped intent", () => {
  it("serializes competing requests from separate SQLite clients without consuming extra numbers", async () => {
    const { companyId, sourceId, userId } = await tenant();
    const details = { intentKey: randomUUID() };
    const results = await Promise.all(clients.map((client) =>
      as(userId, () => convertDocument(sourceId, "RECEIPT", details), client)));
    expect(results[0].ok).toBe(true);
    expect(results).toEqual(Array(clients.length).fill(results[0]));
    expect(await db.invoice.count({ where: { sourceId } })).toBe(1);
    expect(await db.auditLog.count({ where: { companyId, action: "DOC_CONVERT" } })).toBe(1);
    expect(await db.documentCounter.findFirst({ where: { companyId, series: "REC" } })).toMatchObject({ lastSeq: 1 });

    const independent = await Promise.all(clients.map((client) =>
      as(userId, () => convertDocument(sourceId, "RECEIPT", { intentKey: randomUUID() }), client)));
    expect(independent.every((r) => r.ok)).toBe(true);
    expect(new Set(independent.map((r) => r.ok && r.id)).size).toBe(clients.length);
    expect(await db.documentCounter.findFirst({ where: { companyId, series: "REC" } })).toMatchObject({ lastSeq: 5 });
  });

  it("recovers a committed result after a lost response even when the source later changes", async () => {
    const { companyId, sourceId, userId } = await tenant();
    const details = { intentKey: randomUUID(), reason: " correction " };
    revalidatePath.mockImplementationOnce(() => { throw new Error("response lost after commit"); });
    await expect(as(userId, () => convertDocument(sourceId, "CREDIT_NOTE", details))).rejects.toThrow("response lost");
    const original = await db.invoice.findFirstOrThrow({ where: { sourceId } });
    await db.invoice.update({ where: { id: sourceId }, data: { status: "VOID" } });
    expect(await as(userId, () => convertDocument(sourceId, "CREDIT_NOTE", { ...details, reason: "correction" })))
      .toEqual({ ok: true, id: original.id });
    expect(await as(userId, () => convertDocument(sourceId, "CREDIT_NOTE", { ...details, intentKey: randomUUID() })))
      .toMatchObject({ ok: false });
    expect(await db.auditLog.count({ where: { companyId, action: "DOC_CONVERT" } })).toBe(1);
    await as(userId, () => deleteInvoice(original.id));
    expect(await as(userId, () => convertDocument(sourceId, "CREDIT_NOTE", details))).toMatchObject({ ok: false });
    expect(await db.invoice.count({ where: { sourceId } })).toBe(0);
  });

  it("binds the key to source, target and normalized reason, authenticates replays, and scopes by actor and tenant", async () => {
    const a = await tenant();
    const b = await tenant();
    const details = { intentKey: randomUUID(), reason: "test" };
    const convert = (actor: string, source: string) => as(actor, () => convertDocument(source, "CREDIT_NOTE", details));
    const original = await convert(a.userId, a.sourceId);
    expect(original.ok).toBe(true);
    for (const change of [
      () => convertDocument(a.sourceId, "DEBIT_NOTE", details),
      () => convertDocument(a.sourceId, "CREDIT_NOTE", { ...details, reason: "changed" }),
      () => convertDocument(b.sourceId, "CREDIT_NOTE", details),
    ]) expect(await as(a.userId, change)).toMatchObject({ ok: false });
    expect(await convert(b.userId, a.sourceId)).toMatchObject({ ok: false });
    const foreign = await convert(b.userId, b.sourceId);
    expect(foreign.ok).toBe(true);
    expect(foreign).not.toEqual(original);
    const staff = await db.user.create({ data: { companyId: a.companyId, name: "Staff", email: "staff@example.test", passwordHash: "unused" } });
    const another = await convert(staff.id, a.sourceId);
    expect(another.ok).toBe(true);
    expect(another).not.toEqual(original);
    await db.user.update({ where: { id: a.userId }, data: { role: "VIEWER" } });
    await expect(convert(a.userId, a.sourceId)).rejects.toThrow("FORBIDDEN");
    expect(await db.invoice.count({ where: { sourceId: a.sourceId } })).toBe(2);
  });

  it("rolls back a failed audit, leaves its key retryable, and accepts independent legacy calls", async () => {
    const { companyId, sourceId, userId } = await tenant();
    const convert = (details?: unknown) => as(userId, () => convertDocument(sourceId, "RECEIPT", details));
    const details = { intentKey: randomUUID() };
    for (const id of [undefined, "", {}, null]) {
      expect(await as(userId, () => convertDocument(id as string, "RECEIPT", details))).toMatchObject({ ok: false });
    }
    for (const intentKey of ["", null, 123, "bad key"]) expect(await convert({ intentKey })).toMatchObject({ ok: false });
    await db.$executeRaw`CREATE TRIGGER fail_convert BEFORE INSERT ON AuditLog WHEN NEW.action = 'DOC_CONVERT'
      BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END`;
    try {
      await expect(convert(details)).rejects.toThrow();
      expect(await db.invoice.count({ where: { sourceId } })).toBe(0);
      expect(await db.conversionIntent.count({ where: { companyId } })).toBe(0);
      expect(await db.documentCounter.count({ where: { companyId } })).toBe(0);
    } finally {
      await db.$executeRaw`DROP TRIGGER fail_convert`;
    }
    expect(await convert(details)).toMatchObject({ ok: true });
    expect(await convert()).toMatchObject({ ok: true });
    expect(await convert({})).toMatchObject({ ok: true });
    expect(await db.documentCounter.findFirst({ where: { companyId } })).toMatchObject({ lastSeq: 3 });
    expect(await db.auditLog.count({ where: { companyId, action: "DOC_CONVERT" } })).toBe(3);
  });
});
