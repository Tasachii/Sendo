import Link from "next/link";
import type { DocType } from "@prisma/client";
import { requireSession, db } from "@/lib/tenant";
import { formatBaht } from "@/lib/money";
import { sweepOverdue } from "@/lib/overdue";
import { StatusBadge } from "@/components/StatusBadge";
import { DocTypeBadge } from "@/components/DocTypeBadge";

// Money cards count the billing family; quotations are tracked separately as pipeline.
const BILLING: DocType[] = ["BILLING_NOTE", "TAX_INVOICE", "RECEIPT"];

export default async function DashboardPage() {
  const ctx = await requireSession();
  const companyId = ctx.companyId;
  await sweepOverdue(companyId); // keep OVERDUE current on every visit

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [monthAgg, unpaidAgg, overdueAgg, quoteAgg, recent] = await Promise.all([
    db.invoice.aggregate({ where: { companyId, docType: { in: BILLING }, issueDate: { gte: monthStart } }, _sum: { netSatang: true }, _count: true }),
    db.invoice.aggregate({ where: { companyId, docType: { in: BILLING }, status: { in: ["SENT", "OVERDUE"] } }, _sum: { netSatang: true }, _count: true }),
    db.invoice.aggregate({ where: { companyId, docType: { in: BILLING }, status: "OVERDUE" }, _sum: { netSatang: true }, _count: true }),
    db.invoice.aggregate({ where: { companyId, docType: "QUOTATION", status: { in: ["SENT", "ACCEPTED"] } }, _sum: { netSatang: true }, _count: true }),
    db.invoice.findMany({ where: { companyId }, include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const cards = [
    { label: "ยอดออกบิลเดือนนี้", value: `${formatBaht(monthAgg._sum.netSatang ?? 0)} ฿`, sub: `${monthAgg._count} ใบ` },
    { label: "ค้างชำระ", value: `${formatBaht(unpaidAgg._sum.netSatang ?? 0)} ฿`, sub: `${unpaidAgg._count} ใบ` },
    { label: "เกินกำหนด", value: `${formatBaht(overdueAgg._sum.netSatang ?? 0)} ฿`, sub: `${overdueAgg._count} ใบ`, warn: true },
    { label: "ใบเสนอราคา (รอผล/ตอบรับ)", value: `${formatBaht(quoteAgg._sum.netSatang ?? 0)} ฿`, sub: `${quoteAgg._count} ใบ` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">หน้าหลัก</h1>
          <p className="text-sm text-muted">ภาพรวมของบริษัทคุณ</p>
        </div>
        <Link href="/documents/new" className="rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition hover:opacity-90">+ สร้างเอกสาร</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl bg-surface p-4 ring-1 ring-line">
            <p className="text-xs text-muted">{c.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${c.warn ? "text-red-600" : "text-ink"}`}>{c.value}</p>
            <p className="text-xs text-faint">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-surface ring-1 ring-line">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">เอกสารล่าสุด</h2>
          <Link href="/documents" className="text-sm text-accent hover:underline">ดูทั้งหมด</Link>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {recent.length === 0 && <tr><td className="px-4 py-8 text-center text-faint">ยังไม่มีเอกสาร</td></tr>}
            {recent.map((inv) => (
              <tr key={inv.id} className="border-b border-line last:border-0 hover:bg-paper">
                <td className="px-4 py-3"><Link href={`/invoices/${inv.id}`} className="font-medium text-accent hover:underline">{inv.number}</Link></td>
                <td className="px-4 py-3"><DocTypeBadge type={inv.docType} /></td>
                <td className="px-4 py-3">{inv.customer.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatBaht(inv.netSatang)}</td>
                <td className="px-4 py-3 text-right"><StatusBadge status={inv.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
