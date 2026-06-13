import Link from "next/link";
import { requireSession } from "@/lib/tenant";
import { formatBaht } from "@/lib/money";
import { monthlySummary, availableYears } from "@/lib/reports";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const years = await availableYears(ctx.companyId);
  const year = Number(sp.year) || years[0] || new Date().getFullYear();
  const rows = await monthlySummary(ctx.companyId, year);

  const total = rows.reduce(
    (a, r) => ({
      count: a.count + r.count,
      subtotalSatang: a.subtotalSatang + r.subtotalSatang,
      vatSatang: a.vatSatang + r.vatSatang,
      whtSatang: a.whtSatang + r.whtSatang,
      netSatang: a.netSatang + r.netSatang,
    }),
    { count: 0, subtotalSatang: 0, vatSatang: 0, whtSatang: 0, netSatang: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">รายงานภาษี</h1>
          <p className="text-sm text-muted">สรุปรายเดือนจากใบที่ออกแล้ว — VAT (ภ.พ.30) และหัก ณ ที่จ่าย (ภ.ง.ด.3/53)</p>
        </div>
        <a href={`/api/reports/csv?year=${year}`} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">ดาวน์โหลด CSV</a>
      </div>

      <div className="flex gap-1 text-sm">
        {years.map((y) => (
          <Link key={y} href={`/reports?year=${y}`}
            className={`rounded-lg px-3 py-1.5 ${y === year ? "bg-accent/10 text-accent" : "text-muted hover:bg-paper"}`}>{y}</Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">เดือน</th>
              <th className="px-4 py-3 text-right font-medium">จำนวนใบ</th>
              <th className="px-4 py-3 text-right font-medium">มูลค่าก่อนภาษี</th>
              <th className="px-4 py-3 text-right font-medium">VAT (ภ.พ.30)</th>
              <th className="px-4 py-3 text-right font-medium">หัก ณ ที่จ่าย (ภ.ง.ด.)</th>
              <th className="px-4 py-3 text-right font-medium">สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className={`border-b border-line last:border-0 ${r.count === 0 ? "text-faint" : ""}`}>
                <td className="px-4 py-2.5">{r.monthLabel}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.count || "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatBaht(r.subtotalSatang)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatBaht(r.vatSatang)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatBaht(r.whtSatang)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatBaht(r.netSatang)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line font-semibold">
              <td className="px-4 py-3">รวมทั้งปี {year}</td>
              <td className="px-4 py-3 text-right tabular-nums">{total.count}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatBaht(total.subtotalSatang)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatBaht(total.vatSatang)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatBaht(total.whtSatang)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatBaht(total.netSatang)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-faint">ตัวเลขนี้ช่วยกรอกแบบยื่นภาษี — กรุณาตรวจกับนักบัญชีก่อนยื่นจริง</p>
    </div>
  );
}
