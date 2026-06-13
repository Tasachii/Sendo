"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerCompany } from "@/app/actions/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await registerCompany(form);
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    // auto sign-in after registering
    await signIn("credentials", {
      email: String(form.get("email")),
      password: String(form.get("password")),
      redirect: false,
    });
    router.push("/dashboard");
    router.refresh();
  }

  const field = "w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
  const label = "mb-1 block text-sm text-muted";

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-accent">Sendo</h1>
          <p className="mt-1 text-sm text-muted">สมัครใช้งานสำหรับบริษัทของคุณ</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-surface p-6 shadow-sm ring-1 ring-line">
          <h2 className="text-lg font-semibold">ข้อมูลบริษัท</h2>
          <div>
            <label className={label}>ชื่อบริษัท</label>
            <input name="companyName" required className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>เลขผู้เสียภาษี (13 หลัก)</label>
              <input name="companyTaxId" required maxLength={13} className={field} />
            </div>
            <div>
              <label className={label}>สาขา</label>
              <input value="สำนักงานใหญ่" disabled className={`${field} calc-field`} />
            </div>
          </div>
          <div>
            <label className={label}>ที่อยู่บริษัท</label>
            <textarea name="companyAddress" required rows={2} className={field} />
          </div>

          <h2 className="pt-2 text-lg font-semibold">บัญชีผู้ใช้ (เจ้าของ)</h2>
          <div>
            <label className={label}>ชื่อผู้ใช้</label>
            <input name="ownerName" required className={field} />
          </div>
          <div>
            <label className={label}>อีเมล</label>
            <input name="email" type="email" required className={field} />
          </div>
          <div>
            <label className={label}>รหัสผ่าน (อย่างน้อย 8 ตัว)</label>
            <input name="password" type="password" required minLength={8} className={field} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-accent py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-50">
            {loading ? "กำลังสมัคร…" : "สมัครและเริ่มใช้งาน"}
          </button>
          <p className="text-center text-sm text-muted">
            มีบัญชีแล้ว? <Link href="/login" className="text-accent hover:underline">เข้าสู่ระบบ</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
