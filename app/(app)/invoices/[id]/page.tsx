import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession, db } from "@/lib/tenant";
import { formatBaht } from "@/lib/money";
import { StatusBadge } from "@/components/StatusBadge";
import { InvoiceActions } from "./InvoiceActions";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Next 16: params is async
  const ctx = await requireSession();
  const inv = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { customer: true, items: true, company: true },
  });
  if (!inv) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/invoices" className="text-sm text-slate-400 hover:underline">← กลับ</Link>
          <h1 className="text-2xl font-bold">{inv.number}</h1>
          <div className="mt-1"><StatusBadge status={inv.status} /></div>
        </div>
        <InvoiceActions
          id={inv.id}
          status={inv.status}
          hasWht={inv.whtSatang > 0}
          canWrite={ctx.role !== "VIEWER"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Box title="ผู้ขาย (บริษัทคุณ)">
          <p className="font-medium">{inv.company.name}</p>
          <p className="text-slate-600">เลขภาษี {inv.company.taxId} · {inv.company.branch}</p>
          <p className="text-slate-600">{inv.company.address}</p>
        </Box>
        <Box title="ผู้ซื้อ (ลูกค้า)">
          <p className="font-medium">{inv.customer.name}</p>
          <p className="text-slate-600">เลขภาษี {inv.customer.taxId || "—"} · {inv.customer.branch}</p>
          <p className="text-slate-600">{inv.customer.address || "— ยังไม่มีที่อยู่ —"}</p>
        </Box>
      </div>

      <div className="rounded-xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">รายการ</th>
              <th className="px-4 py-3 text-right font-medium">จำนวน</th>
              <th className="px-4 py-3 text-right font-medium">ราคา/หน่วย</th>
              <th className="px-4 py-3 text-right font-medium">รวม</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it) => (
              <tr key={it.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">{it.description}</td>
                <td className="px-4 py-3 text-right tabular-nums">{it.qty}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatBaht(it.unitPriceSatang)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatBaht(it.lineTotalSatang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto max-w-sm space-y-1 p-4 text-sm">
          <Line label="ยอดก่อนภาษี" value={formatBaht(inv.subtotalSatang)} />
          <Line label="VAT" value={`+ ${formatBaht(inv.vatSatang)}`} />
          <Line label="หัก ณ ที่จ่าย" value={`- ${formatBaht(inv.whtSatang)}`} />
          <div className="flex justify-between border-t border-slate-200 pt-2">
            <span className="font-semibold">ยอดชำระสุทธิ</span>
            <span className="text-lg font-bold text-accent tabular-nums">{formatBaht(inv.netSatang)} ฿</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-4 text-sm ring-1 ring-slate-200">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
