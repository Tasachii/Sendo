"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db, requireOwner } from "@/lib/tenant";
import { teamMemberSchema } from "@/lib/validation";

export type TeamResult = { ok: true } | { ok: false; error: string };

/** OWNER adds a team member to their own company. */
export async function addTeamMember(formData: FormData): Promise<TeamResult> {
  const ctx = await requireOwner();
  const parsed = teamMemberSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const email = d.email.toLowerCase().trim();

  if (await db.user.findUnique({ where: { email } })) {
    return { ok: false, error: "อีเมลนี้ถูกใช้งานแล้ว" };
  }
  await db.user.create({
    data: {
      companyId: ctx.companyId, // tenant scope — new user joins the owner's company only
      email,
      name: d.name,
      passwordHash: await bcrypt.hash(d.password, 10),
      role: d.role,
    },
  });
  revalidatePath("/team");
  return { ok: true };
}

export async function changeMemberRole(userId: string, role: "OWNER" | "STAFF" | "VIEWER"): Promise<TeamResult> {
  const ctx = await requireOwner();
  if (userId === ctx.userId) return { ok: false, error: "เปลี่ยนบทบาทของตัวเองไม่ได้" };
  // guard: never leave the company with zero owners
  if (role !== "OWNER") {
    const target = await db.user.findFirst({ where: { id: userId, companyId: ctx.companyId } });
    if (target?.role === "OWNER") {
      const owners = await db.user.count({ where: { companyId: ctx.companyId, role: "OWNER" } });
      if (owners <= 1) return { ok: false, error: "ต้องมีเจ้าของ (OWNER) อย่างน้อย 1 คน" };
    }
  }
  const res = await db.user.updateMany({ where: { id: userId, companyId: ctx.companyId }, data: { role } });
  if (res.count === 0) return { ok: false, error: "ไม่พบผู้ใช้" };
  revalidatePath("/team");
  return { ok: true };
}

export async function removeTeamMember(userId: string): Promise<TeamResult> {
  const ctx = await requireOwner();
  if (userId === ctx.userId) return { ok: false, error: "ลบบัญชีตัวเองไม่ได้" };
  const target = await db.user.findFirst({ where: { id: userId, companyId: ctx.companyId } });
  if (!target) return { ok: false, error: "ไม่พบผู้ใช้" };
  if (target.role === "OWNER") {
    const owners = await db.user.count({ where: { companyId: ctx.companyId, role: "OWNER" } });
    if (owners <= 1) return { ok: false, error: "ต้องมีเจ้าของ (OWNER) อย่างน้อย 1 คน" };
  }
  // a user who has created invoices can't be deleted (FK); block with a clear message
  const made = await db.invoice.count({ where: { companyId: ctx.companyId, createdById: userId } });
  if (made > 0) return { ok: false, error: "ลบไม่ได้: ผู้ใช้นี้เคยออกใบแจ้งหนี้ — เปลี่ยนเป็น VIEWER แทน" };

  await db.user.deleteMany({ where: { id: userId, companyId: ctx.companyId } });
  revalidatePath("/team");
  return { ok: true };
}
