import type { Prisma, DocType } from "@prisma/client";
import { calcTax } from "@/lib/tax";
import { bahtToSatang, roundSatang } from "@/lib/money";
import { docMeta } from "@/lib/docTypes";

export type DraftItem = {
  description: string;
  qty: number;
  unitPriceBaht: number;
  pricingMode?: string;
  // Per-line discount. Percentage takes precedence over a flat baht amount when both
  // are supplied. Resolved to absolute satang and clamped to [0, lineGross] on the server.
  discountBaht?: number;
  discountPct?: number;
};

export type ComputedItem = {
  description: string;
  pricingMode: string;
  qty: number;
  unitPriceSatang: number;
  discountSatang: number;
  lineTotalSatang: number;
};

export type ComputedTotals = {
  items: ComputedItem[];
  docDiscountSatang: number;
  subtotalSatang: number; // taxable base AFTER all discounts
  vatSatang: number;
  whtSatang: number;
  netSatang: number;
};

export type DocDiscountInput = { docDiscountBaht?: number; docDiscountPct?: number };

/** Resolve a percentage- or amount-based discount to satang, clamped to [0, baseSatang]. */
function resolveDiscountSatang(
  baseSatang: number,
  opts: { pct?: number; baht?: number }
): number {
  let d = 0;
  if (opts.pct != null && opts.pct > 0) d = roundSatang(baseSatang * (opts.pct / 100));
  else if (opts.baht != null && opts.baht > 0) d = bahtToSatang(opts.baht);
  return Math.max(0, Math.min(d, baseSatang));
}

/**
 * Authoritative money math — runs on the SERVER from the company's own TaxSetting.
 * Client previews are cosmetic; this is the source of truth (build spec §3).
 *
 * Discount ordering (Biz108 parity): per-line discount first, then a whole-document
 * discount, then VAT/WHT compute off the post-discount subtotal via the (untouched)
 * tax engine. All integer satang; nothing trusts a client-sent total.
 */
export function computeTotals(
  items: DraftItem[],
  setting: { vatRate: number; whtRate: number; vatApplicable: boolean },
  docDiscount: DocDiscountInput = {}
): ComputedTotals {
  const computed: ComputedItem[] = items.map((it) => {
    const unitPriceSatang = bahtToSatang(it.unitPriceBaht);
    // qty can be fractional (kg/km); round the gross line to whole satang
    const grossSatang = Math.round(unitPriceSatang * it.qty);
    const discountSatang = resolveDiscountSatang(grossSatang, { pct: it.discountPct, baht: it.discountBaht });
    const lineTotalSatang = grossSatang - discountSatang;
    return { description: it.description, pricingMode: it.pricingMode ?? "FLAT", qty: it.qty, unitPriceSatang, discountSatang, lineTotalSatang };
  });

  const lineSum = computed.reduce((s, it) => s + it.lineTotalSatang, 0);
  const docDiscountSatang = resolveDiscountSatang(lineSum, {
    pct: docDiscount.docDiscountPct,
    baht: docDiscount.docDiscountBaht,
  });
  const subtotalSatang = lineSum - docDiscountSatang;

  const tax = calcTax({
    subtotalSatang,
    vatRate: setting.vatRate,
    whtRate: setting.whtRate,
    vatApplicable: setting.vatApplicable,
  });

  return {
    items: computed,
    docDiscountSatang,
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
 * This is the TAX_INVOICE (INV-) series; kept intact for numbering continuity.
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

/**
 * Per-type document number. TAX_INVOICE delegates to the legacy InvoiceCounter (INV-);
 * every other type uses its own race-safe DocumentCounter series (QUO-/REC-/CN-/…).
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  docType: DocType,
  year = new Date().getFullYear()
): Promise<string> {
  if (docType === "TAX_INVOICE") return nextInvoiceNumber(tx, companyId, year);
  const series = docMeta(docType).series;
  const counter = await tx.documentCounter.upsert({
    where: { companyId_series_year: { companyId, series, year } },
    create: { companyId, series, year, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });
  return `${series}-${year}-${String(counter.lastSeq).padStart(4, "0")}`;
}
