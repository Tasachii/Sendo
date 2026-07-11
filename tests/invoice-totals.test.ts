import { describe, it, expect } from "vitest";
import { computeTotals } from "../lib/invoice";
import { calcTax } from "../lib/tax";
import { ALL_DOC_TYPES, effectiveTaxSetting } from "../lib/docTypes";

// transport_service: VAT 7%, WHT 3% (applied only above the 1,000-baht / 100,000-satang threshold)
const SETTING = { vatRate: 0.07, whtRate: 0.03, vatApplicable: true };

describe("effectiveTaxSetting — document tax matrix", () => {
  it.each(ALL_DOC_TYPES)("uses the explicit policy for $type", (meta) => {
    const effective = effectiveTaxSetting(meta.type, SETTING);
    expect(effective.vatApplicable).toBe(meta.isTaxDoc);
    expect(effective.whtRate).toBe(meta.showWht ? SETTING.whtRate : 0);
    const tax = calcTax({ subtotalSatang: 100_000, ...effective });
    expect(tax.vatSatang).toBe(meta.isTaxDoc ? 7_000 : 0);
    expect(tax.whtSatang).toBe(meta.showWht ? 3_000 : 0);
  });
});

describe("computeTotals — multi-line subtotal rounding", () => {
  it("subtotal is the SUM of per-line rounded amounts (each line = round(unitPriceSatang × qty))", () => {
    const totals = computeTotals(
      [
        { description: "WEIGHT 12.5/kg × 3.3kg", qty: 3.3, unitPriceBaht: 12.5, pricingMode: "WEIGHT" },
        { description: "DISTANCE 7.77/km × 10.5km", qty: 10.5, unitPriceBaht: 7.77, pricingMode: "DISTANCE" },
        { description: "0.333 × 3", qty: 3, unitPriceBaht: 0.333 },
      ],
      SETTING
    );
    // per-line: 1250×3.3=4125 ; 777×10.5=8159 (8158.5 rounds up) ; 33×3=99
    expect(totals.items.map((i) => i.lineTotalSatang)).toEqual([4125, 8159, 99]);
    expect(totals.subtotalSatang).toBe(4125 + 8159 + 99); // 12,383
  });

  it("rounds each fractional line half-up at the line level (DISTANCE 8158.5 -> 8159)", () => {
    const totals = computeTotals([{ description: "d", qty: 10.5, unitPriceBaht: 7.77, pricingMode: "DISTANCE" }], SETTING);
    expect(totals.items[0].unitPriceSatang).toBe(777);
    expect(totals.items[0].lineTotalSatang).toBe(8159);
  });

  it("is float-safe: 1.005 baht stores as 100 satang (IEEE754 100.49999… not 100.5)", () => {
    const totals = computeTotals([{ description: "fp", qty: 1, unitPriceBaht: 1.005 }], SETTING);
    expect(totals.items[0].unitPriceSatang).toBe(100);
    expect(totals.subtotalSatang).toBe(100);
  });

  it("sum-of-rounded can differ from round-of-summed products (documents the per-line rounding choice)", () => {
    // two lines of 0.01 baht (1 satang) × 2.5 → each rounds 2.5 -> 3, summing to 6,
    // whereas rounding the summed products (1×2.5 + 1×2.5 = 5) would give 5.
    const totals = computeTotals(
      [
        { description: "a", qty: 2.5, unitPriceBaht: 0.01 },
        { description: "b", qty: 2.5, unitPriceBaht: 0.01 },
      ],
      SETTING
    );
    expect(totals.items.map((i) => i.lineTotalSatang)).toEqual([3, 3]);
    expect(totals.subtotalSatang).toBe(6);
    expect(totals.subtotalSatang).not.toBe(Math.round(1 * 2.5 + 1 * 2.5)); // 5
  });

  it("computes VAT/WHT off the summed subtotal, matching calcTax", () => {
    // High-value multi-line subtotal that crosses the WHT threshold.
    const totals = computeTotals(
      [
        { description: "L1", qty: 2, unitPriceBaht: 333.33 }, // 33,333 × 2 = 66,666
        { description: "L2", qty: 1, unitPriceBaht: 500 }, //    50,000
        { description: "L3", qty: 3.3, unitPriceBaht: 12.5 }, // 1,250 × 3.3 = 4,125
      ],
      SETTING
    );
    expect(totals.subtotalSatang).toBe(120_791);

    const tax = calcTax({ subtotalSatang: totals.subtotalSatang, ...SETTING });
    expect(totals.vatSatang).toBe(tax.vatSatang);
    expect(totals.whtSatang).toBe(tax.whtSatang);
    expect(totals.netSatang).toBe(tax.netSatang);

    // concrete satang values
    expect(totals.vatSatang).toBe(8_455);
    expect(totals.whtSatang).toBe(3_624);
    expect(totals.netSatang).toBe(125_622);
  });

  it("applies no WHT when the summed subtotal is below the 100,000-satang threshold", () => {
    const totals = computeTotals([{ description: "small", qty: 1, unitPriceBaht: 500 }], SETTING);
    expect(totals.subtotalSatang).toBe(50_000);
    expect(totals.whtSatang).toBe(0);
    expect(totals.vatSatang).toBe(3_500);
    expect(totals.netSatang).toBe(53_500);
  });
});

