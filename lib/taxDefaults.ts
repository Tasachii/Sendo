/**
 * Canonical Thai tax-rate defaults (build spec §2.2). Single source of truth — imported by
 * both the seed (`prisma/seed.ts`) and company registration (`app/actions/auth.ts`) so the two
 * can never silently drift. These are SEED values only: rates must be confirmed with the
 * company's accountant and are editable per company in the tax-settings screen without code.
 *
 * NOTE: `tests/demo-rates.test.ts` regex-reads this file as the canonical rate table that the
 * static public demo must match — keep the `jobType / vatRate / whtRate / vatApplicable` literals
 * inline (do not compute them) so the drift guard keeps working.
 */
export const TAX_DEFAULTS = [
  { jobType: "transport_only", label: "ขนส่งล้วน (จดทะเบียนขนส่ง)", vatRate: 0, whtRate: 0.01, vatApplicable: false },
  { jobType: "transport_service", label: "ขนส่งพ่วงบริการ", vatRate: 0.07, whtRate: 0.03, vatApplicable: true },
  { jobType: "service", label: "ค่าบริการ / รับจ้างทำของ", vatRate: 0.07, whtRate: 0.03, vatApplicable: true },
  { jobType: "rent", label: "ค่าเช่า", vatRate: 0.07, whtRate: 0.05, vatApplicable: true },
  { jobType: "advertising", label: "ค่าโฆษณา", vatRate: 0.07, whtRate: 0.02, vatApplicable: true },
  { jobType: "custom", label: "กำหนดเอง", vatRate: 0.07, whtRate: 0.03, vatApplicable: true },
];
