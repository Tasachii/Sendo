import { requireSession, db } from "@/lib/tenant";

const ACTION_LABEL: Record<string, { th: string; cls: string }> = {
  INVOICE_CREATE: { th: "สร้างใบแจ้งหนี้", cls: "bg-accent-wash text-accent" },
  INVOICE_ISSUE: { th: "ออกใบกำกับภาษี", cls: "bg-blue-100 text-blue-700" },
  INVOICE_STATUS: { th: "เปลี่ยนสถานะ", cls: "bg-amber-100 text-amber-700" },
  INVOICE_COPY: { th: "ก๊อปใบแจ้งหนี้", cls: "bg-accent-wash text-accent" },
  INVOICE_DELETE: { th: "ลบใบแจ้งหนี้", cls: "bg-red-100 text-red-700" },
};

function fmt(d: Date) {
  return d.toLocaleString("th-TH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AuditPage() {
  const ctx = await requireSession();
  const logs = await db.auditLog.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ประวัติการทำงาน</h1>
        <p className="text-sm text-muted">บันทึกว่าใครทำอะไรกับใบแจ้งหนี้ (อ่านอย่างเดียว แก้ไขไม่ได้)</p>
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">เวลา</th>
              <th className="px-4 py-3 font-medium">ผู้ใช้</th>
              <th className="px-4 py-3 font-medium">การกระทำ</th>
              <th className="px-4 py-3 font-medium">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-faint">ยังไม่มีประวัติ</td></tr>}
            {logs.map((l) => {
              const a = ACTION_LABEL[l.action] ?? { th: l.action, cls: "bg-accent-wash text-muted" };
              return (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-muted tabular-nums">{fmt(l.createdAt)}</td>
                  <td className="px-4 py-3">{l.userName}</td>
                  <td className="px-4 py-3"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${a.cls}`}>{a.th}</span></td>
                  <td className="px-4 py-3 text-muted">{l.detail || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
