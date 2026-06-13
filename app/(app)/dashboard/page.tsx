import Link from "next/link";
import { requireSession } from "@/lib/tenant";
import { db } from "@/lib/db";
import { formatBaht } from "@/lib/money";

export default async function DashboardPage() {
  const ctx = await requireSession();
  const companyId = ctx.companyId;

  const [invoiceCount, customerCount, draftCount, agg] = await Promise.all([
    db.invoice.count({ where: { companyId } }),
    db.customer.count({ where: { companyId } }),
    db.invoice.count({ where: { companyId, status: "DRAFT" } }),
    db.invoice.aggregate({ where: { companyId }, _sum: { netSatang: true } }),
  ]);

  const cards = [
    { label: "ใบแจ้งหนี้ทั้งหมด", value: invoiceCount.toString() },
    { label: "ฉบับร่าง (ยังไม่ออก)", value: draftCount.toString() },
    { label: "ลูกค้า", value: customerCount.toString() },
    { label: "ยอดสุทธิรวม (บาท)", value: formatBaht(agg._sum.netSatang ?? 0) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">หน้าหลัก</h1>
        <p className="text-sm text-muted">ภาพรวมของบริษัทคุณ</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl bg-surface p-4 ring-1 ring-line">
            <p className="text-xs text-muted">{c.label}</p>
            <p className="mt-1 text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/invoices/new" className="rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition hover:opacity-90">
          + สร้างใบแจ้งหนี้
        </Link>
        <Link href="/customers" className="rounded-lg bg-surface px-4 py-2.5 font-medium ring-1 ring-line transition hover:bg-paper">
          จัดการลูกค้า
        </Link>
      </div>
    </div>
  );
}
