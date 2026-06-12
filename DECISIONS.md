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
- Could not run `prisma validate` in the build sandbox (Prisma engine binaries are network-blocked here). It will validate/migrate normally on your machine via `npx prisma migrate dev`.
- If your Prisma version rejects enums on SQLite, change both enums to `String` — no other code depends on the native enum type.

---

## Open / next
- Phase 1 remaining: auth + tenant guard, Customer/Service CRUD, create-invoice screen (live totals), poka-yoke validation on issue, invoice + WHT-certificate PDFs, invoice list.
