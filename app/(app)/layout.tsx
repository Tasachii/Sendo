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
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-7">
            <span className="flex items-baseline gap-1.5">
              <span className="text-xl font-semibold tracking-tight text-ink">Sendo</span>
              <span className="text-xs text-faint">センド</span>
            </span>
            <nav className="hidden items-center gap-1 sm:flex">
              <NavLink href="/dashboard">หน้าหลัก</NavLink>
              <NavLink href="/invoices">ใบแจ้งหนี้</NavLink>
              <NavLink href="/customers">ลูกค้า</NavLink>
              <NavLink href="/services">รายการบริการ</NavLink>
              <NavLink href="/reports">รายงานภาษี</NavLink>
              <NavLink href="/audit">ประวัติ</NavLink>
              {ctx.role === "OWNER" && <NavLink href="/team">ทีมงาน</NavLink>}
              <NavLink href="/settings">ตั้งค่าภาษี</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{ctx.name}</p>
              <p className="text-xs leading-tight text-faint">{company?.name}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-4 py-2 sm:hidden">
          <NavLink href="/dashboard">หน้าหลัก</NavLink>
          <NavLink href="/invoices">ใบแจ้งหนี้</NavLink>
          <NavLink href="/customers">ลูกค้า</NavLink>
          <NavLink href="/services">บริการ</NavLink>
          <NavLink href="/reports">รายงาน</NavLink>
          <NavLink href="/audit">ประวัติ</NavLink>
          {ctx.role === "OWNER" && <NavLink href="/team">ทีม</NavLink>}
          <NavLink href="/settings">ภาษี</NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
