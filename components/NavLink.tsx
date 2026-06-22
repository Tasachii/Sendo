"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, match = [] }: { href: string; children: React.ReactNode; match?: string[] }) {
  const pathname = usePathname();
  const prefixes = [href, ...match];
  const active = prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-accent/10 text-accent" : "text-muted hover:bg-paper"
      }`}
    >
      {children}
    </Link>
  );
}
