"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocType } from "@prisma/client";
import { calcTax } from "@/lib/tax";
import { bahtToSatang, formatBaht } from "@/lib/money";
import { docMeta, effectiveTaxSetting } from "@/lib/docTypes";
import { createDocument } from "@/app/actions/invoices";

type Customer = { id: string; name: string; isVatRegistered: boolean; taxId: string | null; hasAddress: boolean };
type Service = { id: string; name: string; defaultJobType: string; defaultUnitPriceBaht: number };
type TaxSetting = { jobType: string; label: string; vatRate: number; whtRate: number; vatApplicable: boolean };
type Mode = "FLAT" | "WEIGHT" | "DISTANCE";
type Row = { description: string; qty: string; unitPriceBaht: string; discountBaht: string; pricingMode: Mode };
type Ship = { trackingNo: string; note: string };

const MODES: { mode: Mode; label: string; qtyLabel: string; priceLabel: string }[] = [
  { mode: "FLAT", label: "เหมา", qtyLabel: "จำนวน", priceLabel: "ราคา/หน่วย" },
  { mode: "WEIGHT", label: "ตามน้ำหนัก", qtyLabel: "กก.", priceLabel: "บาท/กก." },
  { mode: "DISTANCE", label: "ตามระยะทาง", qtyLabel: "กม.", priceLabel: "บาท/กม." },
];

const field = "w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const label = "mb-1 block text-sm text-muted";
const today = () => new Date().toISOString().slice(0, 10);
const newRow = (): Row => ({ description: "", qty: "1", unitPriceBaht: "", discountBaht: "", pricingMode: "FLAT" });

