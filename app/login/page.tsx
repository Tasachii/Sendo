"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(form.get("email")),
      password: String(form.get("password")),
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-accent">Sendo</h1>
          <p className="mt-1 text-sm text-slate-500">ส่งบิล ถูกต้องตั้งแต่แรก</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold">เข้าสู่ระบบ</h2>
          <div>
            <label className="mb-1 block text-sm text-slate-600">อีเมล</label>
            <input name="email" type="email" required autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">รหัสผ่าน</label>
            <input name="password" type="password" required autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-accent py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-50">
            {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </button>
          <p className="text-center text-sm text-slate-500">
            ยังไม่มีบัญชี? <Link href="/register" className="text-accent hover:underline">สมัครบริษัทใหม่</Link>
          </p>
          <p className="rounded-lg bg-slate-50 p-2 text-center text-xs text-slate-400">
            เดโม่: demo@sendo.test / demo1234
          </p>
        </form>
      </div>
    </div>
  );
}
