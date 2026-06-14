"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addTeamMember, changeMemberRole, removeTeamMember } from "@/app/actions/team";

type Member = { id: string; name: string; email: string; role: "OWNER" | "STAFF" | "VIEWER" };

const ROLE_LABEL: Record<string, string> = { OWNER: "เจ้าของ", STAFF: "พนักงาน", VIEWER: "ดูอย่างเดียว" };
const field = "w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const label = "mb-1 block text-sm text-muted";

export function TeamManager({ initial, meId }: { initial: Member[]; meId: string }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await addTeamMember(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setShowForm(false);
    router.refresh();
  }

  async function onRole(m: Member, role: Member["role"]) {
    const res = await changeMemberRole(m.id, role);
    if (!res.ok) return alert(res.error);
    router.refresh();
  }

  async function onRemove(m: Member) {
    if (!confirm(`ลบสมาชิก "${m.name}" ?`)) return;
    const res = await removeTeamMember(m.id);
    if (!res.ok) return alert(res.error);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ทีมงาน</h1>
          <p className="text-sm text-muted">เชิญพนักงานเข้ามาใช้ในบริษัทเดียวกัน — เลือกบทบาทได้</p>
        </div>
        <button onClick={() => { setError(""); setShowForm(true); }} className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90">+ เพิ่มสมาชิก</button>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        <span className="font-medium">เจ้าของ</span> จัดการทุกอย่าง · <span className="font-medium">พนักงาน</span> สร้าง/แก้บิลได้ แต่ลบไม่ได้ · <span className="font-medium">ดูอย่างเดียว</span> ดูได้อย่างเดียว
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">ชื่อ</th>
              <th className="px-4 py-3 font-medium">อีเมล</th>
              <th className="px-4 py-3 font-medium">บทบาท</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {initial.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{m.name}{m.id === meId && <span className="ml-2 text-xs text-faint">(คุณ)</span>}</td>
                <td className="px-4 py-3 text-muted">{m.email}</td>
                <td className="px-4 py-3">
                  {m.id === meId ? (
                    <span>{ROLE_LABEL[m.role]}</span>
                  ) : (
                    <select value={m.role} onChange={(e) => onRole(m, e.target.value as Member["role"])} className="rounded-lg border border-line px-2 py-1">
                      <option value="OWNER">เจ้าของ</option>
                      <option value="STAFF">พนักงาน</option>
                      <option value="VIEWER">ดูอย่างเดียว</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {m.id !== meId && <button onClick={() => onRemove(m)} className="text-red-500 hover:underline">ลบ</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowForm(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={onAdd} className="w-full max-w-md space-y-3 rounded-xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold">เพิ่มสมาชิก</h2>
            <div><label className={label}>ชื่อ *</label><input name="name" required className={field} /></div>
            <div><label className={label}>อีเมล *</label><input name="email" type="email" required className={field} /></div>
            <div><label className={label}>รหัสผ่านชั่วคราว * (อย่างน้อย 8 ตัว)</label><input name="password" type="password" required minLength={8} className={field} /></div>
            <div>
              <label className={label}>บทบาท *</label>
              <select name="role" defaultValue="STAFF" className={field}>
                <option value="STAFF">พนักงาน (สร้าง/แก้บิล)</option>
                <option value="VIEWER">ดูอย่างเดียว</option>
                <option value="OWNER">เจ้าของ (จัดการทุกอย่าง)</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 ring-1 ring-line hover:bg-paper">ยกเลิก</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50">{busy ? "กำลังเพิ่ม…" : "เพิ่มสมาชิก"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
