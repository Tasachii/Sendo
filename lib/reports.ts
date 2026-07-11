import { db } from "@/lib/db";
import { ALL_DOC_TYPES, vatReportCountableStatuses } from "@/lib/docTypes";
import { currentLegalYear, legalYear, legalYearMonth, legalYearRange } from "@/lib/legalDate";
import type { Prisma } from "@prisma/client";

// Only these document types belong in the VAT / WHT monthly summary. A combined
// receipt/tax-invoice (RECEIPT) or a credit/debit note is excluded to avoid double
// counting against the TAX_INVOICE it adjusts — issue a TAX_INVOICE for the VAT report.
const VAT_REPORT_FILTERS: Prisma.InvoiceWhereInput[] = ALL_DOC_TYPES
  .filter((meta) => meta.countsForVatReport)
  .map((meta) => ({
    docType: meta.type,
    status: { in: [...vatReportCountableStatuses(meta.type)] },
  }));

export type MonthRow = {
  month: number; // 1-12
  monthLabel: string;
  count: number;
  subtotalSatang: number;
  vatSatang: number; // ภ.พ.30 — output VAT
  whtSatang: number; // ภ.ง.ด.3/53 — withholding
  netSatang: number;
};

const TH_MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/**
 * Monthly tax summary for legally countable issued invoices. Tenant-scoped.
 * Aggregated in JS (fine for MVP volumes).
 */
export async function monthlySummary(companyId: string, year: number): Promise<MonthRow[]> {
  const { start, end } = legalYearRange(year);
  const invoices = await db.invoice.findMany({
    where: {
      companyId,
      OR: VAT_REPORT_FILTERS,
      issueDate: { gte: start, lt: end },
    },
    select: { issueDate: true, subtotalSatang: true, vatSatang: true, whtSatang: true, netSatang: true },
  });

  const rows: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, monthLabel: TH_MONTHS[i + 1], count: 0,
    subtotalSatang: 0, vatSatang: 0, whtSatang: 0, netSatang: 0,
  }));

  for (const inv of invoices) {
    const { month } = legalYearMonth(inv.issueDate);
    const r = rows[month - 1];
    r.count += 1;
    r.subtotalSatang += inv.subtotalSatang;
    r.vatSatang += inv.vatSatang;
    r.whtSatang += inv.whtSatang;
    r.netSatang += inv.netSatang;
  }
  return rows;
}

export async function availableYears(companyId: string): Promise<number[]> {
  const rows = await db.invoice.findMany({
    where: { companyId, OR: VAT_REPORT_FILTERS },
    select: { issueDate: true },
  });
  const years = new Set(rows.map((r) => legalYear(r.issueDate)));
  years.add(currentLegalYear());
  return [...years].sort((a, b) => b - a);
}
