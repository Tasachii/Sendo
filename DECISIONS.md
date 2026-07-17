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

---

# Remediation pass (2026-06-22) — FIXLIST decisions

Resolutions applied while executing `FIXLIST.md`. See `AUDIT_CHANGES.md` for the full per-item changelog.

## D-A8 — STAFF role policy (RESOLVED)
- **Decision:** keep `requireWriter` (blocks only VIEWER) for create / issue / duplicate / status — STAFF
  may run the day-to-day invoice workflow. **Gate `deleteInvoice` behind `requireOwner`** because a hard
  delete of a legal document is destructive and irreversible (audit + number continuity).
- Combined with D-A7 below, an invoice can only be deleted when it is **OWNER + DRAFT**. Issued documents
  (SENT/PAID/OVERDUE) can never be deleted — they must be voided (future work).
- Boundary asserted in `tests/invoices.test.ts` (VIEWER blocked everywhere; STAFF may issue/status/duplicate
  but not delete; OWNER may delete only DRAFT).

## D-A7 — deleteInvoice DRAFT-only guard (RESOLVED)
- `deleteInvoice` now rejects any non-DRAFT status with a Thai error and only deletes
  `where: { id, companyId, status: "DRAFT" }`. Prevents erasing issued tax documents.

## D-A3 — setInvoiceStatus transition whitelist (RESOLVED)
- State machine: `DRAFT→{} (issue only)`, `SENT→{PAID,OVERDUE}`, `OVERDUE→{PAID,SENT}`, `PAID→{OVERDUE}`.
- A legally-issued document can never be reverted to DRAFT. No-op same-status transitions are allowed.

## D-A9 — issueDate stamped at issue (RESOLVED)
- `issueInvoice` now sets `issueDate: new Date()` when moving DRAFT→SENT, so the legal issue moment
  (มาตรา 86/4 field 7) reflects when the document was actually issued, not when the draft was created.
- The `status: "DRAFT"` guard keeps re-issuing an already-SENT invoice a no-op (date does not change).

## D-A4 — roundSatang is now sign-aware (UPDATES D3)
- Changed `Math.floor(value + 0.5)` → `Math.sign(value) * Math.floor(Math.abs(value) + 0.5)`
  (half-**away-from-zero**). Old code was asymmetric for negatives (`-0.5→0`, `-1.5→-1`).
- All current inputs are non-negative, so live results are unchanged; this is latent-bug prevention for
  credit notes / negative adjustments (e-Tax doc types 80/81). Boundary tests in `tests/money.test.ts`.
- **Supersedes D3's "floor(x+0.5)" wording** for the rounding helper.

## D-A5 / D-A6 — taxId validation tightened (RESOLVED)
- `companyTaxId` is now `/^\d{13}$/` (was `.min(10).max(13)`, which accepted 10–12 digits and non-digits).
- `customer.taxId` stays optional (non-VAT buyers) but is format-checked to `/^\d{13}$/` when non-empty,
  so a VAT-registered buyer can't be saved with a malformed taxId. Aligns with `lib/etax.ts` `validateParty`.

## D-A13 — WHT cert rate derived from stored amounts (RESOLVED)
- `/api/invoices/[id]/wht` now computes `whtRatePct = round(whtSatang / subtotalSatang × 100)` (guarded
  against divide-by-zero) instead of reading the live `TaxSetting.whtRate`. A rate edit after issue can no
  longer change the printed rate on an already-issued legal certificate.

## D-A10 — TAX_DEFAULTS single source (RESOLVED)
- Extracted the duplicated rate table into `lib/taxDefaults.ts`; imported by `prisma/seed.ts` and
  `app/actions/auth.ts`. `tests/demo-rates.test.ts` now reads the canonical table from `lib/taxDefaults.ts`
  (it regex-scans source text, so the literals must stay inline there).

## D-A15 / D11 — dependency audit (DOCUMENTED, no force-fix)
- `npm audit` reports transitive vulns via `next` / `next-auth` / `vite`/`vitest` / `postcss` / `uuid`.
- Added `@vitest/coverage-v8@2.1.9` (matches installed `vitest` 2.1.9). Did **not** bump the top-level
  `vitest` range: a non-breaking bump within installed 2.x is already satisfied, and running
  `npm audit fix --force` would **downgrade `next`/`next-auth`** (breaking) — explicitly avoided.
