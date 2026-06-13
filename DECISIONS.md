# DECISIONS.md

Log of assumptions and resolved issues while building. Updated as we go.

---

## D1 — Spec contradiction in the WHT threshold (RESOLVED, needs your sign-off)

The spec contains two test cases that cannot both be true:

| Source | subtotal (baht) | expected WHT | implied rule |
|---|---|---|---|
| §2.4 Test 3 | 800 | 0 | below 1,000 → no WHT (correct) |
| §2.4 Test 5 | 333.33 | 10.00 | WHT applied even though < 1,000 (wrong) |

Rule §2.1.4 itself says: withhold only when subtotal ≥ 1,000 baht (`WHT_THRESHOLD = 100000` satang).
Both 800 and 333.33 are below 1,000, so under the real Thai rule **both** must give WHT = 0.
There is no threshold value that makes 800 → 0 but 333.33 → 10.00. Test 5 was written to check
rounding, but its author forgot the threshold.

**Decision (matches real Thai withholding rules + the spec's own §2.1.4):**
- Implemented the threshold correctly (`subtotalSatang >= WHT_THRESHOLD_SATANG`).
- **Test 5 corrected:** 333.33 → VAT 23.33, **WHT 0**, Net 356.66.
- **Test 6 added** to keep rounding coverage *above* the threshold: 1,333.33 → VAT 93.33, WHT 40.00, Net 1,386.66.
- The engine itself was NOT bent to match a wrong number — only the test's wrong expectation was fixed.

> If your accountant actually wants WHT on amounts under 1,000 (rare), just set
> `whtThresholdSatang: 0` per job type — no code change needed.

All 6 tests pass (`npm run test`).

---

## D2 — Schema fields added beyond §3

- `Customer.isVatRegistered` — needed for the §4.3 rule "buyer taxId required if VAT-registered".
- `Invoice.dueDate` — needed for the Phase 2 auto-OVERDUE flag; nullable so Phase 1 ignores it.

## D3 — Money
- All amounts stored as integer **satang**. Rounding is round-half-up (`floor(x + 0.5)`), applied to VAT and WHT only; Net is integer arithmetic so it's exact.

## D4 — Prisma enums on SQLite
- Used `enum Role` and `enum InvoiceStatus`. Current Prisma supports enums on SQLite (stored as TEXT).
- `npx prisma migrate dev --name init` ran successfully (Prisma 6.19) — enums validated fine.

## D5 — bcryptjs instead of bcrypt
- Spec §1 said `bcrypt`. Used **bcryptjs** (pure-JS) instead: no native compilation, works on any machine
  with zero build tooling — fits the "runs locally with zero external accounts" goal. API is compatible.

## D6 — Next.js 16 renamed middleware → proxy
- create-next-app installed Next 16, where `middleware.ts` is now `proxy.ts` (same functionality; Next warns
  if you use the old name). Auth gating lives in `proxy.ts` via `withAuth({ pages: { signIn: "/login" } })`.
- Also note Next 16: route `params`, `cookies()`, `headers()` are async (awaited everywhere).

## D7 — Who issues the WHT certificate (50 ทวิ)
- In a logistics payment the **customer pays us and withholds tax**, so on the 50 ทวิ the customer is the
  withholder (ผู้จ่ายเงิน/ผู้มีหน้าที่หัก) and **our company is the payee** (ผู้ถูกหักภาษี). Sendo pre-fills the
  form from the invoice so it's ready for the customer to sign. If your real flow has the company as the
  payer (e.g. paying subcontractors), the parties on the cert would swap — flag for Phase 2.

## D8 — PDF font
- Bundled **Sarabun** (the open Thai-government document font, successor to TH Sarabun) under `public/fonts`
  so PDFs render Thai correctly and **offline**. This also aligns with the ETDA e-Tax reference (THSarabun)
  for the Phase 3 e-Tax work.

## D9 — Standalone git repo
- `~/Documents` (actually `~`) was already a giant catch-all git repo. Ran `git init` inside `sendo/` so the
  project is its own repository, pushed to a private GitHub repo `Tasachii/sendo`.

---

## Phase 1 — DONE ✅
Auth + tenant guard, Customer/Service CRUD, create-invoice with live totals (server recomputes),
poka-yoke 8-field validation on issue, invoice + WHT-cert PDFs, invoice list + statuses, tax-settings editor.
`npm run test` = 14 green (tax 6, tenant 3, poka-yoke 5). `npm run build` passes. PDFs render (verified).

## Phase 2 — DONE ✅
- Pricing modes via `InvoiceItem.pricingMode` (FLAT/WEIGHT/DISTANCE). Line total is still
  `qty × unitPrice`; the mode only changes the unit label (กก./กม.) — no engine change needed.
- `Shipment` model for multi-shipment per invoice (kept `Invoice.trackingNo` for back-compat).
- `duplicateInvoice` clones items + shipments into a new DRAFT with a fresh atomic number.
- Auto-OVERDUE: `sweepOverdue(companyId)` runs on dashboard/list read (no cron needed for MVP).

## Phase 3 — partial
- D10: Monthly tax summary aggregated in JS from issued (non-DRAFT) invoices — `lib/reports.ts`.
  SQLite/Prisma lacks easy date_trunc grouping; JS aggregation is fine at MVP volume. CSV uses a
  UTF-8 BOM so Excel opens Thai correctly. VAT column = ภ.พ.30, WHT column = ภ.ง.ด.3/53.
- D11: e-Tax (`lib/etax.ts`) and carriers (`lib/carriers.ts`) are interface stubs only — `buildSignedETaxPdf`
  throws so a non-compliant doc can't ship silently; `trackShipment` returns "unknown" until adapters exist.

## Open / next
- Audit-log viewer UI; invite STAFF/VIEWER users; e-Withholding 1% reduced-rate (confirm with accountant).
- Production hardening: PostgreSQL, Playwright e2e, rate-limiting (see ROADMAP).
