import { describe, it, expect } from "vitest";
import { calcTax } from "../lib/tax";
import { bahtToSatang } from "../lib/money";

// run from baht so the cases read like the spec table
function run(baht: number, vatRate: number, whtRate: number, vatApplicable: boolean) {
  return calcTax({ subtotalSatang: bahtToSatang(baht), vatRate, whtRate, vatApplicable });
}

// expected baht -> satang, so we compare integers (no float flakiness)
const s = (baht: number) => Math.round(baht * 100);

describe("calcTax", () => {
  it("1) transport_only: VAT exempt, WHT 1%", () => {
    const r = run(10000, 0.07, 0.01, false);
    expect(r.vatSatang).toBe(s(0));
    expect(r.whtSatang).toBe(s(100));
    expect(r.netSatang).toBe(s(9900));
  });

  it("2) transport_service: VAT 7%, WHT 3%", () => {
    const r = run(20000, 0.07, 0.03, true);
    expect(r.vatSatang).toBe(s(1400));
    expect(r.whtSatang).toBe(s(600));
    expect(r.netSatang).toBe(s(20800));
  });

  it("3) service below 1,000 threshold: no WHT", () => {
    const r = run(800, 0.07, 0.03, true);
    expect(r.vatSatang).toBe(s(56));
    expect(r.whtSatang).toBe(s(0));
    expect(r.netSatang).toBe(s(856));
  });

  it("4) rent: VAT 7%, WHT 5%", () => {
    const r = run(10000, 0.07, 0.05, true);
    expect(r.vatSatang).toBe(s(700));
    expect(r.whtSatang).toBe(s(500));
    expect(r.netSatang).toBe(s(10200));
  });

  // 333.33 is BELOW the 1,000 threshold -> WHT must be 0 (see DECISIONS.md)
  it("5) rounding below threshold: VAT rounds, WHT = 0", () => {
    const r = run(333.33, 0.07, 0.03, true);
    expect(r.vatSatang).toBe(s(23.33));
    expect(r.whtSatang).toBe(s(0));
    expect(r.netSatang).toBe(s(356.66));
  });

  // added: rounding ABOVE threshold so both VAT and WHT round
  it("6) rounding above threshold: VAT and WHT both round", () => {
    const r = run(1333.33, 0.07, 0.03, true);
    expect(r.vatSatang).toBe(s(93.33));
    expect(r.whtSatang).toBe(s(40.0));
    expect(r.netSatang).toBe(s(1386.66));
  });
});
