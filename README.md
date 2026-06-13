# Sendo センド。

A multi-tenant web app for issuing Thai tax documents — full tax invoices (ใบกำกับภาษี) and
withholding-tax certificates (ใบหัก ณ ที่จ่าย / 50 ทวิ) — built for logistics and transport
companies. Pick a customer and a job type; the engine derives VAT, withholding tax, and the net
payable and renders them read-only, so nobody mistypes a total. The same data flows straight into
the PDFs, and an invoice cannot be issued until it is legally valid under มาตรา 86/4. Each company's
data is fully isolated, and the whole thing runs on a single local SQLite file — no cloud account.

**Demo login:** `demo@sendo.test` / `demo1234` after `npm run seed` (runs at `http://localhost:3000`).

<!-- TODO: add screenshots under docs/images and a table here once the UI redesign lands -->

## Why this exists

Logistics billing is where the expensive mistakes happen: the wrong withholding rate (1% for pure
transport vs. 3% for transport-plus-service), VAT typed by hand, or a tax invoice missing a field the
Revenue Department requires. Most teams do this in Excel and catch errors after the customer disputes
them. Sendo follows **poka-yoke（ポカヨケ）** — prevent mistakes by design, not by catching them later:
anything the system can compute is read-only, anything that must be chosen is a dropdown, and a
document that breaks มาตรา 86/4 simply cannot be issued. One source of truth, recomputed on the server,
feeds every document — so the invoice, the 50 ทวิ certificate, and the totals can never disagree.

## Features

### Tax & documents
- A pure, unit-tested tax engine: VAT added on top, withholding tax subtracted from the **pre-VAT**
  base, net = `(subtotal + vat) − wht`, with a 1,000-baht withholding threshold
- Money stored as integer **satang** (baht × 100) — no floating-point rounding drift; round-half-up
- Rates live per company in **ตั้งค่าภาษี** and are editable without a code change (seeded with the
  common Thai defaults: ขนส่งล้วน 1% · ขนส่งพ่วงบริการ 3% · ค่าเช่า 5% · ค่าโฆษณา 2%)
- One-click PDF export of the tax invoice, plus the **ใบหัก ณ ที่จ่าย (50 ทวิ)** whenever withholding
  applies — both in the Sarabun government document font so Thai renders correctly offline

### Poka-yoke safeguards
- VAT / WHT / net payable are computed and shown read-only on a grey field — never typed
- Job type is a dropdown that drives the rates, so 1% and 3% can't be swapped by accident
- Customer details (tax ID, address, branch) are entered once and reused on every invoice
- Issuing runs the มาตรา 86/4 eight-field check; if anything is missing the action is blocked and the
  missing items are listed in Thai
- Invoice numbers `INV-{YYYY}-{0001}` come from an atomic counter — race-safe and never reused

### Multi-tenant & roles
- Register a company and an OWNER; every query is scoped to the signed-in user's `companyId`
- Roles: OWNER, STAFF, and a read-only VIEWER
- An append-only audit log records who issued, changed status, or deleted each invoice

### Workflow
- Customer and reusable service CRUD; pick a saved service to fill a line item
- Live totals on the create-invoice screen update as you type
- Invoice list with status (ฉบับร่าง · ออกแล้ว · ชำระแล้ว · เกินกำหนด) and a detail page
- Thai-language UI throughout, responsive down to mobile

## Architecture

```
Browser ──▶ Next.js 16 (App Router) ──▶ Prisma ──▶ SQLite (prisma/dev.db)
                │  server actions recompute every total via lib/tax.ts
                ├─ NextAuth (JWT: companyId + role) · proxy.ts gates routes
                └─ /api/invoices/[id]/pdf · /wht  ──▶ @react-pdf/renderer (Sarabun)
```

| Area | Where | Key technology |
|---|---|---|
| Tax engine | `lib/tax.ts`, `lib/money.ts` | pure TypeScript, Vitest |
| Data & tenancy | `lib/db.ts`, `lib/tenant.ts`, `prisma/` | Prisma 6, SQLite |
| Auth | `lib/auth.ts`, `proxy.ts` | NextAuth 4, bcryptjs |
| Documents | `components/pdf/`, `app/api/invoices/` | @react-pdf/renderer |
| UI | `app/`, `components/` | React 19, Tailwind v4 |

Design decisions worth noting:

- **Money is server-truth.** The client total is a preview only; every save recomputes amounts from
  the company's own `TaxSetting`, so a tampered request can't change what's billed.
- **Tenant isolation is structural, not disciplined.** Updates and deletes use
  `updateMany({ where: { id, companyId } })`, so a forged id can never reach another company's row.
