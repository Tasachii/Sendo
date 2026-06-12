"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { calcTax } from "@/lib/tax";
import { bahtToSatang, formatBaht } from "@/lib/money";
import { createInvoice } from "@/app/actions/invoices";

type Customer = { id: string; name: string; isVatRegistered: boolean; taxId: string | null; hasAddress: boolean };
type Service = { id: string; name: string; defaultJobType: string; defaultUnitPriceBaht: number };
type TaxSetting = { jobType: string; label: string; vatRate: number; whtRate: number; vatApplicable: boolean };
type Row = { description: string; qty: string; unitPriceBaht: string };

const field = "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const label = "mb-1 block text-sm text-slate-600";
const today = () => new Date().toISOString().slice(0, 10);

export function InvoiceForm({ customers, services, taxSettings }: { customers: Customer[]; services: Service[]; taxSettings: TaxSetting[] }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [jobType, setJobType] = useState(taxSettings[0]?.jobType ?? "");
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([{ description: "", qty: "1", unitPriceBaht: "" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const setting = taxSettings.find((t) => t.jobType === jobType);
  const customer = customers.find((c) => c.id === customerId);

  // live totals — cosmetic preview; the server recomputes authoritatively on save
  const totals = useMemo(() => {
    const subtotalSatang = rows.reduce((s, r) => {
      const qty = parseFloat(r.qty) || 0;
      const price = bahtToSatang(parseFloat(r.unitPriceBaht) || 0);
      return s + Math.round(price * qty);
    }, 0);
    if (!setting) return { subtotalSatang, vatSatang: 0, whtSatang: 0, netSatang: subtotalSatang };
    return calcTax({ subtotalSatang, vatRate: setting.vatRate, whtRate: setting.whtRate, vatApplicable: setting.vatApplicable });
  }, [rows, setting]);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { description: "", qty: "1", unitPriceBaht: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }
  function pickService(i: number, serviceId: string) {
    const s = services.find((x) => x.id === serviceId);
    if (!s) return;
    updateRow(i, { description: s.name, unitPriceBaht: String(s.defaultUnitPriceBaht) });
    setJobType(s.defaultJobType);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerId) return setError("กรุณาเลือกลูกค้า");
    setBusy(true);
    const res = await createInvoice({
      customerId,
      jobType,
      issueDate,
      dueDate,
      trackingNo,
      note,
      items: rows.map((r) => ({ description: r.description, qty: parseFloat(r.qty) || 0, unitPriceBaht: parseFloat(r.unitPriceBaht) || 0 })),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push(`/invoices/${res.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">สร้างใบแจ้งหนี้</h1>
      </div>

      <div className="grid gap-4 rounded-xl bg-white p-5 ring-1 ring-slate-200 sm:grid-cols-2">
        <div>
          <label className={label}>ลูกค้า *</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={field}>
            <option value="" disabled>— เลือกลูกค้า —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {customer?.isVatRegistered && !customer.taxId && (
            <p className="mt-1 text-xs text-amber-600">ลูกค้าจด VAT แต่ยังไม่มีเลขผู้เสียภาษี — จะออกใบกำกับไม่ได้</p>
          )}
          {customer && !customer.hasAddress && (
            <p className="mt-1 text-xs text-amber-600">ลูกค้านี้ยังไม่มีที่อยู่ — จะออกใบกำกับไม่ได้</p>
          )}
        </div>
        <div>
          <label className={label}>ประเภทงาน * (กำหนดอัตราภาษีอัตโนมัติ)</label>
          <select value={jobType} onChange={(e) => setJobType(e.target.value)} className={field}>
            {taxSettings.map((t) => <option key={t.jobType} value={t.jobType}>{t.label}</option>)}
          </select>
          {setting && (
            <p className="mt-1 text-xs text-slate-500">
              VAT {setting.vatApplicable ? `${(setting.vatRate * 100).toFixed(0)}%` : "ยกเว้น"} · หัก ณ ที่จ่าย {(setting.whtRate * 100).toFixed(0)}%
            </p>
          )}
        </div>
        <div>
          <label className={label}>วันที่ออก *</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>ครบกำหนดชำระ</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>เลข Tracking (ถ้ามี)</label>
          <input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>หมายเหตุ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </div>
      </div>

      {/* line items */}
      <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">รายการ</h2>
          <button type="button" onClick={addRow} className="text-sm font-medium text-accent hover:underline">+ เพิ่มรายการ</button>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => {
            const lineSatang = Math.round(bahtToSatang(parseFloat(r.unitPriceBaht) || 0) * (parseFloat(r.qty) || 0));
            return (
              <div key={i} className="grid grid-cols-12 gap-2">
                <div className="col-span-12 sm:col-span-5">
                  <input placeholder="รายละเอียด" value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} className={field} />
                  {services.length > 0 && (
                    <select onChange={(e) => { pickService(i, e.target.value); e.target.value = ""; }} defaultValue="" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500">
                      <option value="" disabled>เลือกจากรายการบริการ…</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <input type="number" step="0.01" min="0" placeholder="จำนวน" value={r.qty} onChange={(e) => updateRow(i, { qty: e.target.value })} className={field} />
                </div>
                <div className="col-span-5 sm:col-span-3">
                  <input type="number" step="0.01" min="0" placeholder="ราคา/หน่วย" value={r.unitPriceBaht} onChange={(e) => updateRow(i, { unitPriceBaht: e.target.value })} className={field} />
                </div>
                <div className="col-span-3 sm:col-span-1 flex items-center justify-end text-sm tabular-nums text-slate-600">
                  {formatBaht(lineSatang)}
                </div>
                <div className="col-span-1 flex items-center justify-end">
                  <button type="button" onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-500">✕</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* totals — READ ONLY (poka-yoke §6) */}
      <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <div className="ml-auto max-w-sm space-y-2">
          <Row3 label="ยอดก่อนภาษี (Subtotal)" value={formatBaht(totals.subtotalSatang)} />
          <Row3 label={`VAT ${setting?.vatApplicable ? `(${(setting.vatRate * 100).toFixed(0)}%)` : "(ยกเว้น)"}`} value={`+ ${formatBaht(totals.vatSatang)}`} />
          <Row3 label={`หัก ณ ที่จ่าย (${((setting?.whtRate ?? 0) * 100).toFixed(0)}%)`} value={`- ${formatBaht(totals.whtSatang)}`} />
          <div className="flex items-center justify-between border-t border-slate-200 pt-2">
            <span className="font-semibold">ยอดชำระสุทธิ (Net)</span>
            <span className="text-xl font-bold text-accent tabular-nums">{formatBaht(totals.netSatang)} ฿</span>
          </div>
          <p className="text-right text-xs text-slate-400">ระบบคำนวณให้อัตโนมัติ — แก้ไขไม่ได้</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.push("/invoices")} className="rounded-lg px-4 py-2.5 ring-1 ring-slate-300 hover:bg-slate-50">ยกเลิก</button>
        <button type="submit" disabled={busy} className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "กำลังบันทึก…" : "บันทึกฉบับร่าง"}
        </button>
      </div>
    </form>
  );
}

function Row3({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="calc-field rounded px-2 py-0.5 tabular-nums">{value}</span>
    </div>
  );
}
