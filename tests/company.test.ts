import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient, type Role } from "@prisma/client";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateCompanyBranding, updateCompanyProfile } from "../app/actions/company";

const db = new PrismaClient();
let companyId = "";
let ownerId = "";

type Sess = { role: Role; companyId: string; userId: string };
let current: Sess | null = null;
const asUser = (s: Sess | null) => { current = s; };

const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

beforeAll(async () => {
  getServerSession.mockImplementation(async () =>
    current ? { user: { id: current.userId, companyId: current.companyId, role: current.role, name: "tester", email: "t@test.co" } } : null
  );
  const c = await db.company.create({ data: { name: "BRAND-TEST", taxId: "0105550000040", address: "กทม." } });
  companyId = c.id;
  ownerId = (await db.user.create({ data: { companyId, email: `brand-${Date.now()}@t.test`, passwordHash: "x", name: "owner", role: "OWNER" } })).id;
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { companyId } });
  await db.user.deleteMany({ where: { companyId } });
  await db.company.deleteMany({ where: { id: companyId } });
  await db.$disconnect();
});

beforeEach(() => asUser({ role: "OWNER", companyId, userId: ownerId }));

describe("updateCompanyBranding", () => {
  it("OWNER can store a valid PNG data URL", async () => {
    const res = await updateCompanyBranding({ logoDataUrl: TINY_PNG });
    expect(res).toEqual({ ok: true });
    expect((await db.company.findUniqueOrThrow({ where: { id: companyId } })).logoDataUrl).toBe(TINY_PNG);
  });

  it("clearing with null removes the image", async () => {
    await updateCompanyBranding({ logoDataUrl: TINY_PNG });
    expect(await updateCompanyBranding({ logoDataUrl: null })).toEqual({ ok: true });
    expect((await db.company.findUniqueOrThrow({ where: { id: companyId } })).logoDataUrl).toBeNull();
  });

  it("rejects a non-image data URL", async () => {
    const res = await updateCompanyBranding({ sealDataUrl: "data:text/html;base64,PGgxPg==" });
    expect(res.ok).toBe(false);
  });

  it("rejects an image larger than 300KB", async () => {
    const big = "data:image/png;base64," + "A".repeat(420 * 1024); // ~315KB decoded
    const res = await updateCompanyBranding({ logoDataUrl: big });
    expect(res.ok).toBe(false);
  });

  it("a STAFF member is rejected (OWNER-only)", async () => {
    asUser({ role: "STAFF", companyId, userId: ownerId });
    await expect(updateCompanyBranding({ logoDataUrl: TINY_PNG })).rejects.toThrow("FORBIDDEN_OWNER_ONLY");
  });
});

describe("updateCompanyProfile", () => {
  it("validates the 13-digit taxId", async () => {
    const res = await updateCompanyProfile(fd({ name: "ใหม่", taxId: "123", address: "x", branch: "สำนักงานใหญ่" }));
    expect(res.ok).toBe(false);
  });

  it("persists a valid profile", async () => {
    const res = await updateCompanyProfile(fd({ name: "บ. ใหม่ จำกัด", taxId: "0105550000040", address: "เชียงราย", branch: "สาขา 1" }));
    expect(res).toEqual({ ok: true });
    const after = await db.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(after.name).toBe("บ. ใหม่ จำกัด");
    expect(after.branch).toBe("สาขา 1");
  });
});
