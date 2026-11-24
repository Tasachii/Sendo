import { PrismaClient } from "@prisma/client";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemoData } from "../prisma/seed";
import { backupDatabase, restoreDatabase } from "../scripts/database";
import { createTestSchema } from "./database-test-utils";

const fixture = await createTestSchema("backup-test");
const backupPath = path.join(process.cwd(), "prisma", `backup-dump-${process.pid}.db`);
const restoredPath = path.join(process.cwd(), "prisma", `backup-restored-${process.pid}.db`);
const orphanRestorePath = path.join(process.cwd(), "prisma", `backup-orphan-${process.pid}.db`);
const sourceDb = new PrismaClient({ datasourceUrl: fixture.databaseUrl });

beforeAll(async () => {
  fixture.migrate();
  await seedDemoData(sourceDb);
});

afterAll(async () => {
  await sourceDb.$disconnect();
  await fixture.cleanup();
  await Promise.all([backupPath, restoredPath, `${orphanRestorePath}-wal`].map((file) => unlink(file).catch(() => undefined)));
});

describe("SQLite backup and restore", () => {
  it("preserves an issued invoice number and totals in a fresh database", async () => {
    const company = await sourceDb.company.findFirstOrThrow();
    const customer = await sourceDb.customer.findFirstOrThrow({ where: { companyId: company.id } });
    const owner = await sourceDb.user.findFirstOrThrow({ where: { companyId: company.id } });
    await sourceDb.invoice.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        createdById: owner.id,
        number: "INV-BACKUP-0001",
        status: "SENT",
        jobType: "transport_service",
        subtotalSatang: 2_000_000,
        vatSatang: 140_000,
        whtSatang: 60_000,
        netSatang: 2_080_000,
      },
    });

    await backupDatabase(fixture.databasePath, backupPath);
    await expect(backupDatabase(fixture.databasePath, backupPath)).rejects.toThrow("Backup already exists");
    await restoreDatabase(backupPath, restoredPath);

    const restoredDb = new PrismaClient({ datasourceUrl: `file:${restoredPath}` });
    try {
      await expect(restoredDb.invoice.findFirstOrThrow({ where: { number: "INV-BACKUP-0001" } })).resolves.toMatchObject({
        number: "INV-BACKUP-0001",
        status: "SENT",
        subtotalSatang: 2_000_000,
        vatSatang: 140_000,
        whtSatang: 60_000,
        netSatang: 2_080_000,
      });
      await expect(restoreDatabase(backupPath, restoredPath)).rejects.toThrow("Database already exists");
      await expect(restoredDb.invoice.findFirstOrThrow({ where: { number: "INV-BACKUP-0001" } })).resolves.toMatchObject({
        netSatang: 2_080_000,
      });
    } finally {
      await restoredDb.$disconnect();
    }

    await writeFile(`${orphanRestorePath}-wal`, "stale");
    await expect(restoreDatabase(backupPath, orphanRestorePath)).rejects.toThrow("orphan SQLite sidecar");
  });
});
