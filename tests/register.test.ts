import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { registerCompany } from "../app/actions/auth";

// registerCompany is unauthenticated (anyone can sign up), so its error on a taken
// email must NOT confirm that the address is registered — otherwise it becomes a
// user-enumeration oracle. Runs against the real dev DB like the other action tests.

const db = new PrismaClient();
const email = `reg-${Date.now()}@t.test`;

function form(): FormData {
  const f = new FormData();
  f.append("companyName", "REG-TEST ขนส่ง");
  f.append("companyTaxId", "0105550000099");
  f.append("companyAddress", "กทม.");
  f.append("ownerName", "เจ้าของ");
  f.append("email", email);
  f.append("password", "password1");
  return f;
}

afterAll(async () => {
  const u = await db.user.findUnique({ where: { email } });
  if (u) {
    await db.taxSetting.deleteMany({ where: { companyId: u.companyId } });
    await db.user.deleteMany({ where: { companyId: u.companyId } });
    await db.company.deleteMany({ where: { id: u.companyId } });
  }
  await db.$disconnect();
});

describe("registerCompany — no user enumeration", () => {
  it("creates the company + owner on first registration", async () => {
    const res = await registerCompany(form());
    expect(res).toEqual({ ok: true });
  });

  it("rejects a duplicate email with a generic message that does not reveal it is taken", async () => {
    const res = await registerCompany(form());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).not.toMatch(/ถูกใช้งานแล้ว|มีอยู่แล้ว|already|taken|exist/i);
      expect(res.error.length).toBeGreaterThan(0);
    }
  });
});
