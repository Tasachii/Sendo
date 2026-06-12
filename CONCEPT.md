# CONCEPT — "Sendo"

> Read this together with **BUILD SPEC**. The build spec is authoritative for features, tech, and tax behavior. This file is authoritative for the product **name, identity, and tone**. If they ever conflict: behavior → build spec wins; naming/identity → this file wins.

---

## 1. The name

**Sendo** = "send" + a soft Japanese-style "-o" ending. It is a product name, **not a literal translation** of anything. Pronounced เซ็นโด.

It quietly carries two ideas:
- **ส่ง / ขนส่ง** — the logistics job (shipping, delivery).
- A calm, deliberate craft — which pairs with the app's core philosophy, **poka-yoke (ポカヨケ)**: prevent mistakes by design, not by catching them later.

Keep the Japanese flavor **light**. It lives in the *name only* — do not turn the product into a Japanese costume.

---

## 2. Philosophy to carry into every decision

Restate of poka-yoke (already in build spec, repeated here as the brand promise):
- If the system can calculate it → the user must **not** be able to type it.
- If it must be chosen → it is a **dropdown**, never free text.
- A document **cannot be issued** unless it is legally valid (มาตรา 86/4).

The feeling Sendo should give the user: **calm, precise, trustworthy — "ส่งได้ ถูกต้องตั้งแต่แรก".**

---

## 3. Tagline

Primary (Thai UI):
> **Sendo — ส่งบิล ถูกต้องตั้งแต่แรก**

Alternates if needed: "ออกใบกำกับภาษีขนส่ง ครบ ถูก จบ" / "บิลขนส่งที่พลาดไม่ได้".
Use **one** primary tagline consistently.

---

## 4. Where the name appears (concrete)

| Location | Value | Language |
|---|---|---|
| `package.json` name | `sendo` | en, lowercase, npm-safe |
| Browser tab / app title | `Sendo` | en brand |
| Login / landing header | `Sendo` + Thai tagline | mixed |
| Sidebar / nav brand | `Sendo` | en |
| README title | `Sendo` | en |
| Invoice / WHT-cert PDF | the **seller Company name** is the legal entity, NOT "Sendo". A tiny optional footer "ออกด้วย Sendo" is allowed **only if** it does not interfere with any §4 required field. | Thai doc |
| DB tables / code identifiers | unchanged English (`Invoice`, `Customer`, …) | en |

**Critical:** the brand name must never leak into tax-document content in a way that breaks legal validity. The legal seller is the `Company` record, never "Sendo". The name does **not** change the schema or any identifier from the build spec.

---

## 5. Visual tone (light touch — apply when UI is built)

- Calm, minimal, function-first. ISTP-friendly: no clutter, no decoration for its own sake.
- One quiet accent colour — suggest an indigo / 藍-ai blue (a nod to Japan without being literal). Neutral greys for the read-only calculated fields (build spec §6).
- Clean sans typography with **proper Thai support** (e.g. Noto Sans Thai / system Thai + a neutral Latin face). **Do not** ship Japanese fonts or kanji as decoration in the UI.
- Mobile-responsive (build spec §6).

---

## 6. Don'ts

- Don't translate "Sendo" into a Thai label — it stays "Sendo".
- Don't add Japanese text/kanji to invoices or UI.
- Don't let branding override any legal-document requirement.
- Don't rename code identifiers or DB models to fit the brand.

---

## 7. File map

- **BUILD SPEC** — features, tech, tax rules (authoritative for behaviour).
- **CONCEPT.md** (this file) — name, identity, tone (authoritative for brand).
- **DECISIONS.md** — running log of assumptions.
