const MAP: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "ฉบับร่าง", cls: "bg-slate-100 text-slate-600" },
  SENT: { label: "ออกแล้ว/ส่งแล้ว", cls: "bg-blue-100 text-blue-700" },
  PAID: { label: "ชำระแล้ว", cls: "bg-green-100 text-green-700" },
  OVERDUE: { label: "เกินกำหนด", cls: "bg-red-100 text-red-700" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? MAP.DRAFT;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}
