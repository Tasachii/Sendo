import { db } from "@/lib/db";

/**
 * Flip SENT invoices whose dueDate has passed to OVERDUE. Called on read from the
 * dashboard and invoice list so the status is always current without a cron job.
 * Tenant-scoped — only touches the given company's rows.
 */
export async function sweepOverdue(companyId: string): Promise<void> {
  const now = new Date();
  await db.invoice.updateMany({
    where: { companyId, status: "SENT", dueDate: { not: null, lt: now } },
    data: { status: "OVERDUE" },
  });
}
