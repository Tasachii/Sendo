import { requireSession, db } from "@/lib/tenant";
import { TeamManager } from "./TeamManager";

export default async function TeamPage() {
  const ctx = await requireSession();
  if (ctx.role !== "OWNER") {
    return (
      <div className="rounded-xl bg-surface p-6 ring-1 ring-line">
        <h1 className="text-2xl font-bold">ทีมงาน</h1>
        <p className="mt-2 text-sm text-muted">เฉพาะเจ้าของบริษัท (OWNER) เท่านั้นที่จัดการสมาชิกได้</p>
      </div>
    );
  }
  const members = await db.user.findMany({
    where: { companyId: ctx.companyId },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { role: "asc" },
  });
  return <TeamManager initial={members} meId={ctx.userId} />;
}
