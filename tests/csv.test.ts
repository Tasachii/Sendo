import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the tenant guard + report aggregation so the route test is hermetic (no DB / session).
// vi.hoisted lets the factories reference these (vi.mock is hoisted above imports).
const { getSessionContext, monthlySummary } = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  monthlySummary: vi.fn(),
}));
vi.mock("@/lib/tenant", () => ({ getSessionContext }));
vi.mock("@/lib/reports", () => ({ monthlySummary }));

import { csvCell, GET } from "../app/api/reports/csv/route";
import type { MonthRow } from "../lib/reports";

describe("csvCell — formula-injection neutralization", () => {
  it("prefixes an apostrophe to cells starting with a dangerous lead char", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@foo")).toBe("'@foo");
    expect(csvCell("\tTAB")).toBe("'\tTAB");
    expect(csvCell("\rCR")).toBe(`"'` + "\rCR" + `"`); // leading CR triggers prefix AND quoting
  });

  it("leaves safe cells untouched", () => {
    expect(csvCell("ม.ค.")).toBe("ม.ค.");
    expect(csvCell("1234.56")).toBe("1234.56");
    expect(csvCell(42)).toBe("42");
  });
});

describe("csvCell — RFC-4180 quoting", () => {
  it("quotes cells containing a comma, quote, CR or LF and doubles internal quotes", () => {
    expect(csvCell("a,b")).toBe(`"a,b"`);
    expect(csvCell('he said "hi"')).toBe(`"he said ""hi"""`);
    expect(csvCell("line1\nline2")).toBe(`"line1\nline2"`);
  });

  it("applies BOTH neutralization and quoting when a cell is dangerous and needs quoting", () => {
    // starts with '=' (prefix) AND contains a comma (quote)
    expect(csvCell("=1,2")).toBe(`"'=1,2"`);
  });
});

function row(month: number, label: string): MonthRow {
  return { month, monthLabel: label, count: 1, subtotalSatang: 1_000_000, vatSatang: 70_000, whtSatang: 30_000, netSatang: 1_040_000 };
}

describe("CSV report route GET", () => {
  beforeEach(() => {
    getSessionContext.mockReset();
    monthlySummary.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    getSessionContext.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/reports/csv?year=2026"));
    expect(res.status).toBe(401);
  });

  it("emits a BOM, CRLF terminators, a Thai header and a totals row equal to column sums", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    monthlySummary.mockResolvedValue([row(1, "ม.ค."), row(2, "ก.พ.")]);

    const res = await GET(new Request("http://x/api/reports/csv?year=2026"));
    expect(res.status ?? 200).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");

    // UTF-8 BOM as raw bytes (TextDecoder strips it from .text(), so assert on the bytes)
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);

    const body = await res.text();
    expect(body).toContain("\r\n"); // RFC-4180 line terminator
    const lines = body.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("เดือน,จำนวนใบ,มูลค่าก่อนภาษี,VAT,หัก ณ ที่จ่าย,สุทธิ");

    const totals = lines[lines.length - 1].split(",");
    expect(totals[0]).toBe("รวม");
    expect(totals[1]).toBe("2"); // count sum
    expect(totals[2]).toBe("20000.00"); // subtotal 2 × 10,000.00 baht
    expect(totals[3]).toBe("1400.00"); // vat
    expect(totals[4]).toBe("600.00"); // wht
    expect(totals[5]).toBe("20800.00"); // net
  });
});
