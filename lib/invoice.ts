import type { Prisma } from "@prisma/client";
import { calcTax } from "@/lib/tax";
import { bahtToSatang } from "@/lib/money";

export type DraftItem = { description: string; qty: number; unitPriceBaht: number; pricingMode?: string };

export type ComputedItem = {
  description: string;
  pricingMode: string;
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
    // qty can be fractional (kg/km); round the line to whole satang
    const lineTotalSatang = Math.round(unitPriceSatang * it.qty);
    return { description: it.description, pricingMode: it.pricingMode ?? "FLAT", qty: it.qty, unitPriceSatang, lineTotalSatang };
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
 * Race-safe, gap-stable per-company sequential number: INV-{YYYY}-{0001}.
 * Uses an atomic upsert+increment on InvoiceCounter inside the caller's transaction,
 * so concurrent issues can't collide and deleting an invoice never re-issues a number.
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  year = new Date().getFullYear()
): Promise<string> {
  const counter = await tx.invoiceCounter.upsert({
    where: { companyId_year: { companyId, year } },
    create: { companyId, year, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });
  return `INV-${year}-${String(counter.lastSeq).padStart(4, "0")}`;
}