describe("computeTotals — discounts (Biz108 parity)", () => {
  it("subtracts a per-line baht discount from the line gross", () => {
    // 1,000 baht line, 100 baht off → 900 baht net; 90,000 < threshold so no WHT
    const t = computeTotals([{ description: "x", qty: 1, unitPriceBaht: 1000, discountBaht: 100 }], SETTING);
    expect(t.items[0].discountSatang).toBe(10_000);
    expect(t.items[0].lineTotalSatang).toBe(90_000);
    expect(t.subtotalSatang).toBe(90_000);
    expect(t.vatSatang).toBe(6_300);
    expect(t.whtSatang).toBe(0);
    expect(t.netSatang).toBe(96_300);
  });

  it("computes a per-line percentage discount off the line gross", () => {
    const t = computeTotals([{ description: "x", qty: 1, unitPriceBaht: 1000, discountPct: 10 }], SETTING);
    expect(t.items[0].discountSatang).toBe(10_000); // 10% of 100,000
    expect(t.subtotalSatang).toBe(90_000);
  });

  it("prefers percentage over a flat baht amount when both are supplied", () => {
    const t = computeTotals([{ description: "x", qty: 1, unitPriceBaht: 1000, discountPct: 10, discountBaht: 999 }], SETTING);
    expect(t.items[0].discountSatang).toBe(10_000); // pct wins, not 99,900
  });

  it("applies a whole-document discount to the taxable base before VAT/WHT", () => {
    // one 2,000-baht line, 500 baht off the bill → 1,500 base, crosses WHT threshold
    const t = computeTotals([{ description: "x", qty: 1, unitPriceBaht: 2000 }], SETTING, { docDiscountBaht: 500 });
    expect(t.docDiscountSatang).toBe(50_000);
    expect(t.subtotalSatang).toBe(150_000);
    expect(t.vatSatang).toBe(10_500); // 7% of 150,000
    expect(t.whtSatang).toBe(4_500); // 3% of 150,000
    expect(t.netSatang).toBe(156_000);
  });

  it("clamps a discount larger than the line/bill to zero (never negative)", () => {
    const t = computeTotals([{ description: "x", qty: 1, unitPriceBaht: 100, discountBaht: 9999 }], SETTING);
    expect(t.items[0].discountSatang).toBe(10_000); // clamped to the 10,000-satang gross
    expect(t.items[0].lineTotalSatang).toBe(0);
    expect(t.subtotalSatang).toBe(0);
    expect(t.netSatang).toBe(0);
  });

  it("no discount inputs ⇒ identical to the pre-discount behaviour", () => {
    const t = computeTotals([{ description: "x", qty: 2, unitPriceBaht: 333.33 }], SETTING);
    expect(t.items[0].discountSatang).toBe(0);
    expect(t.docDiscountSatang).toBe(0);
    expect(t.subtotalSatang).toBe(66_666);
  });
});
