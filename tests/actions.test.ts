import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient, type Role } from "@prisma/client";

// Mock the session + Next cache so server actions run outside a request (same
// pattern as tests/invoices.test.ts). vi.hoisted lets the factory reference
// getServerSession (vi.mock is hoisted above imports).
const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCustomer, updateCustomer, deleteCustomer } from "../app/actions/customers";
import { createService, updateService, deleteService } from "../app/actions/services";
import { addTeamMember, changeMemberRole, removeTeamMember } from "../app/actions/team";
import { updateTaxSetting } from "../app/actions/taxSettings";

const db = new PrismaClient();

let companyId = "";
let otherCompanyId = "";
let ownerId = "";

type Sess = { role: Role; companyId: string; userId: string };
let current: Sess | null = null;
const asUser = (s: Sess | null) => { current = s; };

// build a FormData from a plain record (server actions read formData.get())
function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

beforeAll(async () => {
  getServerSession.mockImplementation(async () =>
    current ? { user: { id: current.userId, companyId: current.companyId, role: current.role, name: "tester", email: "t@test.co" } } : null
  );

  const c = await db.company.create({
    data: {
      name: "ACT2-TEST ขนส่ง", taxId: "0105550000020", address: "กทม.",
      taxSettings: { create: { jobType: "transport_service", label: "ขนส่ง", vatRate: 0.07, whtRate: 0.03, vatApplicable: true } },
    },
  });
  companyId = c.id;
  const other = await db.company.create({ data: { name: "ACT2-OTHER", taxId: "0105550000021", address: "กทม." } });
  otherCompanyId = other.id;
  ownerId = (await db.user.create({
    data: { companyId, email: `act2-owner-${Date.now()}@t.test`, passwordHash: "x", name: "owner", role: "OWNER" },
  })).id;
});

afterAll(async () => {
  for (const cid of [companyId, otherCompanyId]) {
    await db.service.deleteMany({ where: { companyId: cid } });
    await db.customer.deleteMany({ where: { companyId: cid } });
    await db.taxSetting.deleteMany({ where: { companyId: cid } });
    await db.user.deleteMany({ where: { companyId: cid } });
  }
  await db.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await db.$disconnect();
});

beforeEach(() => asUser({ role: "OWNER", companyId, userId: ownerId }));

// ───────────────────────── customers ─────────────────────────
describe("customers actions", () => {
  it("createCustomer: writer can create; tenant scope is forced", async () => {
    const res = await createCustomer(fd({ name: "ลูกค้าใหม่", taxId: "0105550000091", address: "กทม." }));
    expect(res).toEqual({ ok: true });
    const row = await db.customer.findFirst({ where: { companyId, name: "ลูกค้าใหม่" } });
    expect(row?.companyId).toBe(companyId);
    expect(row?.taxId).toBe("0105550000091");
  });

  it("createCustomer: rejects a malformed taxId (validation, A6)", async () => {
    const res = await createCustomer(fd({ name: "เลขผิด", taxId: "123" }));
    expect(res.ok).toBe(false);
  });

  it("createCustomer: VIEWER is rejected by requireWriter", async () => {
    asUser({ role: "VIEWER", companyId, userId: ownerId });
    await expect(createCustomer(fd({ name: "x" }))).rejects.toThrow("FORBIDDEN_VIEWER_READONLY");
  });

  it("updateCustomer: cross-tenant id is not found (count 0)", async () => {
    const mine = await db.customer.create({ data: { companyId, name: "ของฉัน" } });
    asUser({ role: "OWNER", companyId: otherCompanyId, userId: ownerId });
    const res = await updateCustomer(mine.id, fd({ name: "แก้ไข" }));
    expect(res).toEqual({ ok: false, error: "ไม่พบลูกค้า" });
    // untouched
    expect((await db.customer.findUniqueOrThrow({ where: { id: mine.id } })).name).toBe("ของฉัน");
  });

  it("updateCustomer: happy path updates the row", async () => {
    const c = await db.customer.create({ data: { companyId, name: "เดิม" } });
    const res = await updateCustomer(c.id, fd({ name: "ใหม่", address: "เชียงราย" }));
    expect(res).toEqual({ ok: true });
    const after = await db.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.name).toBe("ใหม่");
    expect(after.address).toBe("เชียงราย");
  });

  it("deleteCustomer: blocked when the customer has invoices", async () => {
    const c = await db.customer.create({ data: { companyId, name: "มีบิล" } });
    await db.invoice.create({
      data: {
        companyId, number: `DEL-${Date.now()}`, customerId: c.id, jobType: "transport_service",
        subtotalSatang: 1, vatSatang: 0, whtSatang: 0, netSatang: 1, createdById: ownerId,
      },
    });
    const res = await deleteCustomer(c.id);
    expect(res.ok).toBe(false);
    expect(await db.customer.findUnique({ where: { id: c.id } })).not.toBeNull();
    // cleanup
    await db.invoice.deleteMany({ where: { customerId: c.id } });
  });

  it("deleteCustomer: removes a customer with no invoices", async () => {
    const c = await db.customer.create({ data: { companyId, name: "ไม่มีบิล" } });
    expect(await deleteCustomer(c.id)).toEqual({ ok: true });
    expect(await db.customer.findUnique({ where: { id: c.id } })).toBeNull();
  });
});