export function DocumentForm({ docType, customers, services, taxSettings }: { docType: DocType; customers: Customer[]; services: Service[]; taxSettings: TaxSetting[] }) {
  const router = useRouter();
  const meta = docMeta(docType);

  const [customerId, setCustomerId] = useState("");
  const [jobType, setJobType] = useState(taxSettings[0]?.jobType ?? "");
  const [issueDate, setIssueDate] = useState(today());
  const [secondaryDate, setSecondaryDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("เงินสด");
  const [payeeName, setPayeeName] = useState("");
  const [reason, setReason] = useState("");
  const [refDocNumber, setRefDocNumber] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [docDiscountBaht, setDocDiscountBaht] = useState("");
  const [shipments, setShipments] = useState<Ship[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const setting = taxSettings.find((t) => t.jobType === jobType);
  const customer = customers.find((c) => c.id === customerId);
  const showLogistics = meta.type === "BILLING_NOTE" || meta.type === "TAX_INVOICE" || meta.type === "RECEIPT";

  // live totals — cosmetic; the server recomputes authoritatively on save
  const totals = useMemo(() => {
    const lineSum = rows.reduce((s, r) => {
      const qty = parseFloat(r.qty) || 0;
      const gross = Math.round(bahtToSatang(parseFloat(r.unitPriceBaht) || 0) * qty);
      const disc = Math.min(bahtToSatang(parseFloat(r.discountBaht) || 0), gross);
      return s + (gross - disc);
    }, 0);
    const docDisc = Math.min(bahtToSatang(parseFloat(docDiscountBaht) || 0), lineSum);
    const subtotalSatang = lineSum - docDisc;
    const effective = effectiveTaxSetting(docType, setting ?? { vatRate: 0, whtRate: 0, vatApplicable: false });
    const t = calcTax({ subtotalSatang, ...effective });
    return { lineSum, docDisc, ...t };
  }, [rows, docDiscountBaht, setting, docType]);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  const addRow = () => setRows((rs) => [...rs, newRow()]);
  const removeRow = (i: number) => setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  function pickService(i: number, serviceId: string) {
    const sv = services.find((x) => x.id === serviceId);
    if (!sv) return;
    updateRow(i, { description: sv.name, unitPriceBaht: String(sv.defaultUnitPriceBaht) });
    setJobType(sv.defaultJobType);
  }

  const addShip = () => setShipments((s) => [...s, { trackingNo: "", note: "" }]);
  const removeShip = (i: number) => setShipments((s) => s.filter((_, idx) => idx !== i));
  const updateShip = (i: number, patch: Partial<Ship>) => setShipments((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerId) return setError("กรุณาเลือกลูกค้า/คู่ค้า");
    setBusy(true);
    try {
      const res = await createDocument({
        docType,
        customerId,
        jobType,
        issueDate,
        dueDate: meta.dateField === "dueDate" ? secondaryDate : "",
        validUntil: meta.dateField === "validUntil" ? secondaryDate : "",
        receivedDate: meta.dateField === "receivedDate" ? secondaryDate : "",
        paymentMethod: meta.type === "RECEIPT" ? paymentMethod : "",
        payeeName,
        reason,
        refDocNumber,
        note,
        docDiscountBaht: parseFloat(docDiscountBaht) || undefined,
        items: rows.map((r) => ({ description: r.description, pricingMode: r.pricingMode, qty: parseFloat(r.qty) || 0, unitPriceBaht: parseFloat(r.unitPriceBaht) || 0, discountBaht: parseFloat(r.discountBaht) || undefined })),
        shipments: showLogistics ? shipments.filter((s) => s.trackingNo.trim()).map((s) => ({ trackingNo: s.trackingNo, note: s.note })) : [],
      });
      if (!res.ok) return setError(res.error);
      router.push(`/invoices/${res.id}`);
      router.refresh();
    } catch {
      setError("บันทึกเอกสารไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{meta.emoji}</span>
        <h1 className="text-2xl font-bold">สร้าง{meta.short}</h1>
      </div>

      <div className="grid gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2">
        <div>
          <label className={label}>{meta.type === "RECEIPT_SUBSTITUTE" ? "ผู้รับเงิน (คู่ค้า)" : "ลูกค้า"} *</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={field}>
            <option value="" disabled>— เลือก —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {meta.gate === "FULL" && customer?.isVatRegistered && !customer.taxId && (
            <p className="mt-1 text-xs text-amber-600">ลูกค้าจด VAT แต่ยังไม่มีเลขผู้เสียภาษี — จะออกเอกสารไม่ได้</p>
          )}
          {meta.gate === "FULL" && customer && !customer.hasAddress && (
            <p className="mt-1 text-xs text-amber-600">ลูกค้านี้ยังไม่มีที่อยู่ — จะออกเอกสารไม่ได้</p>
          )}
        </div>
        <div>
          <label className={label}>ประเภทงาน * (กำหนดอัตราภาษีอัตโนมัติ)</label>
          <select value={jobType} onChange={(e) => setJobType(e.target.value)} className={field}>
            {taxSettings.map((t) => <option key={t.jobType} value={t.jobType}>{t.label}</option>)}
          </select>
          {setting && meta.isTaxDoc && (
            <p className="mt-1 text-xs text-muted">
              VAT {setting.vatApplicable ? `${(setting.vatRate * 100).toFixed(0)}%` : "ยกเว้น"}
              {meta.showWht ? ` · หัก ณ ที่จ่าย ${(setting.whtRate * 100).toFixed(0)}%` : ""}
            </p>
          )}
        </div>
        <div>
          <label className={label}>วันที่ออก *</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={field} />
        </div>
        {meta.dateField !== "none" && (
          <div>
            <label className={label}>{meta.dateLabel}</label>
            <input type="date" value={secondaryDate} onChange={(e) => setSecondaryDate(e.target.value)} className={field} />
          </div>
        )}
        {meta.type === "RECEIPT" && (
          <div>
            <label className={label}>วิธีชำระเงิน</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={field}>
              {["เงินสด", "โอนเงิน", "เช็ค", "บัตรเครดิต", "QR พร้อมเพย์"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
        {meta.type === "RECEIPT_SUBSTITUTE" && (
          <div className="sm:col-span-2">
            <label className={label}>ชื่อผู้รับเงิน (ถ้าต่างจากคู่ค้า)</label>
            <input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} className={field} placeholder="เช่น นายสมชาย ใจดี" />
          </div>
        )}
        {(meta.type === "CREDIT_NOTE" || meta.type === "DEBIT_NOTE") && (
          <div>
            <label className={label}>อ้างอิงใบกำกับภาษีเลขที่ *</label>
            <input required value={refDocNumber} onChange={(e) => setRefDocNumber(e.target.value)} className={field} placeholder="เช่น INV-2026-0001" />
          </div>
        )}
        {(meta.type === "CREDIT_NOTE" || meta.type === "DEBIT_NOTE" || meta.type === "RECEIPT_SUBSTITUTE") && (
          <div className="sm:col-span-2">
            <label className={label}>เหตุผล/รายละเอียด *</label>
            <input required value={reason} onChange={(e) => setReason(e.target.value)} className={field} placeholder="เช่น ลดราคาสินค้าชำรุด / จ่ายค่าบริการ" />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={label}>หมายเหตุ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </div>
      </div>

      {/* line items */}
      <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">รายการ</h2>
          <button type="button" onClick={addRow} className="text-sm font-medium text-accent hover:underline">+ เพิ่มรายการ</button>
        </div>
        <div className="space-y-3">
          {rows.map((r, i) => {
            const gross = Math.round(bahtToSatang(parseFloat(r.unitPriceBaht) || 0) * (parseFloat(r.qty) || 0));
            const disc = Math.min(bahtToSatang(parseFloat(r.discountBaht) || 0), gross);
            return (
              <div key={i} className="grid grid-cols-12 gap-2">
                <div className="col-span-12 sm:col-span-3">
                  <input placeholder="รายละเอียด" value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} className={field} />
                  {services.length > 0 && (
                    <select onChange={(e) => { pickService(i, e.target.value); e.target.value = ""; }} defaultValue="" className="mt-1 w-full rounded-lg border border-line px-2 py-1 text-xs text-muted">
                      <option value="" disabled>เลือกจากรายการบริการ…</option>
                      {services.map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <select value={r.pricingMode} onChange={(e) => updateRow(i, { pricingMode: e.target.value as Mode })} className={field} title="วิธีคิดราคา">
                    {MODES.map((x) => <option key={x.mode} value={x.mode}>{x.label}</option>)}
                  </select>
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input type="number" step="0.01" min="0" placeholder="จำนวน" value={r.qty} onChange={(e) => updateRow(i, { qty: e.target.value })} className={field} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input type="number" step="0.01" min="0" placeholder="ราคา/หน่วย" value={r.unitPriceBaht} onChange={(e) => updateRow(i, { unitPriceBaht: e.target.value })} className={field} />
                </div>
                <div className="col-span-5 sm:col-span-1">
                  <input type="number" step="0.01" min="0" placeholder="ส่วนลด฿" value={r.discountBaht} onChange={(e) => updateRow(i, { discountBaht: e.target.value })} className={field} title="ส่วนลดต่อรายการ (บาท)" />
                </div>
                <div className="col-span-5 flex items-center justify-end text-sm tabular-nums text-muted sm:col-span-1">
                  {formatBaht(gross - disc)}
                </div>
                <div className="col-span-2 flex items-center justify-end sm:col-span-1">
                  <button type="button" onClick={() => removeRow(i)} className="text-faint hover:text-red-500" title="ลบรายการ">✕</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-3">
          <label className="text-sm text-muted">ส่วนลดท้ายบิล (บาท)</label>
          <input type="number" step="0.01" min="0" value={docDiscountBaht} onChange={(e) => setDocDiscountBaht(e.target.value)} className="w-32 rounded-lg border border-line px-3 py-1.5 text-right outline-none focus:border-accent" placeholder="0.00" />
        </div>
      </div>

      {/* shipments — logistics docs only */}
      {showLogistics && (
        <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">เลขติดตามพัสดุ (Tracking)</h2>
            <button type="button" onClick={addShip} className="text-sm font-medium text-accent hover:underline">+ เพิ่ม tracking</button>
          </div>
          {shipments.length === 0 ? (
            <p className="text-sm text-faint">ไม่มีก็ได้ — เอกสารหนึ่งใบรองรับหลาย shipment</p>
          ) : (
            <div className="space-y-2">
              {shipments.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <input className={`${field} col-span-5`} placeholder="เลข tracking" value={s.trackingNo} onChange={(e) => updateShip(i, { trackingNo: e.target.value })} />
                  <input className={`${field} col-span-6`} placeholder="หมายเหตุ (ถ้ามี)" value={s.note} onChange={(e) => updateShip(i, { note: e.target.value })} />
                  <button type="button" onClick={() => removeShip(i)} className="col-span-1 text-faint hover:text-red-500">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* totals — READ ONLY (poka-yoke §6) */}
      <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
        <div className="ml-auto max-w-sm space-y-2">
          {totals.docDisc > 0 && <Row3 label="มูลค่ารวมรายการ" value={formatBaht(totals.lineSum)} />}
          {totals.docDisc > 0 && <Row3 label="ส่วนลดท้ายบิล" value={`- ${formatBaht(totals.docDisc)}`} />}
          <Row3 label="ยอดก่อนภาษี (Subtotal)" value={formatBaht(totals.subtotalSatang)} />
          {meta.isTaxDoc && <Row3 label={`VAT ${setting?.vatApplicable ? `(${(setting.vatRate * 100).toFixed(0)}%)` : "(ยกเว้น)"}`} value={`+ ${formatBaht(totals.vatSatang)}`} />}
          {meta.showWht && <Row3 label={`หัก ณ ที่จ่าย (${((setting?.whtRate ?? 0) * 100).toFixed(0)}%)`} value={`- ${formatBaht(totals.whtSatang)}`} />}
          <div className="flex items-center justify-between border-t border-line pt-2">
            <span className="font-semibold">{meta.type === "QUOTATION" ? "ยอดรวมทั้งสิ้น" : "ยอดชำระสุทธิ"}</span>
            <span className="text-xl font-bold text-accent tabular-nums">{formatBaht(totals.netSatang)} ฿</span>
          </div>
          <p className="text-right text-xs text-faint">ระบบคำนวณให้อัตโนมัติ — แก้ไขไม่ได้</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.push("/documents")} className="rounded-lg px-4 py-2.5 ring-1 ring-line hover:bg-paper">ยกเลิก</button>
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
      <span className="text-muted">{label}</span>
      <span className="calc-field rounded px-2 py-0.5 tabular-nums">{value}</span>
    </div>
  );
}