- **Accepted residual risk:** the remaining advisories are framework-transitive; track upstream patched
  `next`/`next-auth`/`postcss`/`uuid` releases and bump when available rather than force-downgrading.

## D-cov — coverage thresholds calibrated day-one
- `vitest.config.ts` `coverage.include` spans `lib/** app/actions/** app/api/**` per the audit. That glob
  includes modules the new C2 suite does not yet cover (`customers/services/team/taxSettings` actions,
  `[...nextauth]` + PDF route handlers, `lib/overdue.ts`, `lib/auth.ts`), which caps line/fn/stmt %.
- Per FIXLIST C1.3 ("do not set unreachably high on day one; raise after the C2 suite lands"), thresholds
  are set to a **floor just below current**: lines 50 / functions 55 / branches 65 / statements 50.
  Current run: lines 55, functions 60.9, branches 76.2, statements 55. Raise toward 75/75/65 as the
  remaining suites (customers/services/team/PDF routes) are written.

## DEFERRED — D10 login rate-limiting (NOT DONE)
- Per-email + per-IP attempt counting / lockout in `authorize()` is **deferred**: it needs an infra
  decision (where to store attempt counts — DB table vs. Redis vs. in-memory) that is out of scope for
  this pass. Documented here so it isn't lost. Mitigates credential stuffing / brute force.

## D-SE2 — rate freezing on issued documents (VERIFIED — already correct)
- Confirmed the Jul 11 hardening already freezes rates by design: an issued `Invoice` row stores the
  computed `subtotalSatang / vatSatang / whtSatang / netSatang`; no render path re-reads `TaxSetting`.
  `InvoicePDF` prints VAT/WHT as frozen baht (no % re-derivation), the detail page shows frozen amounts,
  and the WHT cert derives its rate from the stored amounts (D-A13). Editing a live rate after issue
  cannot alter any already-issued document. No schema `vatRatePct/whtRatePct` column is needed — the
  frozen satang amounts are the equivalent, and the recoverable rate is `whtSatang/subtotalSatang`.

## D-SE4a — Thai tax-ID check digit enforced on input (RESOLVED)
- `isValidThaiTaxId` (`lib/validation.ts`) adds the mod-11 check-digit test (weights 13→2) on top of the
  A6 `/^\d{13}$/` format check, and now backs `registerSchema` / `companyProfileSchema` / `customerSchema`.
  A single mistyped digit is rejected at input (poka-yoke). Fixture tax IDs that were not checksum-valid
  were corrected in `tests/actions.test.ts`, `tests/company.test.ts`, `tests/register.test.ts`, `prisma/seed.ts`.

## D-SE4b — amount in Thai words = tax-inclusive total (RESOLVED)
- `lib/bahtText.ts` renders จำนวนเงินเป็นตัวอักษร from integer satang (exact สตางค์). `InvoicePDF` prints it
  for `subtotalSatang + vatSatang` — the "รวมเป็นเงิน" (มูลค่าสินค้า + VAT) figure, the canonical grand total
  on a Thai tax invoice. WHT is a separate settlement and does NOT reduce the words figure (verified: an
  invoice with WHT shows the pre-WHT total in words, not the net paid).

## D-SE4c — ต้นฉบับ/สำเนา marking (RESOLVED)
- `InvoicePDF` was hardcoded to "(ต้นฉบับ / Original)". Added a `copy` flag; the PDF route reads `?copy=1`
  (or `copy=true`) and prints "(สำเนา / Copy)" so a document set can issue both the original and copies.

## NOTED — WHT cert (50 ทวิ) ฉบับที่ 1/2 + amount-in-words (NOT DONE, out of SE4 scope)
- `WhtCertPDF` has no ฉบับที่ 1/ฉบับที่ 2 edition marking and no amount-in-words for the withheld total.
  Left untouched: the SE4 items named the ใบกำกับภาษี. Documented so it isn't lost.
