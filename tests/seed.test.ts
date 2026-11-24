import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemoData } from "../prisma/seed";
import { createCommandWrappers, createTestSchema } from "./database-test-utils";

const fixture = await createTestSchema("seed-test");
const db = new PrismaClient({ datasourceUrl: fixture.databaseUrl });
let wrapperDirectory = "";

beforeAll(async () => {
  fixture.migrate();
  wrapperDirectory = await createCommandWrappers();
});

afterAll(async () => {
  await db.$disconnect();
  await fixture.cleanup();
  if (wrapperDirectory) await rm(wrapperDirectory, { recursive: true });
});

function bootDemo(databaseUrl = fixture.databaseUrl) {
  return spawnSync("sh", [path.join(process.cwd(), "docker-entrypoint.sh")], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${wrapperDirectory}:${process.env.PATH}`,
      SENDO_DEMO_SEED: "true",
      SENDO_DATABASE_URL: databaseUrl,
      SENDO_TEST_NODE: process.execPath,
      SENDO_TEST_NPM: process.env.npm_execpath,
      SENDO_TEST_PRISMA: path.join(process.cwd(), "node_modules/prisma/build/index.js"),
      SENDO_TEST_SCHEMA: fixture.schemaPath,
    },
  });
}

describe("demo seed safety", () => {
  it("preserves a company and issued invoice across two container boots", async () => {
    const firstBoot = bootDemo();
    expect(firstBoot.status, firstBoot.stderr).toBe(0);

    const company = await db.company.findFirstOrThrow();
    const customer = await db.customer.findFirstOrThrow({ where: { companyId: company.id } });
    const owner = await db.user.findFirstOrThrow({ where: { companyId: company.id } });

    const invoice = await db.invoice.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        createdById: owner.id,
        number: "INV-SEED-SAFETY",
        status: "SENT",
        jobType: "transport_only",
        subtotalSatang: 100_000,
        vatSatang: 0,
        whtSatang: 1_000,
        netSatang: 99_000,
      },
    });

    const secondBoot = bootDemo();
    expect(secondBoot.status, secondBoot.stderr).toBe(0);
    expect(secondBoot.stdout).toContain("demo seed skipped (database already contains data)");
    await expect(db.company.findUnique({ where: { id: company.id } })).resolves.toMatchObject({ name: company.name });
    await expect(db.invoice.findUnique({ where: { id: invoice.id } })).resolves.toMatchObject({
      number: "INV-SEED-SAFETY",
      status: "SENT",
    });
  });

  it("requires force to replace populated business data", async () => {
    await expect(seedDemoData(db)).rejects.toThrow("Refusing to seed a populated database");
    await expect(seedDemoData(db, true)).resolves.toBeUndefined();
    await expect(db.company.count()).resolves.toBe(2);
    await expect(db.invoice.count({ where: { number: "INV-SEED-SAFETY" } })).resolves.toBe(0);
  });

  it("propagates unexpected seed failures from the entrypoint", () => {
    const result = bootDemo("file:/missing/directory/sendo.db");
    expect(result.status).not.toBe(0);
  });
});
