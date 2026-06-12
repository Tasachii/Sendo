import Link from "next/link";
import { requireSession, db } from "@/lib/tenant";
import { formatBaht } from "@/lib/money";
import { StatusBadge } from "@/components/StatusBadge";

export default async function InvoicesPage() {
  const ctx = await requireSession();
  const invoices = await db.invoice.findMany({
    where: { companyId: ctx.companyId },
    include: { customer: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ใบแจ้งหนี้</h1>
          <p className="text-sm text-slate-500">รายการใบแจ้งหนี้ทั้งหมดของบริษัท</p>
        </div>
        {ctx.role !== "VIEWER" && (
          <Link href="/invoices/new" className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90">+ สร้างใบแจ้งหนี้</Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">เลขที่</th>
              <th className="px-4 py-3 font-medium">ลูกค้า</th>
              <th className="px-4 py-3 font-medium">วันที่</th>
              <th className="px-4 py-3 text-right font-medium">ยอดสุทธิ</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">ยังไม่มีใบแจ้งหนี้</td></tr>}
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/invoices/${inv.id}`} className="font-medium text-accent hover:underline">{inv.number}</Link>
                </td>
                <td className="px-4 py-3">{inv.customer.name}</td>
                <td className="px-4 py-3 text-slate-600 tabular-nums">{inv.issueDate.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatBaht(inv.netSatang)}</td>
                <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
