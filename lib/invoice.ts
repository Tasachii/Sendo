import type { Prisma, PrismaClient } from "@prisma/client";
import { calcTax } from "@/lib/tax";
import { bahtToSatang } from "@/lib/money";

export type DraftItem = { description: string; qty: number; unitPriceBaht: number };

export type ComputedItem = {
  description: string;
  qty: number;
  unitPriceSatang: number;
  lineTotalSatang: number;
};

export type ComputedTotals = {
  items: ComputedItem[];
  subtotalSatang: number;
  vatSatang: number;
  whtSatang: number;
  netSatang: number;
};

/**
 * Authoritative money math — runs on the SERVER from the company's own TaxSetting.
 * Client previews are cosmetic; this is the source of truth (build spec §3).
 */
export function computeTotals(
  items: DraftItem[],
  setting: { vatRate: number; whtRate: number; vatApplicable: boolean }
): ComputedTotals {
  const computed: ComputedItem[] = items.map((it) => {
    const unitPriceSatang = bahtToSatang(it.unitPriceBaht);
    // qty can be fractional (kg/km later); round the line to whole satang
    const lineTotalSatang = Math.round(unitPriceSatang * it.qty);
    return { description: it.description, qty: it.qty, unitPriceSatang, lineTotalSatang };
  });

  const subtotalSatang = computed.reduce((s, it) => s + it.lineTotalSatang, 0);
  const tax = calcTax({
    subtotalSatang,
    vatRate: setting.vatRate,
    whtRate: setting.whtRate,
    vatApplicable: setting.vatApplicable,
  });

  return {
    items: computed,
    subtotalSatang,
    vatSatang: tax.vatSatang,
    whtSatang: tax.whtSatang,
    netSatang: tax.netSatang,
  };
}

/**
 * Race-safe per-company sequential number: INV-{YYYY}-{0001}.
 * Runs inside a transaction; the @@unique([companyId, number]) constraint is the
 * final guard — a loser in a race fails the unique check and the caller retries.
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient | PrismaClient,
  companyId: string,
  year = new Date().getFullYear()
): Promise<string> {
  const prefix = `INV-${year}-`;
  const latest = await tx.invoice.findFirst({
    where: { companyId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const lastSeq = latest ? parseInt(latest.number.slice(prefix.length), 10) : 0;
  const seq = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}
