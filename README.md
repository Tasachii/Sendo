# Sendo（センド）— Thai logistics invoicing

[![Tests](https://img.shields.io/badge/tests-155_passed-4ade80?style=flat-square)](https://github.com/Tasachii/Sendo/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![CI](https://github.com/Tasachii/Sendo/actions/workflows/ci.yml/badge.svg)](https://github.com/Tasachii/Sendo/actions/workflows/ci.yml)

Sendo is a multi-tenant web app for issuing Thai tax documents — full tax invoices (ใบกำกับภาษี) and withholding-tax certificates (ใบหัก ณ ที่จ่าย / 50 ทวิ) — built for logistics and transport companies. Pick a customer and a job type; the tax engine derives VAT, withholding tax, and net payable and renders them read-only, so nobody mistypes a total. Money is stored as integer satang (baht × 100) and every total is recomputed on the server on every save — a tampered request cannot change what is billed. The same data flows straight into the PDFs, and a document cannot be issued until it satisfies the eight mandatory fields of มาตรา 86/4. Each company's data is fully isolated behind structural tenant guards; the whole app runs on a single local SQLite file with no cloud account required.

**Live demo** — [tasachii.github.io/Sendo](https://tasachii.github.io/Sendo/) (client-only invoice flow; full app is server-based) · **Issues** — [github.com/Tasachii/Sendo/issues](https://github.com/Tasachii/Sendo/issues)

---

## Screenshots

| Dashboard — month / unpaid / overdue | Create invoice — live read-only totals |
| --- | --- |
| ![Dashboard](docs/images/dashboard.png) | ![Create invoice](docs/images/invoice-new.png) |

| Invoice list with statuses | Monthly tax report (ภ.พ.30 / ภ.ง.ด.) |
| --- | --- |
| ![Invoices](docs/images/invoices.png) | ![Tax report](docs/images/reports.png) |

| Poka-yoke blocks an invalid issue | Sign in |
| --- | --- |
| ![Poka-yoke](docs/images/poka-yoke.png) | ![Login](docs/images/login.png) |

---

## What it is

Logistics billing is where the expensive mistakes happen: the wrong withholding rate (1% for pure transport vs. 3% for transport-plus-service), VAT typed by hand, or a tax invoice missing a field the Revenue Department requires. Most teams handle this in Excel and catch errors after the customer disputes them.

Sendo follows **poka-yoke（ポカヨケ）** — ส่งบิล ถูกต้องตั้งแต่แรก — prevent mistakes by design, not by catching them later: anything the system can compute is read-only, anything that must be chosen is a dropdown, and a document that breaks มาตรา 86/4 simply cannot be issued.

- **Stack** — Next.js 16 · React 19 · TypeScript · Prisma 6 · SQLite · NextAuth 4 · Tailwind v4 · Zod · @react-pdf/renderer · Vitest

---

## Installation

**Requirements** — [Node 20+](https://nodejs.org) (tested on Node 20 in CI; `node -v` to check)

**Mac / Linux**
```bash
git clone https://github.com/Tasachii/Sendo.git
cd Sendo
cp .env.example .env          # then set NEXTAUTH_SECRET (openssl rand -base64 32)
npm install                   # installs deps, runs prisma generate via postinstall
npx prisma migrate dev        # create the local SQLite database
npm run seed                  # load demo data (two companies)
```

**Windows**
```bat
git clone https://github.com/Tasachii/Sendo.git
cd Sendo
copy .env.example .env         :: then set NEXTAUTH_SECRET
npm install                    :: installs deps, runs prisma generate via postinstall
npx prisma migrate dev         :: create the local SQLite database
npm run seed                   :: load demo data (two companies)
```

---

## Running

```bash
npm run dev              # start the app on http://localhost:3000
npm run build            # type-check + bundle every route (same step CI runs)
npm start                # serve the production build locally
npm run lint             # ESLint across the project
npm test                 # Vitest — 155 tests across 16 files
npm run test:coverage    # same suite + v8 coverage report (gates CI thresholds)
npm run test:watch       # Vitest in watch mode
npm run db:migrate       # prisma migrate dev — apply new migrations
npm run db:push          # prisma db push — sync schema without a migration file
npm run db:studio        # open Prisma Studio to inspect the database
npm run seed             # reset demo data (two companies)
```

Demo accounts created by `npm run seed`:

| Role | Email | Password |
| --- | --- | --- |
| Demo company (OWNER) | `demo@sendo.test` | `demo1234` |
| Second tenant (proves isolation) | `other@sendo.test` | `demo1234` |

---

## Usage

1. **Sign in (demo).** Run `npm run dev`, open `http://localhost:3000`, sign in as `demo@sendo.test` / `demo1234`.
2. **Add a customer (one time).** Open **ลูกค้า → + เพิ่มลูกค้า**. Enter tax ID, address, and branch; press **บันทึก** (Save). The details reuse on every future invoice.
3. **Create an invoice.** Go to **ใบแจ้งหนี้ → + สร้างใบแจ้งหนี้**. Pick **ลูกค้า**, choose **ประเภทงาน** — e.g. *ขนส่งพ่วงบริการ* — and add a line item for 20,000. Watch **ยอดชำระสุทธิ** settle at 20,800 (VAT 1,400, หัก ณ ที่จ่าย 600). Press **บันทึกฉบับร่าง**.
4. **Issue the document.** Press **ออกใบกำกับภาษี**. If a required field is missing, the action is blocked and the missing items are listed in Thai. Otherwise the status becomes *ออกแล้ว* and the issue date is stamped.
5. **Download PDFs.** Download **ใบกำกับภาษี (PDF)** and, when withholding tax applies, **ใบหัก ณ ที่จ่าย (50 ทวิ)**. Both use Sarabun (the open Thai-government font) and render correctly offline.
6. **Verify tenant isolation.** Sign in as `other@sendo.test` and confirm none of the first company's data is visible.
7. **Edit tax rates.** Go to **ตั้งค่าภาษี** to adjust withholding and VAT rates per job type — no code change needed. Rates are data, not code.

Invoice statuses: **ฉบับร่าง** · **ออกแล้ว** · **ชำระแล้ว** · **เกินกำหนด**

---

## Architecture

```
Browser ──▶ Next.js 16 (App Router) ──▶ Prisma ──▶ SQLite (prisma/dev.db)
                │  server actions recompute every total via lib/tax.ts
                ├─ NextAuth (JWT: companyId + role) · proxy.ts gates routes
                └─ /api/invoices/[id]/pdf · /wht  ──▶ @react-pdf/renderer (Sarabun)
```

| Topic | Decision |
| --- | --- |
| Money is server-truth | Every save recomputes subtotal, VAT, WHT, and net via `lib/tax.ts` from the company's `TaxSetting` — a tampered client request cannot change what is billed. |
| Integer satang | All amounts stored as integer satang (baht × 100). Rounding is half-away-from-zero applied to VAT and WHT only; net is exact integer arithmetic. No floating-point drift. |
| Tenant isolation is structural | Every update and delete uses `where: { id, companyId }` — a forged ID can never reach another company's row. Enforced by `requireSession()` / `requireWriter()` from `lib/tenant.ts`. |
| Poka-yoke on issue | `issueInvoice` runs the มาตรา 86/4 eight-field check before changing status. Anything missing is returned as a Thai error list; the document stays DRAFT. |
| Atomic invoice numbers | A per-company-per-year `InvoiceCounter` increments inside a transaction. Concurrent issues cannot collide and a deleted invoice never re-issues its number. |
| Rates as data, not code | Withholding and VAT rates live in `TaxSetting` (editable in **ตั้งค่าภาษี**). Correcting a rate never requires a deploy. Seeded defaults: ขนส่งล้วน 1% · ขนส่งพ่วงบริการ 3% · ค่าเช่า 5% · ค่าโฆษณา 2%. |
| WHT rate on 50 ทวิ derived from stored amounts | `whtRatePct` is computed from the stored satang values at PDF time — a rate edit after issue cannot change the printed rate on a legal certificate already issued. |
| Bundled Thai font | Sarabun ships in the repo under `public/fonts`. PDFs render Thai correctly with no network call, and align with the ETDA e-Tax reference font (THSarabun). |
| SQLite for local dev | Single-file database, no external service. Migrate to PostgreSQL for production (see Roadmap). |
| State machine for invoice status | `DRAFT→SENT` (issue only) · `SENT→{PAID,OVERDUE}` · `OVERDUE→{PAID,SENT}` · `PAID→OVERDUE`. A legally-issued document can never be reverted to DRAFT. |
| Delete restricted to OWNER + DRAFT | Hard-deleting an issued tax document destroys the audit trail. Only an OWNER may delete, and only while the invoice is still DRAFT. |

---

## Configuration

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXTAUTH_URL` | `http://localhost:3000` | Base URL for NextAuth callbacks |
| `NEXTAUTH_SECRET` | — | Session signing secret — generate with `openssl rand -base64 32` |

The SQLite path is set in `prisma/schema.prisma` (`file:./dev.db`).

### Tax engine defaults

Seeded into `TaxSetting` per company. Editable in **ตั้งค่าภาษี** without a code change.

| Job type | Label | VAT | WHT |
| --- | --- | --- | --- |
| `TRANSPORT` | ขนส่งล้วน | 7% | 1% |
| `TRANSPORT_SERVICE` | ขนส่งพ่วงบริการ | 7% | 3% |
| `RENTAL` | ค่าเช่า | 7% | 5% |
| `ADVERTISING` | ค่าโฆษณา | 7% | 2% |

WHT threshold: no withholding when subtotal < 1,000 baht (100,000 satang) per Thai Revenue rule §2.1.4.

---

## CI

GitHub Actions runs on every push and pull request to `main`:

1. `npm run test:coverage` — full 155-test suite + v8 coverage thresholds (gates the PR).
2. `npm run build` — type-check + bundle every route.

Node 20 · Ubuntu latest · `npm ci` for reproducible installs.

---

## Roadmap

- [x] Phase 1 — auth + tenant isolation, Customer/Service CRUD, create-invoice with live totals, poka-yoke มาตรา 86/4 issue gate, tax invoice + 50 ทวิ PDFs, atomic numbering, audit log
- [x] Phase 2 — pricing modes (FLAT / WEIGHT / DISTANCE), copy-invoice, multi-shipment tracking, dashboard (month / unpaid / overdue), auto-OVERDUE
- [x] Phase 3 partial — monthly ภ.ง.ด./ภ.พ.30 summary with CSV export, e-Tax XML builder/validator and carrier state mapper (unit-tested stubs)
- [ ] e-Tax Invoice — ETDA PDF/A-3 + XML per ขมธอ.3-2560 v2.0 + digital signature (interface stub exists in `lib/etax.ts`)
- [ ] Carrier API integrations — live endpoints (`lib/carriers.ts` adapter defined, throws until implemented)
- [ ] Audit-log viewer UI
- [ ] Invite STAFF / VIEWER users
- [ ] Production hardening — PostgreSQL, Playwright e2e, login rate-limiting, e-Withholding 1% reduced-rate

---

## Project documentation

- [`CLAUDE.md`](CLAUDE.md) — architecture, conventions, and the two rules never to break
- [`CONCEPT.md`](CONCEPT.md) — brand, name, and tone
- [`DECISIONS.md`](DECISIONS.md) — running log of assumptions and resolved spec conflicts
- [`ROADMAP.md`](ROADMAP.md) — Phase 2/3 plan and the production-hardening checklist

---

## License

MIT © Phasathat Jaruchitsophon

> Tax rates and the 50 ทวิ party direction are common defaults — confirm them with your company's accountant before issuing real documents. Not tax or filing advice.
