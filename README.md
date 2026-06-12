# Sendo — ส่งบิล ถูกต้องตั้งแต่แรก

ระบบออกใบกำกับภาษีและใบหัก ณ ที่จ่าย สำหรับธุรกิจขนส่ง/โลจิสติกส์ในไทย
ออกแบบตามหลัก **poka-yoke (ポカヨケ)** — กันความผิดพลาดตั้งแต่ต้น: อะไรที่ระบบคำนวณได้ ผู้ใช้พิมพ์เองไม่ได้;
อะไรที่ต้องเลือก เป็น dropdown; และออกใบกำกับภาษีไม่ได้ถ้าข้อมูลไม่ครบตามกฎหมาย (มาตรา 86/4)

> Multi-tenant — แต่ละบริษัทเห็นข้อมูลเฉพาะของตัวเอง ใช้ร่วมกันหลายบริษัทได้

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env          # แล้วตั้งค่า NEXTAUTH_SECRET (openssl rand -base64 32)
npx prisma migrate dev        # สร้างฐานข้อมูล SQLite
npm run seed                  # ใส่ข้อมูลตัวอย่าง (2 บริษัท)
npm run dev                   # http://localhost:3000
```

บัญชีเดโม่:

| บทบาท | อีเมล | รหัสผ่าน |
|---|---|---|
| บริษัทเดโม่ (OWNER) | `demo@sendo.test` | `demo1234` |
| อีกบริษัท (พิสูจน์การแยกข้อมูล) | `other@sendo.test` | `demo1234` |

## สคริปต์

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | รันแอป |
| `npm run build` / `npm start` | build + รัน production |
| `npm run test` | Vitest (เครื่องคิดภาษี + แยก tenant + poka-yoke) |
| `npm run db:migrate` | Prisma migrate |
| `npm run db:studio` | เปิด Prisma Studio ดูข้อมูล |
| `npm run seed` | ใส่ข้อมูลตัวอย่าง |

## เครื่องคิดภาษี (หัวใจของระบบ)

- `vat = subtotal × vatRate` — **บวกเพิ่ม** (มาตรฐาน 7%)
- `wht = subtotal × whtRate` — **หักออก** คิดจากฐาน**ก่อน** VAT เสมอ
- `net = (subtotal + vat) − wht`
- ไม่หัก ณ ที่จ่ายถ้า subtotal < 1,000 บาท (ปรับได้ที่ `WHT_THRESHOLD_SATANG`)
- เก็บเงินเป็นจำนวนเต็ม **สตางค์** (บาท × 100) กันปัญหาทศนิยม; ปัดเศษแบบ round-half-up
- อัตราภาษีเก็บในตาราง `TaxSetting` (แก้ได้ในหน้า "ตั้งค่าภาษี" โดยไม่ต้องแก้โค้ด)

โค้ดเครื่องคิดภาษีอยู่ที่ `lib/tax.ts` มี unit test ครบที่ `tests/tax.test.ts`

## เทคโนโลยี

Next.js 16 (App Router) · TypeScript · Prisma + SQLite · NextAuth (Credentials + bcryptjs) ·
Tailwind v4 · Zod · @react-pdf/renderer (ฟอนต์ Sarabun) · Vitest

โครงสร้างและกติกาการพัฒนาดูที่ [`CLAUDE.md`](./CLAUDE.md) · แบรนด์/โทน [`CONCEPT.md`](./CONCEPT.md) ·
บันทึกการตัดสินใจ [`DECISIONS.md`](./DECISIONS.md)

## สถานะ

**Phase 1 (MVP) — เสร็จ:** auth + แยก tenant, จัดการลูกค้า/รายการบริการ, สร้างใบแจ้งหนี้คิดภาษีสด,
poka-yoke ตรวจ 8 ข้อก่อนออกใบกำกับ, ออก PDF ใบกำกับภาษี + ใบหัก ณ ที่จ่าย (50 ทวิ), รายการ+สถานะใบแจ้งหนี้

**Phase 2 (ถัดไป):** คิดราคาตามน้ำหนัก/ระยะทาง, ก๊อปใบแจ้งหนี้, ผูก tracking, dashboard, OVERDUE อัตโนมัติ
**Phase 3:** สรุปภาษีรายเดือน (ภ.ง.ด.3/53, ภ.พ.30), e-Tax Invoice (อ้างอิง ETDA), ต่อ API ขนส่ง
