import { describe, expect, it } from "vitest";
import { legalDate, legalYear, legalYearMonth, legalYearRange } from "../lib/legalDate";

describe("Asia/Bangkok legal-date policy", () => {
  const boundary = new Date("2026-07-31T18:30:00.000Z");

  it("formats legal dates independently from the server timezone", () => {
    expect(legalDate(boundary)).toBe("2026-08-01");
    expect(legalYearMonth(boundary)).toEqual({ year: 2026, month: 8 });
    expect(legalYear(boundary)).toBe(2026);
  });

  it("returns UTC instants for Bangkok calendar-year boundaries", () => {
    expect(legalYearRange(2026)).toEqual({
      start: new Date("2025-12-31T17:00:00.000Z"),
      end: new Date("2026-12-31T17:00:00.000Z"),
    });
  });
});
