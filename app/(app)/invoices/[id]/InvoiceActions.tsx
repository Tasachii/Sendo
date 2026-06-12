"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { issueInvoice, setInvoiceStatus, deleteInvoice } from "@/app/actions/invoices";

export function InvoiceActions({ id, status, hasWht, canWrite }: { id: string; status: string; hasWht: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const isDraft = status === "DRAFT";
  const issued = status !== "DRAFT";

  async function onIssue() {
    setBusy(true);
    setMissing([]);
    const res = await issueInvoice(id);
    setBusy(false);
    if (!res.ok) {
      if (res.missing?.length) setMissing(res.missing);
      else alert(res.error);
      return;
    }
    router.refresh();
  }

  async function mark(s: "PAID" | "SENT") {
    setBusy(true);
    await setInvoiceStatus(id, s);
    setBusy(false);
    router.refresh();
  }

  async function onDelete() {
    if (!confirm("ลบใบแจ้งหนี้นี้?")) return;
    const res = await deleteInvoice(id);
    if (!res.ok) return alert(res.error);
    router.push("/invoices");
    router.refresh();
  }

  const btn = "rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {issued && (
          <>
            <a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noopener noreferrer"
              className={`${btn} bg-accent text-white hover:opacity-90`}>ดาวน์โหลดใบกำกับภาษี (PDF)</a>
            {hasWht && (
              <a href={`/api/invoices/${id}/wht`} target="_blank" rel="noopener noreferrer"
                className={`${btn} bg-white ring-1 ring-slate-300 hover:bg-slate-50`}>ใบหัก ณ ที่จ่าย (50 ทวิ)</a>
            )}
          </>
        )}
        {canWrite && isDraft && (
          <button onClick={onIssue} disabled={busy} className={`${btn} bg-accent text-white hover:opacity-90`}>
            {busy ? "กำลังตรวจ…" : "ออกใบกำกับภาษี"}
          </button>
        )}
        {canWrite && status === "SENT" && (
          <button onClick={() => mark("PAID")} disabled={busy} className={`${btn} bg-green-600 text-white hover:opacity-90`}>ทำเครื่องหมายว่าชำระแล้ว</button>
        )}
        {canWrite && (
          <button onClick={onDelete} className={`${btn} text-red-500 hover:bg-red-50`}>ลบ</button>
        )}
      </div>

      {missing.length > 0 && (
        <div className="max-w-md rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-800">ออกใบกำกับภาษีไม่ได้ — ข้อมูลไม่ครบตามมาตรา 86/4:</p>
          <ul className="mt-1 list-disc pl-5 text-amber-700">
            {missing.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
