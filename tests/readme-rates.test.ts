import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TAX_DEFAULTS } from "../lib/taxDefaults";

// The README's "Tax engine defaults" table is human-facing tax guidance, so it must
// never drift from the rates the app actually seeds (lib/taxDefaults.ts). This is the
// same spirit as tests/demo-rates.test.ts, which locks the public demo to that file.
// If the README and the code disagree (e.g. transport shown as 7% VAT when it is
// VAT-exempt), this test fails.

const read = (p: string) => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");

type Rate = { vatRate: number; whtRate: number; vatApplicable: boolean };

function parsePct(cell: string): number {
  const m = cell.match(/([\d.]+)\s*%/);
  return m ? Number(m[1]) / 100 : 0;
}

/** Parse the backtick-keyed rows of the "Tax engine defaults" table out of the README. */
function readmeRateTable(md: string): Record<string, Rate> {
  const start = md.indexOf("### Tax engine defaults");
  const rest = start >= 0 ? md.slice(start) : md;
  const nextH2 = rest.indexOf("\n## ", 3);
  const section = nextH2 >= 0 ? rest.slice(0, nextH2) : rest;

  const out: Record<string, Rate> = {};
  // | `jobType` | label | VAT | WHT |
  const rowRe = /^\|\s*`([a-z_]+)`\s*\|[^|]*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm;
  for (const m of section.matchAll(rowRe)) {
    const vatCell = m[2];
    const vatApplicable = !/ยกเว้น|exempt/i.test(vatCell);
    out[m[1]] = {
      vatRate: vatApplicable ? parsePct(vatCell) : 0,
      whtRate: parsePct(m[3]),
      vatApplicable,
    };
  }
  return out;
}

function canonicalTable(): Record<string, Rate> {
  const out: Record<string, Rate> = {};
  for (const d of TAX_DEFAULTS) {
    out[d.jobType] = { vatRate: d.vatRate, whtRate: d.whtRate, vatApplicable: d.vatApplicable };
  }
  return out;
}

describe("README tax-defaults table stays in sync with lib/taxDefaults.ts", () => {
  const readme = readmeRateTable(read("README.md"));
  const seed = canonicalTable();

  it("lists exactly the seeded job types (no missing / stray keys)", () => {
    expect(Object.keys(readme).sort()).toEqual(Object.keys(seed).sort());
  });

  it("README VAT/WHT/exempt values equal the canonical TaxSetting defaults", () => {
    expect(readme).toEqual(seed);
  });
});
