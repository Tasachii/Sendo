import type { DocType, InvoiceStatus } from "@prisma/client";

export const DASHBOARD_BILLING_TYPES: DocType[] = ["BILLING_NOTE", "TAX_INVOICE", "RECEIPT"];

export type DashboardDocument = {
  id: string;
  sourceId: string | null;
  docType: DocType;
  status: InvoiceStatus;
  issueDate: Date;
  netSatang: number;
};

export type DashboardMetric = { count: number; netSatang: number };

/**
 * Dashboard policy: count issued, non-void terminal billing documents only. When a
 * billing document has been converted into another billing document, its latest leaf
 * represents the same economic event and the source is excluded to avoid double count.
 */
export function dashboardMetrics(rows: DashboardDocument[], monthStart: Date, monthEnd: Date) {
  const billing = rows.filter((row) => DASHBOARD_BILLING_TYPES.includes(row.docType));
  const issued = billing.filter((row) => row.status !== "DRAFT" && row.status !== "VOID");
  const derivedSourceIds = new Set(issued.map((row) => row.sourceId).filter((id): id is string => Boolean(id)));
  const leaves = issued.filter((row) => !derivedSourceIds.has(row.id));
  const sum = (selected: DashboardDocument[]): DashboardMetric => ({
    count: selected.length,
    netSatang: selected.reduce((total, row) => total + row.netSatang, 0),
  });

  return {
    issuedThisMonth: sum(leaves.filter((row) => row.issueDate >= monthStart && row.issueDate < monthEnd)),
    unpaid: sum(leaves.filter((row) => row.status === "SENT" || row.status === "OVERDUE")),
    overdue: sum(leaves.filter((row) => row.status === "OVERDUE")),
  };
}
