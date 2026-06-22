const MAP: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "ฉบับร่าง", cls: "bg-accent-wash text-muted" },
  SENT: { label: "ออกแล้ว/ส่งแล้ว", cls: "bg-blue-100 text-blue-700" },
  PAID: { label: "ชำระแล้ว", cls: "bg-green-100 text-green-700" },
  OVERDUE: { label: "เกินกำหนด", cls: "bg-red-100 text-red-700" },
  ACCEPTED: { label: "ตอบรับแล้ว", cls: "bg-green-100 text-green-700" },
  REJECTED: { label: "ปฏิเสธ", cls: "bg-red-100 text-red-700" },
  EXPIRED: { label: "หมดอายุ", cls: "bg-amber-100 text-amber-700" },
  VOID: { label: "ยกเลิก", cls: "bg-stone-200 text-stone-600 line-through" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? MAP.DRAFT;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}