- **Atomic invoice numbers.** A per-company-per-year `InvoiceCounter` increments inside a transaction
  — concurrent issues can't collide, and deleting an invoice never re-issues its number.
- **Rates as data, not code.** Withholding/VAT rates sit in the database with an accountant warning in
  the UI, so they can be corrected without a deploy.
- **`@react-pdf` with a bundled Thai font.** Sarabun (the open government document font) ships in the
  repo, so PDFs render Thai correctly with no network call.

The full plan and assumptions are in [`docs`](#project-documentation).

## Requirements

- [Node.js 20+](https://nodejs.org) — check with `node -v`
- macOS / Linux / Windows; the app and tests run on all three

## Installation

**Mac / Linux**
```bash
git clone https://github.com/Tasachii/Sendo.git
cd Sendo
cp .env.example .env          # then set NEXTAUTH_SECRET — openssl rand -base64 32
npm install                   # installs deps, runs prisma generate
npx prisma migrate dev        # create the local SQLite database
npm run seed                  # load demo data (two companies)
```

**Windows**
```bat
git clone https://github.com/Tasachii/Sendo.git
cd Sendo
copy .env.example .env         :: then set NEXTAUTH_SECRET
npm install                    :: installs deps, runs prisma generate
npx prisma migrate dev         :: create the local SQLite database
npm run seed                   :: load demo data (two companies)
```

## Usage

### Development

```bash
npm run dev          # start the app on http://localhost:3000
```

### Daily use

```bash
npm run build        # production build (type-checks every route)
npm start            # serve the production build
npm run db:studio    # open Prisma Studio to inspect the database
npm run seed         # reset demo data
```

Demo accounts created by the seed:

| Role | Email | Password |
|---|---|---|
| Demo company (OWNER) | `demo@sendo.test` | `demo1234` |
| Second tenant (proves isolation) | `other@sendo.test` | `demo1234` |

### Two-minute tutorial

1. `npm run dev`, open `http://localhost:3000`, and sign in with the demo account above.
2. Open **ลูกค้า → + เพิ่มลูกค้า** and save a customer once (tax ID, address, branch).
3. Go to **ใบแจ้งหนี้ → + สร้างใบแจ้งหนี้**. Pick **ลูกค้า**, choose **ประเภทงาน** — say
   *ขนส่งพ่วงบริการ* — and add a line item for 20,000. Watch **ยอดชำระสุทธิ** settle at 20,800
   (VAT 1,400, หัก ณ ที่จ่าย 600). Press **บันทึกฉบับร่าง**.
4. On the invoice, press **ออกใบกำกับภาษี**. If a required field is missing it's blocked with a Thai
   list; otherwise the status becomes *ออกแล้ว*.
5. Download **ใบกำกับภาษี (PDF)** and, since this job withholds tax, **ใบหัก ณ ที่จ่าย (50 ทวิ)**.
6. Sign in as `other@sendo.test` and confirm none of the first company's data is visible.

### Configuration

| Environment variable | Default | Purpose |
|---|---|---|
| `NEXTAUTH_URL` | `http://localhost:3000` | Base URL for NextAuth callbacks |
| `NEXTAUTH_SECRET` | — | Session signing secret (`openssl rand -base64 32`) |

The SQLite path is set in `prisma/schema.prisma` (`file:./dev.db`).

## Testing

```bash
npm test             # Vitest — 18 tests across 4 files
```

Covers the tax engine (the five spec cases plus rounding), tenant isolation, the poka-yoke
มาตรา 86/4 validator, and the invoice flow (numbering, totals, concurrency).

## Project documentation

- [`CLAUDE.md`](CLAUDE.md) — architecture, conventions, and the two rules never to break
- [`CONCEPT.md`](CONCEPT.md) — brand, name, and tone
- [`DECISIONS.md`](DECISIONS.md) — running log of assumptions and resolved spec conflicts
- [`ROADMAP.md`](ROADMAP.md) — Phase 2/3 plan and the production-hardening checklist

## Roadmap

Phase 1 (the MVP) has shipped: auth with tenant isolation, customer/service/tax CRUD, the
live-totals invoice screen, the poka-yoke issue gate, invoice and 50 ทวิ PDFs, atomic numbering, and
an audit log. Next, in order of value: weight/distance pricing and copy-invoice (the features that
make this a logistics tool, not just a billing form), then a dashboard for unpaid/overdue, then the
hard compliance work — monthly ภ.ง.ด./ภ.พ.30 summaries and ETDA-format e-Tax invoices. The full
plan, with the review fixes it closes, lives in [`ROADMAP.md`](ROADMAP.md).

## License

MIT © Phasathat Jaruchitsophon

> Tax rates and the 50 ทวิ party direction are common defaults — confirm them with your company's
> accountant before issuing real documents. Not tax or filing advice.
