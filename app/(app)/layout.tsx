import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { NavLink } from "@/components/NavLink";
import { SignOutButton } from "@/components/SignOutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const company = await db.company.findUnique({
    where: { id: ctx.companyId },
    select: { name: true },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-xl font-bold text-accent">Sendo</span>
            <nav className="hidden items-center gap-1 sm:flex">
              <NavLink href="/dashboard">หน้าหลัก</NavLink>
              <NavLink href="/invoices">ใบแจ้งหนี้</NavLink>
              <NavLink href="/customers">ลูกค้า</NavLink>
              <NavLink href="/services">รายการบริการ</NavLink>
              <NavLink href="/settings">ตั้งค่าภาษี</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{ctx.name}</p>
              <p className="text-xs leading-tight text-slate-400">{company?.name}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 sm:hidden">
          <NavLink href="/dashboard">หน้าหลัก</NavLink>
          <NavLink href="/invoices">ใบแจ้งหนี้</NavLink>
          <NavLink href="/customers">ลูกค้า</NavLink>
          <NavLink href="/services">บริการ</NavLink>
          <NavLink href="/settings">ภาษี</NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
