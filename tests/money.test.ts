import { describe, it, expect } from "vitest";
import { roundSatang, bahtToSatang, satangToBaht, formatBaht } from "../lib/money";

describe("roundSatang (half-away-from-zero)", () => {
  it("rounds positive halves up", () => {
    expect(roundSatang(0.5)).toBe(1);
    expect(roundSatang(1.5)).toBe(2);
    expect(roundSatang(2.5)).toBe(3);
  });

  it("rounds positive non-halves to nearest", () => {
    expect(roundSatang(2.4)).toBe(2);
    expect(roundSatang(2.6)).toBe(3);
    expect(roundSatang(0)).toBe(0);
  });

  it("rounds negative halves away from zero (A4 fix: symmetric)", () => {
    expect(roundSatang(-0.5)).toBe(-1);
    expect(roundSatang(-1.5)).toBe(-2);
    expect(roundSatang(-2.5)).toBe(-3);
  });

  it("rounds negative non-halves to nearest", () => {
    expect(roundSatang(-2.4)).toBe(-2);
    expect(roundSatang(-2.6)).toBe(-3);
  });

  it("is symmetric: round(-x) === -round(x) on halves", () => {
    for (const x of [0.5, 1.5, 2.5, 10.5, 3.3, 7.7]) {
      expect(roundSatang(-x)).toBe(-roundSatang(x));
    }
  });
});

describe("bahtToSatang", () => {
  it("converts whole and fractional baht to integer satang", () => {
    expect(bahtToSatang(1)).toBe(100);
    expect(bahtToSatang(20000)).toBe(2_000_000);
    expect(bahtToSatang(333.33)).toBe(33_333);
  });

  it("rounds float-imprecise products to the nearest satang", () => {
    expect(bahtToSatang(19.999)).toBe(2000);
    // 0.1 * 3 = 0.30000000000000004 in IEEE754; must still land on 30 satang
    expect(bahtToSatang(0.1 * 3)).toBe(30);
    expect(bahtToSatang(0.1 + 0.2)).toBe(30);
  });
});

describe("satangToBaht", () => {
  it("divides satang back to baht", () => {
    expect(satangToBaht(100)).toBe(1);
    expect(satangToBaht(33_333)).toBeCloseTo(333.33, 5);
  });
});

describe("formatBaht", () => {
  it("uses thousands separators and exactly 2 decimals", () => {
    expect(formatBaht(123456)).toBe("1,234.56");
    expect(formatBaht(2_000_000)).toBe("20,000.00");
    expect(formatBaht(0)).toBe("0.00");
  });

  it("formats negative amounts", () => {
    expect(formatBaht(-123456)).toBe("-1,234.56");
  });
});
