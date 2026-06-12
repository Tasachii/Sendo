import { roundSatang } from "./money";

// withhold only when subtotal >= 1,000 baht (100,000 satang)
export const WHT_THRESHOLD_SATANG = 100_000;

export type TaxInput = {
  subtotalSatang: number;
  vatRate: number; // e.g. 0.07
  whtRate: number; // e.g. 0.03
  vatApplicable: boolean;
  whtThresholdSatang?: number;
};

export type TaxResult = {
  subtotalSatang: number;
  vatSatang: number;
  whtSatang: number;
  netSatang: number; // (subtotal + vat) - wht
};

export function calcTax(input: TaxInput): TaxResult {
  const {
    subtotalSatang,
    vatRate,
    whtRate,
    vatApplicable,
    whtThresholdSatang = WHT_THRESHOLD_SATANG,
  } = input;

  // VAT is added on top
  const vatSatang = vatApplicable ? roundSatang(subtotalSatang * vatRate) : 0;

  // WHT is on the pre-VAT base, and only if we hit the threshold
  const whtSatang =
    subtotalSatang >= whtThresholdSatang
      ? roundSatang(subtotalSatang * whtRate)
      : 0;

  const netSatang = subtotalSatang + vatSatang - whtSatang;

  return { subtotalSatang, vatSatang, whtSatang, netSatang };
}
