"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateCompanyBranding, updateCompanyProfile } from "@/app/actions/company";

type Company = {
  name: string;
  taxId: string;
  address: string;
  branch: string;
  isVatRegistered: boolean;
  logoDataUrl: string | null;
  sealDataUrl: string | null;
  signatureDataUrl: string | null;
};

type BrandKey = "logoDataUrl" | "sealDataUrl" | "signatureDataUrl";

const field = "w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const label = "mb-1 block text-sm text-muted";

export function CompanyProfileManager({ initial, canEdit }: { initial: Company; canEdit: boolean }) {
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg("");
    const fd = new FormData(e.currentTarget);
    const res = await updateCompanyProfile(fd);
    setSavingProfile(false);
    setProfileMsg(res.ok ? "บันทึกแล้ว ✓" : res.error);
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">ข้อมูลบริษัท (ผู้ขายบนเอกสาร)</h2>
        <p className="text-sm text-muted">ชื่อ ที่อยู่ และเลขผู้เสียภาษีนี้จะปรากฏบนเอกสารทุกใบ</p>
      </div>

      {/* identity */}
      <form onSubmit={saveProfile} className="grid gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>ชื่อบริษัท *</label>
          <input name="name" defaultValue={c.name} disabled={!canEdit} className={field} />
        </div>
        <div>
          <label className={label}>เลขประจำตัวผู้เสียภาษี (13 หลัก) *</label>
          <input name="taxId" defaultValue={c.taxId} disabled={!canEdit} className={field} inputMode="numeric" />
        </div>
        <div>
          <label className={label}>สำนักงานใหญ่/สาขา *</label>
          <input name="branch" defaultValue={c.branch} disabled={!canEdit} className={field} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>ที่อยู่ *</label>
          <input name="address" defaultValue={c.address} disabled={!canEdit} className={field} />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="isVatRegistered" defaultChecked={c.isVatRegistered} disabled={!canEdit} />
          จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)
        </label>
        {canEdit && (
          <div className="flex items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={savingProfile} className="rounded-lg bg-accent px-5 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50">
              {savingProfile ? "กำลังบันทึก…" : "บันทึกข้อมูลบริษัท"}
            </button>
            {profileMsg && <span className="text-sm text-muted">{profileMsg}</span>}
          </div>
        )}
      </form>

      {/* branding */}
      <div>
        <h2 className="text-lg font-semibold">โลโก้ · ตราประทับ · ลายเซ็น</h2>
        <p className="text-sm text-muted">อัปโหลดเพื่อแสดงบนไฟล์ PDF ของเอกสารทุกใบ (PNG/JPG ไม่เกิน 300KB)</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <BrandSlot title="โลโก้บริษัท" field="logoDataUrl" value={c.logoDataUrl} canEdit={canEdit}
          onChange={(v) => setC((p) => ({ ...p, logoDataUrl: v }))} />
        <BrandSlot title="ตราประทับบริษัท" field="sealDataUrl" value={c.sealDataUrl} canEdit={canEdit}
          onChange={(v) => setC((p) => ({ ...p, sealDataUrl: v }))} />
        <BrandSlot title="ลายเซ็นผู้มีอำนาจ" field="signatureDataUrl" value={c.signatureDataUrl} canEdit={canEdit}
          onChange={(v) => setC((p) => ({ ...p, signatureDataUrl: v }))} />
      </div>
    </div>
  );
}

function BrandSlot({ title, field: key, value, canEdit, onChange }: {
  title: string; field: BrandKey; value: string | null; canEdit: boolean; onChange: (v: string | null) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function persist(dataUrl: string | null) {
    setBusy(true);
    setError("");
    const res = await updateCompanyBranding({ [key]: dataUrl });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onChange(dataUrl);
    router.refresh();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 300 * 1024) return setError("ไฟล์ใหญ่เกินไป (จำกัด 300KB)");
    const reader = new FileReader();
    reader.onload = () => persist(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => setError("อ่านไฟล์ไม่สำเร็จ");
    reader.readAsDataURL(file);
  }

  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-line bg-paper">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={title} className="max-h-20 max-w-full object-contain" />
        ) : (
          <span className="text-xs text-faint">ยังไม่มีรูป</span>
        )}
      </div>
      {canEdit && (
        <div className="mt-3 flex items-center gap-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg" onChange={onFile} className="hidden" />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "…" : value ? "เปลี่ยนรูป" : "อัปโหลด"}
          </button>
          {value && (
            <button type="button" disabled={busy} onClick={() => persist(null)}
              className="rounded-lg px-3 py-1.5 text-sm text-red-500 hover:bg-red-50">ลบ</button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
