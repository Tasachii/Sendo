# ROADMAP — Sendo

Where Sendo is and where it goes next. Phase 1 (MVP) is complete and verified; this file
tracks Phase 2/3 plus the production-hardening items raised in the CEO/CTO/CFO review.

---

## Done — Phase 1 (MVP) ✅

- Auth (NextAuth credentials, bcryptjs) + multi-tenant isolation, with a test proving a
  second company cannot read the first's data.
- Customer / Service / TaxSetting CRUD, all scoped by `companyId`.
- Create-invoice screen with live VAT/WHT/Net (server recomputes authoritatively).
- Poka-yoke มาตรา 86/4 gate before issuing, with a Thai list of missing fields.
- Tax-invoice + 50 ทวิ PDFs (`@react-pdf`, bundled Sarabun font).
- Invoice list + status workflow; invoice detail with issue/paid/delete.
- **Atomic invoice numbering** via `InvoiceCounter` (race-safe, gap-stable).
- **Audit log** on issue/status/delete.
- 18 Vitest tests green (tax · tenant · poka-yoke · invoice flow); production build passes.

---

## Review fixes — closing the docked points

| # | Review finding | Status | Plan |
| --- | --- | --- | --- |
| 1 | Invoice number used `max+1` — year-rollover / delete gaps | ✅ done | Atomic `InvoiceCounter(companyId, year, lastSeq)` upsert+increment in a transaction. |
| 2 | No audit trail for multi-user use | ✅ done | Append-only `AuditLog`; extend to customer/service edits next. |
| 3 | No integration test for the invoice flow | ✅ done | `tests/invoice-flow.test.ts` — numbering, totals, poka-yoke, concurrent-collision. |
| 4 | WHT rates / 50 ทวิ party direction need accountant sign-off | ⏳ open | Banner in **ตั้งค่าภาษี** already warns; add a per-company "rates confirmed by" field + date. |
| 5 | SQLite single-file — concurrency / backup | ⏳ planned | Move to PostgreSQL for multi-writer; provider swap in `schema.prisma` + `DATABASE_URL`. |
| 6 | No end-to-end test | ⏳ planned | Playwright: login → create → issue → download PDF, headless in CI. |
| 7 | No rate-limiting on auth / actions | ⏳ planned | IP+account throttle on the credentials route and write actions. |
| 8 | No e-Tax Invoice | ⏳ Phase 3 | ETDA reference (PDF/A-3 + embedded XML + digital signature) — large; interface + TODO first. |

---

## Phase 2 — reduce the logistics workload — DONE ✅

- [x] **Pricing modes per line item** — FLAT / WEIGHT (per kg) / DISTANCE (per km) on
      `InvoiceItem.pricingMode`; `computeTotals` stays the source of truth.
- [x] **Copy invoice** — `duplicateInvoice` clones items + shipments into a new DRAFT.
- [x] **Multi-shipment** — `Shipment` model; repeatable tracking rows on the invoice form.
- [x] **Dashboard** — month total · unpaid · overdue · recent invoices; mobile-first.
- [x] **Status automation** — `sweepOverdue` flags OVERDUE past `dueDate` on read.
- [x] **Audit log viewer** — read-only `/audit` timeline of invoice actions (data already captured).
- [x] **Roles polish** — OWNER invites STAFF/VIEWER members at `/team`, changes roles, removes
      members (guards: keep ≥1 owner, can't delete a user who issued invoices).

---

## Phase 3 — pro / compliance

- [x] **Monthly tax summary export** — ภ.ง.ด.3/53 + ภ.พ.30 monthly totals (`lib/reports.ts`,
      `/reports`) with CSV download (`/api/reports/csv`, UTF-8 BOM for Excel Thai). Now scoped to
      `countsForVatReport` document types (TAX_INVOICE) so quotations never inflate the VAT report.
- [x] **e-Tax Invoice** — `lib/etax-map.ts` maps a document → ขมธอ.3-2560 model; `/api/invoices/[id]/etax`
      returns the validated XML, or a PAdES-signed PDF/A-3 when a certificate is configured
      (`ETAX_PFX_BASE64` / `ETAX_PFX_PASSPHRASE`) via the `lib/etax-signer.ts` deps (`pdf-lib` + `@signpdf`).
      Validate against ETDA's official XSD with the company's real certificate before live filing.
- [ ] **Carrier API hooks** — `CarrierAdapter` interface in `lib/carriers.ts`; no live adapters yet.

---

## Phase 4 — full document suite (beat Biz108) — DONE ✅

One unified document engine (the `Invoice` table discriminated by `docType`; `lib/docTypes.ts` is the
single source of truth) replacing the single tax-invoice flow.

- [x] **Seven document types** — ใบเสนอราคา · ใบแจ้งหนี้ · ใบกำกับภาษี · ใบเสร็จรับเงิน ·
      ใบรับรองแทนใบเสร็จ · ใบลดหนี้ · ใบเพิ่มหนี้ — each with its own numbering series, status
      machine, and type-aware poka-yoke gate (FULL μ86/4 · LIGHT · SUBSTITUTE).
- [x] **Discounts** — per-line + whole-document, integer-satang, clamped, applied before VAT/WHT
      in `computeTotals` (the `lib/tax.ts` contract is untouched).
- [x] **Conversion workflow** — `convertDocument` clones quotation → invoice → receipt (and
      tax invoice → credit/debit note), linking `sourceId`; lineage shown on the detail page.
- [x] **Branding** — logo / seal / signature on `Company` (validated base64), rendered on every PDF;
      company profile + branding editor on `/settings` (`app/actions/company.ts`).
- [x] **UX** — unified `/documents` hub (type tabs + status filter + search), type chooser +
      adaptive `DocumentForm`, dashboard quotation pipeline.
- [x] 27 new Vitest tests (discounts, per-series numbering, gate-aware poka-yoke, conversion flow,
      branding validation, e-Tax mapping); 182 total green, production build passes.

---

## Production hardening checklist

- [ ] PostgreSQL + connection pooling (replace SQLite for shared use).
- [ ] Playwright e2e in CI; GitHub Actions running `npm run test` + build on every push.
- [ ] Rate-limiting + audit on auth.
- [ ] Backups / migration strategy for tenant data.
- [ ] Error monitoring and structured logging.

---

## Guardrail (do not regress)

The tax engine, tenant scoping, and server-side recomputation are load-bearing. Any change to
`lib/tax.ts`, `lib/invoice.ts`, or query scoping must keep `npm run test` green and must never
let a client-supplied total or `companyId` reach the database. See [`CLAUDE.md`](./CLAUDE.md).
