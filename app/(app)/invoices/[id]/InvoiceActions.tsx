"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DocType, InvoiceStatus } from "@prisma/client";
import { issueInvoice, setInvoiceStatus, deleteInvoice, duplicateInvoice, convertDocument } from "@/app/actions/invoices";
import { docMeta, conversionTargets, allowedTransitions, canConvertStatus } from "@/lib/docTypes";

const STATUS_LABEL: Partial<Record<InvoiceStatus, string>> = {
  PAID: "ทำเครื่องหมายว่าชำระแล้ว",
  ACCEPTED: "ลูกค้าตอบรับ",
  REJECTED: "ลูกค้าปฏิเสธ",
  EXPIRED: "หมดอายุ",
  VOID: "ยกเลิกเอกสาร",
};
// Status transitions surfaced as buttons (others are handled automatically / rarely used).
const STATUS_BTNS: InvoiceStatus[] = ["PAID", "ACCEPTED", "REJECTED", "VOID"];

export function InvoiceActions({ id, docType, status, hasWht, canWrite }: {
  id: string; docType: DocType; status: InvoiceStatus; hasWht: boolean; canWrite: boolean;
}) {
  const router = useRouter();
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const meta = docMeta(docType);
  const isDraft = status === "DRAFT";
  const issued = status !== "DRAFT";
  const targets = canConvertStatus(status) ? conversionTargets(docType) : [];
  const transitions = allowedTransitions(docType, status).filter((t) => STATUS_BTNS.includes(t));

  async function onIssue() {
    setBusy(true); setMissing([]);
    const res = await issueInvoice(id);
    setBusy(false);
    if (!res.ok) { if (res.missing?.length) setMissing(res.missing); else alert(res.error); return; }
    router.refresh();
  }
  async function mark(s: InvoiceStatus) {
    setBusy(true);
    const res = await setInvoiceStatus(id, s);
    setBusy(false);
    if (!res.ok) return alert(res.error);
    router.refresh();
  }
  async function onConvert(target: DocType) {
    let reason: string | undefined;
    if (target === "CREDIT_NOTE" || target === "DEBIT_NOTE") {
      const entered = window.prompt(`กรุณาระบุเหตุผลสำหรับ${docMeta(target).short}`);
      if (entered === null) return;
      reason = entered.trim();
      if (!reason) return alert("กรุณาระบุเหตุผลก่อนแปลงเอกสาร");
    }
    setBusy(true);
    const res = await convertDocument(id, target, { reason });
    setBusy(false);
    if (!res.ok) return alert(res.error);
    router.push(`/invoices/${res.id}`);
    router.refresh();
  }
  async function onDelete() {
    if (!confirm("ลบเอกสารนี้?")) return;
    const res = await deleteInvoice(id);
    if (!res.ok) return alert(res.error);
    router.push("/documents");
    router.refresh();
  }
  async function onCopy() {
    setBusy(true);
    const res = await duplicateInvoice(id);
    setBusy(false);
    if (!res.ok) return alert(res.error);
    router.push(`/invoices/${res.id}`);
    router.refresh();
  }

  const btn = "rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {issued && (
          <>
            <a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noopener noreferrer" className={`${btn} bg-accent text-white hover:opacity-90`}>ดาวน์โหลด PDF</a>
            {hasWht && (
              <a href={`/api/invoices/${id}/wht`} target="_blank" rel="noopener noreferrer" className={`${btn} bg-surface ring-1 ring-line hover:bg-paper`}>ใบหัก ณ ที่จ่าย (50 ทวิ)</a>
            )}
            {meta.isTaxDoc && (
              <a href={`/api/invoices/${id}/etax`} target="_blank" rel="noopener noreferrer" className={`${btn} bg-surface ring-1 ring-line hover:bg-paper`}>e-Tax (XML/PDF)</a>
            )}
          </>
        )}
        {canWrite && isDraft && (
          <button onClick={onIssue} disabled={busy} className={`${btn} bg-accent text-white hover:opacity-90`}>
            {busy ? "กำลังตรวจ…" : meta.issueVerb}
          </button>
        )}
        {canWrite && transitions.map((t) => (
          <button key={t} onClick={() => mark(t)} disabled={busy}
            className={`${btn} ${t === "PAID" || t === "ACCEPTED" ? "bg-green-600 text-white hover:opacity-90" : "bg-surface ring-1 ring-line hover:bg-paper"}`}>
            {STATUS_LABEL[t] ?? t}
          </button>
        ))}
        {canWrite && targets.map((t) => (
          <button key={t} onClick={() => onConvert(t)} disabled={busy} className={`${btn} bg-ink text-paper hover:opacity-90`}>
            แปลงเป็น{docMeta(t).short}
          </button>
        ))}
        {canWrite && <button onClick={onCopy} disabled={busy} className={`${btn} bg-surface ring-1 ring-line hover:bg-paper`}>ก๊อปฉบับร่างใหม่</button>}
        {canWrite && isDraft && <button onClick={onDelete} className={`${btn} text-red-500 hover:bg-red-50`}>ลบ</button>}
      </div>

      {missing.length > 0 && (
        <div className="max-w-md rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-800">ออก{meta.short}ไม่ได้ — ข้อมูลไม่ครบ:</p>
          <ul className="mt-1 list-disc pl-5 text-amber-700">
            {missing.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
