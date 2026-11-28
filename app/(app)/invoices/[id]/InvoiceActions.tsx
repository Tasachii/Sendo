"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DocType, InvoiceStatus } from "@prisma/client";
import { issueInvoice, setInvoiceStatus, deleteInvoice, duplicateInvoice, convertDocument } from "@/app/actions/invoices";
import { pendingConversionSchema, type PendingConversion } from "@/lib/validation";
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

function parseStoredIntent(raw: string | null, sourceType: DocType): PendingConversion | "invalid" | null {
  if (raw === null) return null;
  try {
    const parsed = pendingConversionSchema.safeParse(JSON.parse(raw));
    if (parsed.success && conversionTargets(sourceType).includes(parsed.data.target)) return parsed.data;
  } catch {
    // Invalid JSON is still evidence of a pending request.
  }
  return "invalid";
}

function subscribeToIntent(update: () => void) {
  window.addEventListener("conversion-intent", update);
  return () => window.removeEventListener("conversion-intent", update);
}

export function InvoiceActions({ id, companyId, actorId, docType, status, hasWht, canWrite }: {
  id: string; companyId: string; actorId: string; docType: DocType; status: InvoiceStatus; hasWht: boolean; canWrite: boolean;
}) {
  const router = useRouter();
  const [missing, setMissing] = useState<string[]>([]);
  const [working, setBusy] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const busy = working || navigating;
  const submitting = useRef(false);
  const [conversionError, setConversionError] = useState("");
  const slot = `sendo.convert.v1:${JSON.stringify([companyId, actorId, id])}`;
  const stored = useSyncExternalStore(subscribeToIntent, () => {
    try { return sessionStorage.getItem(slot); } catch { return null; }
  }, () => null);
  const record = parseStoredIntent(stored, docType);
  const invalid = record === "invalid";
  const pending = invalid ? null : record;
  const meta = docMeta(docType);
  const isDraft = status === "DRAFT";
  const issued = status !== "DRAFT";
  const targets = pending ? [pending.target] : conversionTargets(docType);
  const showConversions = canWrite && !invalid && (pending !== null || canConvertStatus(status));
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
  function discardUnreadableIntent() {
    try {
      // A different request may have replaced the one shown to the user.
      if (invalid && sessionStorage.getItem(slot) === stored) sessionStorage.removeItem(slot);
      window.dispatchEvent(new Event("conversion-intent"));
      setConversionError("");
    } catch {
      setConversionError("ล้างคำขอไม่ได้ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์");
    }
  }

  async function onConvert(target: DocType) {
    if (submitting.current) return;
    submitting.current = true;
    setConversionError("");
    let sent = false;
    try {
      // Read at click time as well as at render time (including first hydration).
      if (sessionStorage.getItem(slot) !== stored) {
        window.dispatchEvent(new Event("conversion-intent"));
        return;
      }
      if (invalid || (pending && pending.target !== target)) return;
      let intent = pending;
      let submittedRecord = stored;
      if (!intent) {
        let reason: string | undefined;
        if (target === "CREDIT_NOTE" || target === "DEBIT_NOTE") {
          const entered = window.prompt(`กรุณาระบุเหตุผลสำหรับ${docMeta(target).short}`);
          if (entered === null) return;
          reason = entered.trim();
          if (!reason) { setConversionError("กรุณาระบุเหตุผลก่อนแปลงเอกสาร"); return; }
        }
        intent = { target, reason, intentKey: crypto.randomUUID() };
        submittedRecord = JSON.stringify(intent);
        sessionStorage.setItem(slot, submittedRecord);
        window.dispatchEvent(new Event("conversion-intent"));
      }
      setBusy(true);
      sent = true;
      const res = await convertDocument(id, target, { reason: intent.reason, intentKey: intent.intentKey });
      if (res.ok || !res.retryable) {
        if (sessionStorage.getItem(slot) === submittedRecord) sessionStorage.removeItem(slot);
        window.dispatchEvent(new Event("conversion-intent"));
      }
      if (!res.ok) { setConversionError(res.error); return; }
      startNavigation(() => { router.push(`/invoices/${res.id}`); router.refresh(); });
    } catch {
      setConversionError(sent
        ? "ยังยืนยันผลไม่ได้ กดปุ่มลองอีกครั้งเพื่อตรวจสอบคำขอเดิม"
        : "บันทึกคำขอไม่ได้ กรุณาเปิดใช้พื้นที่จัดเก็บของเบราว์เซอร์แล้วลองอีกครั้ง");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
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
        {showConversions && targets.map((t) => (
          <button key={t} onClick={() => onConvert(t)} disabled={busy} className={`${btn} bg-ink text-paper hover:opacity-90`}>
            {pending ? `ลองอีกครั้ง: แปลงเป็น${docMeta(t).short}` : `แปลงเป็น${docMeta(t).short}`}
          </button>
        ))}
        {canWrite && <button onClick={onCopy} disabled={busy} className={`${btn} bg-surface ring-1 ring-line hover:bg-paper`}>ก๊อปฉบับร่างใหม่</button>}
        {canWrite && isDraft && <button onClick={onDelete} className={`${btn} text-red-500 hover:bg-red-50`}>ลบ</button>}
      </div>

      <p role="status" className="text-sm text-muted empty:hidden">
        {canWrite && pending && (working ? "กำลังแปลงเอกสาร…" : "มีคำขอแปลงเอกสารที่ยังไม่ได้ยืนยันผล")}
      </p>
      {canWrite && invalid && (
        <div className="max-w-md text-right">
          <p role="alert" className="text-sm text-red-700">
            อ่านคำขอเดิมไม่ได้ กรุณาตรวจสอบเอกสารที่แปลงจากฉบับนี้ก่อนเริ่มคำขอใหม่
          </p>
          <button type="button" onClick={discardUnreadableIntent} className={`${btn} bg-surface ring-1 ring-line`}>
            ตรวจสอบแล้ว ล้างคำขอที่อ่านไม่ได้
          </button>
        </div>
      )}
      {conversionError && <p role="alert" className="text-sm text-red-700">{conversionError}</p>}
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
