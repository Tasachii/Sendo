import Link from "next/link";
import type { DocType, InvoiceStatus, Prisma } from "@prisma/client";
import { requireSession, db } from "@/lib/tenant";
import { formatBaht } from "@/lib/money";
import { sweepOverdue } from "@/lib/overdue";
import { ALL_DOC_TYPES } from "@/lib/docTypes";
import { StatusBadge } from "@/components/StatusBadge";
import { DocTypeBadge } from "@/components/DocTypeBadge";

const VALID_TYPE = new Set(ALL_DOC_TYPES.map((m) => m.type));
const VALID_STATUS = new Set<InvoiceStatus>(["DRAFT", "SENT", "PAID", "OVERDUE", "ACCEPTED", "REJECTED", "EXPIRED", "VOID"]);

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; q?: string }> }) {
  const { type, status, q } = await searchParams;
  const ctx = await requireSession();
  await sweepOverdue(ctx.companyId);

  const where: Prisma.InvoiceWhereInput = { companyId: ctx.companyId };
  if (type && VALID_TYPE.has(type as DocType)) where.docType = type as DocType;
  if (status && VALID_STATUS.has(status as InvoiceStatus)) where.status = status as InvoiceStatus;
  if (q?.trim()) where.OR = [{ number: { contains: q.trim() } }, { customer: { name: { contains: q.trim() } } }];

  const docs = await db.invoice.findMany({
    where,
    include: { customer: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  const tab = (label: string, key?: string) => {
    const active = (key ?? "") === (type ?? "");
    const params = new URLSearchParams();
    if (key) params.set("type", key);
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    const href = `/documents${params.toString() ? `?${params}` : ""}`;
    return (
      <Link key={label} href={href}
        className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${active ? "bg-accent text-white" : "bg-surface text-muted ring-1 ring-line hover:bg-paper"}`}>
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">เอกสาร</h1>
          <p className="text-sm text-muted">ใบเสนอราคา ใบแจ้งหนี้ ใบกำกับภาษี ใบเสร็จ และอื่นๆ ในที่เดียว</p>
        </div>
        {ctx.role !== "VIEWER" && (
          <Link href="/documents/new" className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90">+ สร้างเอกสาร</Link>
        )}
      </div>

      {/* type tabs */}
      <div className="flex flex-wrap gap-2">
        {tab("ทั้งหมด")}
        {ALL_DOC_TYPES.map((m) => tab(`${m.emoji} ${m.short}`, m.type))}
      </div>

      {/* status + search */}
      <form method="get" className="flex flex-wrap items-center gap-2">
        {type && <input type="hidden" name="type" value={type} />}
        <input name="q" defaultValue={q ?? ""} placeholder="ค้นหาเลขที่ / ชื่อลูกค้า"
          className="w-56 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent" />
        <select name="status" defaultValue={status ?? ""} className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent">
          <option value="">ทุกสถานะ</option>
          <option value="DRAFT">ฉบับร่าง</option>
          <option value="SENT">ออกแล้ว/ส่งแล้ว</option>
          <option value="PAID">ชำระแล้ว</option>
          <option value="OVERDUE">เกินกำหนด</option>
          <option value="ACCEPTED">ตอบรับแล้ว</option>
          <option value="VOID">ยกเลิก</option>
        </select>
        <button className="rounded-lg bg-surface px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-paper">กรอง</button>
      </form>

      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">เลขที่</th>
              <th className="px-4 py-3 font-medium">ประเภท</th>
              <th className="px-4 py-3 font-medium">ลูกค้า</th>
              <th className="px-4 py-3 font-medium">วันที่</th>
              <th className="px-4 py-3 text-right font-medium">ยอดสุทธิ</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-faint">ยังไม่มีเอกสาร — กด “สร้างเอกสาร” เพื่อเริ่ม</td></tr>}
            {docs.map((d) => (
              <tr key={d.id} className="border-b border-line last:border-0 hover:bg-paper">
                <td className="px-4 py-3"><Link href={`/invoices/${d.id}`} className="font-medium text-accent hover:underline">{d.number}</Link></td>
                <td className="px-4 py-3"><DocTypeBadge type={d.docType} /></td>
                <td className="px-4 py-3">{d.customer.name}</td>
                <td className="px-4 py-3 text-muted tabular-nums">{d.issueDate.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatBaht(d.netSatang)}</td>
                <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