// ───────────────────────── services ─────────────────────────
describe("services actions", () => {
  it("createService: converts baht→satang server-side", async () => {
    const res = await createService(fd({ name: "ส่งด่วน", defaultJobType: "transport_service", defaultUnitPriceBaht: "150.50" }));
    expect(res).toEqual({ ok: true });
    const row = await db.service.findFirst({ where: { companyId, name: "ส่งด่วน" } });
    expect(row?.defaultUnitPriceSatang).toBe(15050); // 150.50 baht → 15,050 satang
    expect(row?.companyId).toBe(companyId);
  });

  it("createService: VIEWER rejected", async () => {
    asUser({ role: "VIEWER", companyId, userId: ownerId });
    await expect(createService(fd({ name: "x", defaultJobType: "t" }))).rejects.toThrow("FORBIDDEN_VIEWER_READONLY");
  });

  it("updateService: cross-tenant id not found", async () => {
    const svc = await db.service.create({ data: { companyId, name: "S", defaultJobType: "transport_service", defaultUnitPriceSatang: 100 } });
    asUser({ role: "OWNER", companyId: otherCompanyId, userId: ownerId });
    expect(await updateService(svc.id, fd({ name: "Z", defaultJobType: "transport_service", defaultUnitPriceBaht: "1" }))).toEqual({ ok: false, error: "ไม่พบรายการ" });
  });

  it("updateService: happy path re-converts price", async () => {
    const svc = await db.service.create({ data: { companyId, name: "S2", defaultJobType: "transport_service", defaultUnitPriceSatang: 100 } });
    expect(await updateService(svc.id, fd({ name: "S2x", defaultJobType: "transport_service", defaultUnitPriceBaht: "9.99" }))).toEqual({ ok: true });
    expect((await db.service.findUniqueOrThrow({ where: { id: svc.id } })).defaultUnitPriceSatang).toBe(999);
  });

  it("deleteService: tenant-scoped delete", async () => {
    const svc = await db.service.create({ data: { companyId, name: "S3", defaultJobType: "transport_service", defaultUnitPriceSatang: 1 } });
    expect(await deleteService(svc.id)).toEqual({ ok: true });
    expect(await db.service.findUnique({ where: { id: svc.id } })).toBeNull();
  });
});

