import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Tenant isolation — THE #1 security rule (build spec §3).
 * Every business-data query must be scoped to the signed-in user's companyId.
 * Use `requireSession()` in every server action / route handler, then pass
 * `session.companyId` into `where: { companyId }`. Never trust a companyId
 * that arrives from the client.
 */
export type SessionContext = {
  userId: string;
  companyId: string;
  role: "OWNER" | "STAFF" | "VIEWER";
  name: string;
  email: string;
};

export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user;
  if (!u?.companyId) return null;
  return {
    userId: u.id,
    companyId: u.companyId,
    role: u.role,
    name: u.name ?? "",
    email: u.email ?? "",
  };
}

/** Throws if not authenticated — use at the top of every protected action. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new Error("UNAUTHENTICATED");
  return ctx;
}

/** VIEWER role is read-only (build spec §6). Call before any write. */
export async function requireWriter(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (ctx.role === "VIEWER") throw new Error("FORBIDDEN_VIEWER_READONLY");
  return ctx;
}

/** OWNER-only actions (team management). */
export async function requireOwner(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (ctx.role !== "OWNER") throw new Error("FORBIDDEN_OWNER_ONLY");
  return ctx;
}

export { db };
