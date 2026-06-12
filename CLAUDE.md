# Sendo — Claude guide

> Logistics invoicing web app for Thailand. Multi-tenant. Issues Thai tax invoices
> (ใบกำกับภาษี) + withholding-tax certificates (ใบหัก ณ ที่จ่าย / 50 ทวิ).
> Read `CONCEPT.md` (brand/identity) and `DECISIONS.md` (assumption log) alongside this file.

@AGENTS.md

## Prime directive: poka-yoke (ポカヨケ)

Make mistakes impossible by design, not caught afterward.
- If the system can calculate it → the user must **not** be able to type it (VAT/WHT/Net are read-only, grey).
- If it must be chosen → it's a **dropdown**, never free text (job type drives the rates).
- A document **cannot be issued** unless it is legally valid (มาตรา 86/4 — 8 mandatory fields).

## Two rules you must never break

1. **Tenant isolation.** Every business-data query MUST filter by the signed-in user's
   `companyId`. Never trust a `companyId` from the client. Use `requireSession()` /
   `requireWriter()` from `lib/tenant.ts` at the top of every server action / route handler.
2. **Money is server-truth.** All amounts are integer **satang** (baht × 100). Totals,
   VAT, WHT, and Net are **recomputed on the server** via `lib/tax.ts` on every save —
   never trust client-sent totals. Convert to baht only for display (`lib/money.ts`).

## Tax engine (the heart — `lib/tax.ts`, fully unit-tested)

- `vat = subtotal × vatRate` — **added on top** (standard 7%).
- `wht = subtotal × whtRate` — **subtracted**, always on the **pre-VAT** base.
- `net = (subtotal + vat) − wht`.
- WHT threshold: no WHT when `subtotal < WHT_THRESHOLD_SATANG` (100,000 satang = 1,000 baht).
- Rounding: round-half-up to the satang, on VAT and WHT only (Net is exact integer math).
- Rates live in the `TaxSetting` table (per company, editable in UI) — **never hardcode them in logic.**
- Tests in `tests/tax.test.ts` are the contract. If a test fails, fix the engine — never edit a
  test to match wrong output. (Note: spec Test 5 was corrected for the threshold — see DECISIONS.md D1.)

## Stack

Next.js 16 (App Router) · TypeScript · Prisma + SQLite · NextAuth (Credentials + bcryptjs) ·
Tailwind v4 · Zod (shared API/form validation) · @react-pdf/renderer (PDFs) · Vitest.

> ⚠️ This is **Next.js 16** (see AGENTS.md). Conventions may differ from older versions —
> check `node_modules/next/dist/docs/` before writing routing / server-action / config code.

## Layout

```
app/            routes (auth, dashboard, invoices, customers, settings)
lib/tax.ts      pure tax engine (tested)        lib/money.ts   baht<->satang + formatting
lib/db.ts       Prisma singleton                lib/tenant.ts  companyId guard + role checks
lib/auth.ts     NextAuth config
components/      forms, tables, PDF templates
prisma/         schema.prisma, seed.ts, migrations
tests/          tax.test.ts (+ tenant isolation)
```

## Commands

```bash
npm run dev          # start app (http://localhost:3000)
npm run test         # vitest (tax engine must stay green)
npm run db:migrate   # prisma migrate dev
npm run seed         # demo data
```

Demo login: `demo@sendo.test` / `demo1234`. Second tenant: `other@sendo.test` / `demo1234`.

## UI conventions

- **Thai for all visible text** (labels, buttons, document content). English for code identifiers
  and DB models — do **not** rename models to fit the brand (CONCEPT.md §6).
- Calculated fields render read-only with a grey background. "Net payable" shown large.
- Prefer `<select>` over typed input. Destructive actions need confirmation. VIEWER role is read-only.
- Brand "Sendo" never appears inside legal tax-document content — the seller is the `Company` record.

## Phase status

- **Phase 1 (MVP, in progress):** auth + tenant guard, Customer/Service CRUD, create-invoice with
  live totals, poka-yoke issue validation, invoice + WHT-cert PDFs, invoice list.
- **Phase 2:** weight/distance pricing, copy invoice, trackingNo, dashboard, status workflow.
- **Phase 3 (stub only):** ภ.ง.ด.3/53 + ภ.พ.30 export, **e-Tax Invoice** (reference: ETDA
  `e-TaxInvoice-PDFgen` — PDF/A-3 + embedded XML per ขมธอ.3-2560 v2.0 + digital signature; hard,
  leave an interface + TODO), carrier API hooks.

## Conventions to match (from the team's `pocketo` repo)

Integer-satang money, derive-don't-store totals, Vitest on pure logic, lean deps / hand-rolled
UI over heavy kits, strong markdown docs. Keep PDFs on a Thai font (THSarabun) for e-Tax alignment.

## Git

Commits are authored by **Tasachii** only — never add a Claude/AI co-author trailer.