// ───────────────────────── team ─────────────────────────
describe("team actions (OWNER-gated)", () => {
  it("addTeamMember: STAFF is rejected by requireOwner", async () => {
    asUser({ role: "STAFF", companyId, userId: ownerId });
    await expect(addTeamMember(fd({ name: "n", email: "n@t.co", password: "password1", role: "STAFF" }))).rejects.toThrow("FORBIDDEN_OWNER_ONLY");
  });

  it("addTeamMember: OWNER adds a STAFF into their own company", async () => {
    const email = `staff-${Date.now()}@t.test`;
    const res = await addTeamMember(fd({ name: "พนักงาน", email, password: "password1", role: "STAFF" }));
    expect(res).toEqual({ ok: true });
    const u = await db.user.findUnique({ where: { email } });
    expect(u?.companyId).toBe(companyId);
    expect(u?.role).toBe("STAFF");
    expect(u?.passwordHash).not.toBe("password1"); // hashed
  });

  it("addTeamMember: duplicate email rejected", async () => {
    const email = `dup-${Date.now()}@t.test`;
    await addTeamMember(fd({ name: "a", email, password: "password1", role: "VIEWER" }));
    const res = await addTeamMember(fd({ name: "b", email, password: "password1", role: "VIEWER" }));
    expect(res).toEqual({ ok: false, error: "อีเมลนี้ถูกใช้งานแล้ว" });
  });

  it("changeMemberRole: cross-tenant user id not found", async () => {
    const u = await db.user.create({ data: { companyId, email: `role-${Date.now()}@t.test`, passwordHash: "x", name: "u", role: "STAFF" } });
    asUser({ role: "OWNER", companyId: otherCompanyId, userId: ownerId });
    expect(await changeMemberRole(u.id, "VIEWER")).toEqual({ ok: false, error: "ไม่พบผู้ใช้" });
  });

  it("changeMemberRole: cannot demote the last OWNER", async () => {
    // the only OWNER in this company is the seeded ownerId
    const res = await changeMemberRole(ownerId, "STAFF");
    // self-change is blocked first
    expect(res.ok).toBe(false);
  });

  it("changeMemberRole: happy path promotes a STAFF to VIEWER", async () => {
    const u = await db.user.create({ data: { companyId, email: `promote-${Date.now()}@t.test`, passwordHash: "x", name: "u", role: "STAFF" } });
    expect(await changeMemberRole(u.id, "VIEWER")).toEqual({ ok: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).role).toBe("VIEWER");
  });

  it("removeTeamMember: removes a member with no invoices", async () => {
    const u = await db.user.create({ data: { companyId, email: `rm-${Date.now()}@t.test`, passwordHash: "x", name: "u", role: "VIEWER" } });
    expect(await removeTeamMember(u.id)).toEqual({ ok: true });
    expect(await db.user.findUnique({ where: { id: u.id } })).toBeNull();
  });

  it("removeTeamMember: cannot remove yourself", async () => {
    expect(await removeTeamMember(ownerId)).toEqual({ ok: false, error: "ลบบัญชีตัวเองไม่ได้" });
  });
});

// ───────────────────────── taxSettings ─────────────────────────
describe("taxSettings action", () => {
  it("updateTaxSetting: converts % → fraction and persists", async () => {
    const res = await updateTaxSetting("transport_service", { vatRate: 7, whtRate: 5, vatApplicable: true });
    expect(res).toEqual({ ok: true });
    const s = await db.taxSetting.findFirstOrThrow({ where: { companyId, jobType: "transport_service" } });
    expect(s.vatRate).toBeCloseTo(0.07, 6);
    expect(s.whtRate).toBeCloseTo(0.05, 6);
  });

  it("updateTaxSetting: rejects out-of-range rates", async () => {
    expect((await updateTaxSetting("transport_service", { vatRate: 150, whtRate: 0, vatApplicable: true })).ok).toBe(false);
  });

  it("updateTaxSetting: VIEWER rejected", async () => {
    asUser({ role: "VIEWER", companyId, userId: ownerId });
    await expect(updateTaxSetting("transport_service", { vatRate: 7, whtRate: 3, vatApplicable: true })).rejects.toThrow("FORBIDDEN_VIEWER_READONLY");
  });

  it("updateTaxSetting: cross-tenant jobType not found (count 0)", async () => {
    asUser({ role: "OWNER", companyId: otherCompanyId, userId: ownerId });
    expect(await updateTaxSetting("transport_service", { vatRate: 7, whtRate: 3, vatApplicable: true })).toEqual({ ok: false, error: "ไม่พบการตั้งค่า" });
  });
});
