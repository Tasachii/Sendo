import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WHT_THRESHOLD_SATANG } from "../lib/tax";

// The public demo (demo/index.html) is a static, client-only build that re-implements the
// tax engine in vanilla JS so it can run on GitHub Pages. That copy can silently drift from
// the real engine. This test fails the moment the demo's rate table or WHT threshold stops
// matching the canonical sources (lib/taxDefaults.ts + lib/tax.ts) — see CLAUDE.md "Phase status".

const read = (p: string) => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");

type Rate = { vatRate: number; whtRate: number; vatApplicable: boolean };

// pull jobType -> rates out of either source (field order is vatRate, whtRate, vatApplicable in both)
function rateTable(src: string): Record<string, Rate> {
  const re = /jobType:\s*"([^"]+)"[^}]*?vatRate:\s*([\d.]+)[^}]*?whtRate:\s*([\d.]+)[^}]*?vatApplicable:\s*(true|false)/g;
  const out: Record<string, Rate> = {};
  for (const m of src.matchAll(re)) {
    out[m[1]] = { vatRate: Number(m[2]), whtRate: Number(m[3]), vatApplicable: m[4] === "true" };
  }
  return out;
}

describe("demo stays in sync with the real tax config", () => {
  // canonical rate table now lives in lib/taxDefaults.ts (imported by seed + registration)
  const seed = rateTable(read("lib/taxDefaults.ts"));
  const demo = rateTable(read("demo/index.html"));

  it("extracts a non-trivial rate table from both sources", () => {
    expect(Object.keys(seed).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(demo).length).toBe(Object.keys(seed).length);
  });

  it("demo job-type rates equal the canonical TaxSetting rates", () => {
    expect(demo).toEqual(seed);
  });

  it("demo WHT threshold equals lib/tax WHT_THRESHOLD_SATANG", () => {
    const html = read("demo/index.html");
    const m = html.match(/WHT_THRESHOLD_SATANG\s*=\s*([\d_]+)/);
    expect(m, "WHT_THRESHOLD_SATANG not found in demo").not.toBeNull();
    expect(Number(m![1].replace(/_/g, ""))).toBe(WHT_THRESHOLD_SATANG);
  });
});
