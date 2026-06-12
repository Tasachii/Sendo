import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// Common Thai tax defaults (build spec §2.2). These are SEED values only —
// rates must be confirmed with the company's accountant and are editable in
// the tax-settings screen without touching code.
const TAX_DEFAULTS = [
  { jobType: "transport_only", label: "ขนส่งล้วน (จดทะเบียนขนส่ง)", vatRate: 0, whtRate: 0.01, vatApplicable: false },
  { jobType: "transport_service", label: "ขนส่งพ่วงบริการ", vatRate: 0.07, whtRate: 0.03, vatApplicable: true },
  { jobType: "service", label: "ค่าบริการ / รับจ้างทำของ", vatRate: 0.07, whtRate: 0.03, vatApplicable: true },
  { jobType: "rent", label: "ค่าเช่า", vatRate: 0.07, whtRate: 0.05, vatApplicable: true },
  { jobType: "advertising", label: "ค่าโฆษณา", vatRate: 0.07, whtRate: 0.02, vatApplicable: true },
  { jobType: "custom", label: "กำหนดเอง", vatRate: 0.07, whtRate: 0.03, vatApplicable: true },
];

async function seedCompany(opts: {
  name: string;
  taxId: string;
  address: string;
  ownerEmail: string;
  ownerName: string;
  password: string;
}) {
  const company = await db.company.create({
    data: {
      name: opts.name,
      taxId: opts.taxId,
      address: opts.address,
      branch: "สำนักงานใหญ่",
      isVatRegistered: true,
      taxSettings: { create: TAX_DEFAULTS },
    },
  });

  await db.user.create({
    data: {
      companyId: company.id,
      email: opts.ownerEmail,
      passwordHash: await bcrypt.hash(opts.password, 10),
      name: opts.ownerName,
      role: "OWNER",
    },
  });

  return company;
}

async function main() {
  // wipe (idempotent dev seed)
  await db.invoiceItem.deleteMany();
  await db.invoice.deleteMany();
  await db.service.deleteMany();
  await db.customer.deleteMany();
  await db.taxSetting.deleteMany();
  await db.user.deleteMany();
  await db.company.deleteMany();

  // --- Demo company (the one you log into) ---
  const demo = await seedCompany({
    name: "บริษัท เซ็นโด ขนส่ง จำกัด",
    taxId: "0105551234567",
    address: "99/1 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110",
    ownerEmail: "demo@sendo.test",
    ownerName: "เจ้าของบริษัท (เดโม่)",
    password: "demo1234",
  });

  await db.customer.createMany({
    data: [
      {
        companyId: demo.id,
        name: "บริษัท ลูกค้าเอ จำกัด",
        taxId: "0105552222333",
        address: "11 ถนนพระราม 4 แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500",
        branch: "สำนักงานใหญ่",
        contactPhone: "021112222",
        contactEmail: "ar@customer-a.test",
        isVatRegistered: true,
      },
      {
        companyId: demo.id,
        name: "ร้านลูกค้าบี",
        taxId: null,
        address: "55 หมู่ 3 ตำบลในเมือง อำเภอเมือง จังหวัดเชียงใหม่ 50000",
        branch: "สำนักงานใหญ่",
        contactPhone: "0899990000",
        contactEmail: null,
        isVatRegistered: false,
      },
    ],
  });

  await db.service.createMany({
    data: [
      { companyId: demo.id, name: "ค่าขนส่งสินค้า กรุงเทพฯ–เชียงใหม่", defaultJobType: "transport_only", defaultUnitPriceSatang: 1_000_000 },
      { companyId: demo.id, name: "ค่าขนส่งพ่วงบริการแพ็คสินค้า", defaultJobType: "transport_service", defaultUnitPriceSatang: 500_000 },
      { companyId: demo.id, name: "ค่าเช่ารถบรรทุกรายวัน", defaultJobType: "rent", defaultUnitPriceSatang: 800_000 },
    ],
  });

  // --- Second company, to prove tenant isolation (build spec §9) ---
  await seedCompany({
    name: "บริษัท คู่แข่ง โลจิสติกส์ จำกัด",
    taxId: "0105559999888",
    address: "1 ถนนเพชรบุรี แขวงถนนเพชรบุรี เขตราชเทวี กรุงเทพมหานคร 10400",
    ownerEmail: "other@sendo.test",
    ownerName: "เจ้าของอีกบริษัท",
    password: "demo1234",
  });

  console.log("Seed complete.");
  console.log("  Demo login : demo@sendo.test / demo1234");
  console.log("  Other login: other@sendo.test / demo1234 (different tenant)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
