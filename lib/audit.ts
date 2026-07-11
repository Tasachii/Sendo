import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { SessionContext } from "@/lib/tenant";

/**
 * Append-only audit trail. Best-effort: a logging failure must never break the
 * underlying business action, so we swallow errors here.
 */
export async function logAudit(
  ctx: SessionContext,
  action: string,
  entity: string,
  entityId: string,
  detail?: string
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        userName: ctx.name || ctx.email,
        action,
        entity,
        entityId,
        detail: detail ?? null,
      },
    });
  } catch {
    // never let audit logging break the primary action
  }
}

/** Required audit write for compliance-sensitive mutations; caller owns the transaction. */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  ctx: SessionContext,
  action: string,
  entity: string,
  entityId: string,
  detail?: string
): Promise<void> {
  await tx.auditLog.create({
    data: {
      companyId: ctx.companyId,
      userId: ctx.userId,
      userName: ctx.name || ctx.email,
      action,
      entity,
      entityId,
      detail: detail ?? null,
    },
  });
}
