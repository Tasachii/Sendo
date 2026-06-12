"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createService, updateService, deleteService } from "@/app/actions/services";
import { formatBaht } from "@/lib/money";

type Service = { id: string; name: string; defaultJobType: string; defaultUnitPriceSatang: number };
type JobType = { jobType: string; label: string };

const field = "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const label = "mb-1 block text-sm text-slate-600";

export function ServicesManager({ initial, jobTypes, canWrite }: { initial: Service[]; jobTypes: JobType[]; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const labelFor = (jt: string) => jobTypes.find((j) => j.jobType === jt)?.label ?? jt;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = editing ? await updateService(editing.id, fd) : await createService(fd);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setShowForm(false);
    router.refresh();
  }

  async function onDelete(s: Service) {
    if (!confirm(`ลบรายการ "${s.name}" ?`)) return;
    const res = await deleteService(s.id);
    if (!res.ok) return alert(res.error);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">รายการบริการ</h1>
          <p className="text-sm text-slate-500">รายการที่ใช้บ่อย เลือกตอนออกบิลได้เลย ไม่ต้องพิมพ์ใหม่</p>
        </div>
        {canWrite && (
          <button onClick={() => { setEditing(null); setError(""); setShowForm(true); }}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90">+ เพิ่มรายการ</button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">ชื่อรายการ</th>
              <th className="px-4 py-3 font-medium">ประเภทงาน</th>
              <th className="px-4 py-3 text-right font-medium">ราคาตั้งต้น (บาท)</th>
              {canWrite && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">ยังไม่มีรายการ</td></tr>}
            {initial.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-slate-600">{labelFor(s.defaultJobType)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatBaht(s.defaultUnitPriceSatang)}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => { setEditing(s); setError(""); setShowForm(true); }} className="text-accent hover:underline">แก้ไข</button>
                    <button onClick={() => onDelete(s)} className="ml-3 text-red-500 hover:underline">ลบ</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowForm(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={onSubmit} className="w-full max-w-md space-y-3 rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{editing ? "แก้ไขรายการ" : "เพิ่มรายการ"}</h2>
            <div>
              <label className={label}>ชื่อรายการ *</label>
              <input name="name" required defaultValue={editing?.name} className={field} />
            </div>
            <div>
              <label className={label}>ประเภทงาน *</label>
              <select name="defaultJobType" required defaultValue={editing?.defaultJobType ?? ""} className={field}>
                <option value="" disabled>— เลือกประเภทงาน —</option>
                {jobTypes.map((j) => <option key={j.jobType} value={j.jobType}>{j.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>ราคาตั้งต้น (บาท)</label>
              <input name="defaultUnitPriceBaht" type="number" min="0" step="0.01"
                defaultValue={editing ? editing.defaultUnitPriceSatang / 100 : 0} className={field} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 ring-1 ring-slate-300 hover:bg-slate-50">ยกเลิก</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
