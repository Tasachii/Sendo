import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession, db } from "@/lib/tenant";
import { formatBaht } from "@/lib/money";
import { docMeta } from "@/lib/docTypes";
import { StatusBadge } from "@/components/StatusBadge";
import { DocTypeBadge } from "@/components/DocTypeBadge";
import { InvoiceActions } from "./InvoiceActions";

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Next 16: params is async
  const ctx = await requireSession();
  const inv = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      customer: true, items: true, company: true, shipments: true,
      source: { select: { id: true, number: true, docType: true } },
      derived: { select: { id: true, number: true, docType: true, status: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!inv) notFound();

  const meta = docMeta(inv.docType);
  const unitOf = (m: string) => (m === "WEIGHT" ? " กก." : m === "DISTANCE" ? " กม." : "");
  const hasLineDiscount = inv.items.some((it) => it.discountSatang > 0);
  const lineSum = inv.subtotalSatang + inv.docDiscountSatang;
  const isSubstitute = meta.type === "RECEIPT_SUBSTITUTE";
  const secondary =
    meta.dateField === "dueDate" ? { label: meta.dateLabel, value: iso(inv.dueDate) }
    : meta.dateField === "validUntil" ? { label: meta.dateLabel, value: iso(inv.validUntil) }
    : meta.dateField === "receivedDate" ? { label: meta.dateLabel, value: iso(inv.receivedDate) }
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/documents" className="text-sm text-faint hover:underline">← กลับ</Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-bold">{inv.number}</h1>
            <DocTypeBadge type={inv.docType} />
          </div>
          <div className="mt-1"><StatusBadge status={inv.status} /></div>
        </div>
        <InvoiceActions id={inv.id} docType={inv.docType} status={inv.status} hasWht={inv.whtSatang > 0} canWrite={ctx.role !== "VIEWER"} />
      </div>

      {/* conversion lineage */}
      {(inv.source || inv.derived.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-accent-wash px-4 py-3 text-sm">
          {inv.source && (
            <span>แปลงมาจาก{" "}
              <Link href={`/invoices/${inv.source.id}`} className="font-medium text-accent hover:underline">{inv.source.number}</Link>
              {" "}({docMeta(inv.source.docType).short})
            </span>
          )}
          {inv.derived.length > 0 && (
            <span>แปลงต่อเป็น:{" "}
              {inv.derived.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <Link href={`/invoices/${d.id}`} className="font-medium text-accent hover:underline">{d.number}</Link>
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Box title={isSubstitute ? "ผู้จ่ายเงิน (บริษัทคุณ)" : "ผู้ขาย (บริษัทคุณ)"}>
          <p className="font-medium">{inv.company.name}</p>
          <p className="text-muted">เลขภาษี {inv.company.taxId} · {inv.company.branch}</p>
          <p className="text-muted">{inv.company.address}</p>
        </Box>
        <Box title={isSubstitute ? "ผู้รับเงิน" : "ผู้ซื้อ (ลูกค้า)"}>
          <p className="font-medium">{isSubstitute && inv.payeeName ? inv.payeeName : inv.customer.name}</p>
          <p className="text-muted">เลขภาษี {inv.customer.taxId || "—"} · {inv.customer.branch}</p>
          <p className="text-muted">{inv.customer.address || "— ยังไม่มีที่อยู่ —"}</p>
        </Box>
      </div>

      {/* meta row */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-line">
        <span className="text-muted">วันที่ออก: <span className="text-ink">{iso(inv.issueDate)}</span></span>
        {secondary?.value && <span className="text-muted">{secondary.label}: <span className="text-ink">{secondary.value}</span></span>}
        {inv.paymentMethod && <span className="text-muted">วิธีชำระ: <span className="text-ink">{inv.paymentMethod}</span></span>}
        {inv.refDocNumber && <span className="text-muted">อ้างอิง: <span className="text-ink">{inv.refDocNumber}</span></span>}
        {inv.reason && <span className="text-muted">เหตุผล: <span className="text-ink">{inv.reason}</span></span>}
      </div>

      <div className="rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">รายการ</th>
              <th className="px-4 py-3 text-right font-medium">จำนวน</th>
              <th className="px-4 py-3 text-right font-medium">ราคา/หน่วย</th>
              {hasLineDiscount && <th className="px-4 py-3 text-right font-medium">ส่วนลด</th>}
              <th className="px-4 py-3 text-right font-medium">รวม</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it) => (
              <tr key={it.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{it.description}</td>
                <td className="px-4 py-3 text-right tabular-nums">{it.qty}{unitOf(it.pricingMode)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatBaht(it.unitPriceSatang)}</td>
                {hasLineDiscount && <td className="px-4 py-3 text-right tabular-nums text-muted">{it.discountSatang > 0 ? `- ${formatBaht(it.discountSatang)}` : "-"}</td>}
                <td className="px-4 py-3 text-right tabular-nums">{formatBaht(it.lineTotalSatang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto max-w-sm space-y-1 p-4 text-sm">
          {inv.docDiscountSatang > 0 && <Line label="มูลค่ารวมรายการ" value={formatBaht(lineSum)} />}
          {inv.docDiscountSatang > 0 && <Line label="ส่วนลดท้ายบิล" value={`- ${formatBaht(inv.docDiscountSatang)}`} />}
          <Line label="ยอดก่อนภาษี" value={formatBaht(inv.subtotalSatang)} />
          {meta.isTaxDoc && <Line label="VAT" value={`+ ${formatBaht(inv.vatSatang)}`} />}
          {meta.showWht && inv.whtSatang > 0 && <Line label="หัก ณ ที่จ่าย" value={`- ${formatBaht(inv.whtSatang)}`} />}
          <div className="flex justify-between border-t border-line pt-2">
            <span className="font-semibold">{meta.type === "QUOTATION" ? "ยอดรวมทั้งสิ้น" : "ยอดชำระสุทธิ"}</span>
            <span className="text-lg font-bold text-accent tabular-nums">{formatBaht(inv.netSatang)} ฿</span>
          </div>
        </div>
      </div>

      {inv.shipments.length > 0 && (
        <div className="rounded-xl bg-surface p-4 text-sm ring-1 ring-line">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">เลขติดตามพัสดุ (Tracking)</p>
          <ul className="space-y-1">
            {inv.shipments.map((s) => (
              <li key={s.id} className="flex justify-between">
                <span className="font-medium">{s.trackingNo}</span>
                <span className="text-muted">{s.note || ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {inv.note && <p className="text-sm text-muted">หมายเหตุ: {inv.note}</p>}
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface p-4 text-sm ring-1 ring-line">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">{title}</p>
      {children}
    </div>
  );
}
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
