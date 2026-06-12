"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomer, updateCustomer, deleteCustomer } from "@/app/actions/customers";

type Customer = {
  id: string;
  name: string;
  taxId: string | null;
  address: string | null;
  branch: string;
  contactPhone: string | null;
  contactEmail: string | null;
  isVatRegistered: boolean;
};

const field = "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const label = "mb-1 block text-sm text-slate-600";

export function CustomersManager({ initial, canWrite }: { initial: Customer[]; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function openNew() {
    setEditing(null);
    setError("");
    setShowForm(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setError("");
    setShowForm(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = editing ? await updateCustomer(editing.id, fd) : await createCustomer(fd);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setShowForm(false);
    router.refresh();
  }

  async function onDelete(c: Customer) {
    if (!confirm(`ลบลูกค้า "${c.name}" ?`)) return;
    const res = await deleteCustomer(c.id);
    if (!res.ok) return alert(res.error);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ลูกค้า</h1>
          <p className="text-sm text-slate-500">ข้อมูลลูกค้าใช้ดึงอัตโนมัติตอนออกบิล — กรอกครั้งเดียวใช้ตลอด</p>
        </div>
        {canWrite && (
          <button onClick={openNew} className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90">
            + เพิ่มลูกค้า
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">ชื่อ</th>
              <th className="px-4 py-3 font-medium">เลขผู้เสียภาษี</th>
              <th className="px-4 py-3 font-medium">VAT</th>
              <th className="px-4 py-3 font-medium">ติดต่อ</th>
              {canWrite && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">ยังไม่มีลูกค้า</td></tr>
            )}
            {initial.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.branch}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.taxId || "—"}</td>
                <td className="px-4 py-3">
                  {c.isVatRegistered ? <span className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">จด VAT</span> : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{c.contactPhone || c.contactEmail || "—"}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(c)} className="text-accent hover:underline">แก้ไข</button>
                    <button onClick={() => onDelete(c)} className="ml-3 text-red-500 hover:underline">ลบ</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowForm(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}
            className="w-full max-w-lg space-y-3 rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{editing ? "แก้ไขลูกค้า" : "เพิ่มลูกค้า"}</h2>
            <div>
              <label className={label}>ชื่อลูกค้า *</label>
              <input name="name" required defaultValue={editing?.name} className={field} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>เลขผู้เสียภาษี</label>
                <input name="taxId" defaultValue={editing?.taxId ?? ""} maxLength={13} className={field} />
              </div>
              <div>
                <label className={label}>สาขา</label>
                <input name="branch" defaultValue={editing?.branch ?? "สำนักงานใหญ่"} className={field} />
              </div>
            </div>
            <div>
              <label className={label}>ที่อยู่</label>
              <textarea name="address" rows={2} defaultValue={editing?.address ?? ""} className={field} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>โทรศัพท์</label>
                <input name="contactPhone" defaultValue={editing?.contactPhone ?? ""} className={field} />
              </div>
              <div>
                <label className={label}>อีเมล</label>
                <input name="contactEmail" type="email" defaultValue={editing?.contactEmail ?? ""} className={field} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input name="isVatRegistered" type="checkbox" defaultChecked={editing?.isVatRegistered} />
              ลูกค้าจดทะเบียน VAT (ต้องระบุเลขผู้เสียภาษีบนใบกำกับ)
            </label>
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
