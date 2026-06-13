"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTaxSetting } from "@/app/actions/taxSettings";

type Setting = { jobType: string; label: string; vatRate: number; whtRate: number; vatApplicable: boolean };

export function TaxSettingsManager({ initial, canWrite }: { initial: Setting[]; canWrite: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [savingKey, setSavingKey] = useState("");

  function patch(jobType: string, p: Partial<Setting>) {
    setRows((rs) => rs.map((r) => (r.jobType === jobType ? { ...r, ...p } : r)));
  }

  async function save(r: Setting) {
    setSavingKey(r.jobType);
    const res = await updateTaxSetting(r.jobType, {
      vatRate: r.vatApplicable ? r.vatRate * 100 : 0,
      whtRate: r.whtRate * 100,
      vatApplicable: r.vatApplicable,
    });
    setSavingKey("");
    if (!res.ok) return alert(res.error);
    router.refresh();
  }

  const inp = "w-20 rounded border border-line px-2 py-1 text-right outline-none focus:border-accent";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ตั้งค่าภาษี</h1>
        <p className="text-sm text-muted">อัตรา VAT และภาษีหัก ณ ที่จ่าย แยกตามประเภทงาน</p>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        ⚠️ อัตราเหล่านี้เป็นค่าเริ่มต้นที่พบบ่อย <span className="font-medium">กรุณายืนยันกับนักบัญชีของบริษัท</span> ก่อนใช้งานจริง
        ระบบเก็บอัตราไว้ที่นี่เพื่อให้แก้ได้โดยไม่ต้องแก้โค้ด
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">ประเภทงาน</th>
              <th className="px-4 py-3 font-medium">คิด VAT</th>
              <th className="px-4 py-3 text-right font-medium">VAT %</th>
              <th className="px-4 py-3 text-right font-medium">หัก ณ ที่จ่าย %</th>
              {canWrite && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.jobType} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{r.label}</td>
                <td className="px-4 py-3">
                  <input type="checkbox" disabled={!canWrite} checked={r.vatApplicable}
                    onChange={(e) => patch(r.jobType, { vatApplicable: e.target.checked })} />
                </td>
                <td className="px-4 py-3 text-right">
                  <input className={inp} type="number" min="0" max="100" step="0.5" disabled={!canWrite || !r.vatApplicable}
                    value={r.vatApplicable ? +(r.vatRate * 100).toFixed(2) : 0}
                    onChange={(e) => patch(r.jobType, { vatRate: (parseFloat(e.target.value) || 0) / 100 })} />
                </td>
                <td className="px-4 py-3 text-right">
                  <input className={inp} type="number" min="0" max="100" step="0.5" disabled={!canWrite}
                    value={+(r.whtRate * 100).toFixed(2)}
                    onChange={(e) => patch(r.jobType, { whtRate: (parseFloat(e.target.value) || 0) / 100 })} />
                </td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => save(r)} disabled={savingKey === r.jobType}
                      className="rounded-lg bg-accent px-3 py-1 text-white hover:opacity-90 disabled:opacity-50">
                      {savingKey === r.jobType ? "…" : "บันทึก"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
