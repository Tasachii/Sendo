# Sendo（センド）— Thai logistics invoicing

![License](https://img.shields.io/badge/license-MIT-black) ![Tests](https://img.shields.io/badge/tests-18%20passing-success)

Sendo issues Thai tax invoices (ใบกำกับภาษี) and withholding-tax certificates
(ใบหัก ณ ที่จ่าย / 50 ทวิ) for logistics and transport companies. It is built around
**poka-yoke（ポカヨケ）**: the system computes every amount so the user cannot mistype it,
choices are dropdowns rather than free text, and an invoice cannot be issued until it is
legally valid under มาตรา 86/4. It is multi-tenant — each company sees only its own data —
and runs entirely on a local SQLite file with no external account.

**Live** — — · **Docs** — [`CLAUDE.md`](./CLAUDE.md) · [`CONCEPT.md`](./CONCEPT.md) · [`ROADMAP.md`](./ROADMAP.md) · **Issues** — [GitHub](https://github.com/Tasachii/Sendo/issues)

---

## What it is

Logistics billing is where expensive mistakes happen: the wrong withholding rate, VAT typed
by hand, a tax invoice missing a legally required field. Sendo removes those failure modes by
design rather than catching them after the fact. Staff pick a customer and a job type; the
engine derives VAT, withholding tax, and the net payable, and renders them read-only. The same
data flows straight into the invoice and 50 ทวิ PDFs, so nothing is keyed twice.

- **Stack** — Next.js 16 (App Router) · TypeScript · Prisma · SQLite · NextAuth · Tailwind v4 · Zod · @react-pdf/renderer · Vitest
- **Who it's for** — transport/logistics firms and their partner companies sharing one install.

---

## Tax model

The core engine (`lib/tax.ts`) is a pure, unit-tested function. Money is stored as integer
**satang** (baht × 100) so there are no floating-point errors.

| Rule | Behaviour |
| --- | --- |
| VAT | `vat = subtotal × vatRate`, **added on top** (standard 7%). |
| Withholding (WHT) | `wht = subtotal × whtRate`, **subtracted**, always on the **pre-VAT** base. |
| Net payable | `net = (subtotal + vat) − wht`. |
| WHT threshold | No withholding when `subtotal < 1,000` baht (`WHT_THRESHOLD_SATANG`). |
| Rounding | Round-half-up to the satang, on VAT and WHT only. |
| Rates | Stored per company in `TaxSetting`, edited in **ตั้งค่าภาษี** — never hardcoded. |

Example — ขนส่งพ่วงบริการ (7% / 3%) on 20,000 baht: VAT 1,400, WHT 600, **net 20,800**.

---

## Installation

**Requirements** — [Node 20+](https://nodejs.org)

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

---

## Running

```bash
npm run dev          # start the app on http://localhost:3000
npm run test         # run Vitest — 18 tests (tax · tenant · poka-yoke · invoice flow)
npm run build        # production build (type-checks every route)
npm run db:studio    # open Prisma Studio to inspect the database
npm run seed         # reset demo data
```

Demo accounts created by the seed:

| Role | Email | Password |
| --- | --- | --- |
| Demo company (OWNER) | `demo@sendo.test` | `demo1234` |
| Second tenant (proves isolation) | `other@sendo.test` | `demo1234` |

---

## Usage

1. **Add a customer (once).** ลูกค้า → **+ เพิ่มลูกค้า**. Tax ID and address are reused on every invoice.
2. **Create an invoice.** ใบแจ้งหนี้ → **+ สร้างใบแจ้งหนี้**. Pick **ลูกค้า**, choose **ประเภทงาน**
   (this sets the VAT/WHT rates), add line items. **ยอดชำระสุทธิ** updates as you type and is read-only.
3. **Issue it.** **ออกใบกำกับภาษี** runs the มาตรา 86/4 check; if a required field is missing the
   action is blocked and the missing items are listed in Thai.
4. **Download.** **ดาวน์โหลดใบกำกับภาษี (PDF)**, plus **ใบหัก ณ ที่จ่าย (50 ทวิ)** when WHT applies.

---

## Architecture

| Topic | Decision |
| --- | --- |
| Money | Integer **satang**, recomputed on the server every save — the client total is only a preview, never trusted. |
| Tenant isolation | Every query is scoped by `companyId`; updates/deletes use `updateMany({ where: { id, companyId } })` so a forged id cannot reach another tenant's row. |
| Invoice numbers | `INV-{YYYY}-{0001}` from an atomic `InvoiceCounter` increment in a transaction — race-safe and gap-stable across deletes. |
| Tax rates | Live in `TaxSetting` rows, editable in the UI, so an accountant can adjust them without a code change. |
| Auth | NextAuth Credentials + bcryptjs, JWT carrying `companyId` + role; route gating in `proxy.ts` (Next 16 renamed `middleware` → `proxy`). |
| PDFs | `@react-pdf/renderer` with the bundled **Sarabun** Thai government font, so documents render correctly offline. |
| Audit | Append-only `AuditLog` records issue / status / delete actions per tenant. |

---

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `NEXTAUTH_URL` | `http://localhost:3000` | Base URL for NextAuth callbacks. |
| `NEXTAUTH_SECRET` | — | Session signing secret — `openssl rand -base64 32`. |

The SQLite database path is set in `prisma/schema.prisma` (`file:./dev.db`).

---

## Roadmap

- [x] Phase 1 — auth + tenant isolation, customer/service/tax CRUD, live-totals invoice, poka-yoke issue gate, invoice + 50 ทวิ PDFs, audit log
- [ ] Phase 2 — weight/distance pricing, copy invoice, multi-shipment trackingNo, dashboard, auto-OVERDUE
- [ ] Phase 3 — ภ.ง.ด.3/53 + ภ.พ.30 export, e-Tax Invoice (PDF/A-3 + XML, ETDA reference), carrier API hooks
- [ ] Production hardening — PostgreSQL, Playwright e2e, rate-limiting

See [`ROADMAP.md`](./ROADMAP.md) for detail.

---

## License

MIT © Phasathat Jaruchitsophon

> Tax rates and the 50 ทวิ party direction are common defaults — confirm them with your
> company's accountant before issuing real documents. Not tax or filing advice.
