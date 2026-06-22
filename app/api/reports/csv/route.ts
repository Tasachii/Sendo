import { getSessionContext } from "@/lib/tenant";
import { monthlySummary } from "@/lib/reports";
import { satangToBaht } from "@/lib/money";

/**
 * Make a single CSV cell safe:
 *  - neutralize spreadsheet formula/DDE injection: a cell that starts with
 *    = + - @ TAB or CR is prefixed with a leading apostrophe so Excel/Sheets
 *    treats it as text, not a formula.
 *  - RFC-4180 quoting: a cell containing a comma, quote, CR or LF is wrapped in
 *    double quotes with any internal quote doubled.
 */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const csvRow = (cells: (string | number)[]) => cells.map(csvCell).join(",");

export async function GET(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getFullYear();
  const rows = await monthlySummary(ctx.companyId, year);

  const b = (s: number) => satangToBaht(s).toFixed(2);
  const header = ["เดือน", "จำนวนใบ", "มูลค่าก่อนภาษี", "VAT", "หัก ณ ที่จ่าย", "สุทธิ"];
  const lines = rows.map((r) =>
    csvRow([r.monthLabel, r.count, b(r.subtotalSatang), b(r.vatSatang), b(r.whtSatang), b(r.netSatang)])
  );
  const total = rows.reduce(
    (a, r) => ({ c: a.c + r.count, s: a.s + r.subtotalSatang, v: a.v + r.vatSatang, w: a.w + r.whtSatang, n: a.n + r.netSatang }),
    { c: 0, s: 0, v: 0, w: 0, n: 0 }
  );
  lines.push(csvRow(["รวม", total.c, b(total.s), b(total.v), b(total.w), b(total.n)]));

  // BOM so Excel opens Thai UTF-8 correctly
  const csv = "﻿" + [csvRow(header), ...lines].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sendo-tax-${year}.csv"`,
    },
  });
}
