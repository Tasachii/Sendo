import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addTeamMember, changeMemberRole, removeTeamMember } from "../app/actions/team";
import { createCustomer } from "../app/actions/customers";
import { getSessionContext } from "../lib/tenant";

const db = new PrismaClient();
let companyId = "";
let ownerId = "";
let memberId = "";
let currentSessionUserId = "";

function memberForm() {
  const form = new FormData();
  form.set("name", "New member");
  form.set("email", `new-${Date.now()}@membership.test`);
  form.set("password", "password1");
  form.set("role", "STAFF");
  return form;
}

function customerForm() {
  const form = new FormData();
  form.set("name", "Blocked customer");
  return form;
}

beforeAll(async () => {
  const company = await db.company.create({
    data: { name: "MEMBERSHIP-TEST", taxId: "0105550000060", address: "Bangkok" },
  });
  companyId = company.id;
  const owner = await db.user.create({
    data: {
      companyId,
      email: `owner-${Date.now()}@membership.test`,
      passwordHash: "x",
      name: "Owner",
      role: "OWNER",
    },
  });
  ownerId = owner.id;
  const member = await db.user.create({
    data: {
      companyId,
      email: `member-${Date.now()}@membership.test`,
      passwordHash: "x",
      name: "Member",
      role: "OWNER",
    },
  });
  memberId = member.id;

  getServerSession.mockImplementation(async () => ({
    user: {
      id: currentSessionUserId,
      companyId,
      role: "OWNER",
      name: "Stale owner",
      email: member.email,
    },
  }));
});

beforeEach(async () => {
  await db.user.upsert({
    where: { id: memberId },
    create: {
      id: memberId,
      companyId,
      email: `member-${memberId}@membership.test`,
      passwordHash: "x",
      name: "Member",
      role: "OWNER",
    },
    update: { role: "OWNER" },
  });
  currentSessionUserId = memberId;
});

afterAll(async () => {
  await db.customer.deleteMany({ where: { companyId } });
  await db.user.deleteMany({ where: { companyId } });
  await db.company.delete({ where: { id: companyId } });
  await db.$disconnect();
});

describe("current database membership", () => {
  it("refuses an owner-only request immediately after demotion", async () => {
    currentSessionUserId = ownerId;
    await expect(changeMemberRole(memberId, "STAFF")).resolves.toEqual({ ok: true });
    currentSessionUserId = memberId;

    await expect(addTeamMember(memberForm())).rejects.toThrow("FORBIDDEN_OWNER_ONLY");
    expect((await getSessionContext())?.role).toBe("STAFF");
  });

  it("refuses the next protected request immediately after removal", async () => {
    currentSessionUserId = ownerId;
    await expect(removeTeamMember(memberId)).resolves.toEqual({ ok: true });
    currentSessionUserId = memberId;

    await expect(createCustomer(customerForm())).rejects.toThrow("UNAUTHENTICATED");
    await expect(getSessionContext()).resolves.toBeNull();
  });
});
