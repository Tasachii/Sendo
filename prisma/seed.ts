import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { TAX_DEFAULTS } from "../lib/taxDefaults";

type SeedDatabase = PrismaClient | Prisma.TransactionClient;

export class SeedRefusedError extends Error {}

async function seedCompany(db: SeedDatabase, opts: {
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

async function deleteBusinessData(db: Prisma.TransactionClient) {
  await db.invoiceItem.deleteMany();
  await db.invoice.deleteMany();
  await db.service.deleteMany();
  await db.customer.deleteMany();
  await db.taxSetting.deleteMany();
  await db.user.deleteMany();
  await db.company.deleteMany();
}

async function insertDemoData(db: SeedDatabase) {
  // --- Demo company (the one you log into) ---
  const demo = await seedCompany(db, {
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
  await seedCompany(db, {
    name: "บริษัท คู่แข่ง โลจิสติกส์ จำกัด",
    taxId: "0105559999881",
    address: "1 ถนนเพชรบุรี แขวงถนนเพชรบุรี เขตราชเทวี กรุงเทพมหานคร 10400",
    ownerEmail: "other@sendo.test",
    ownerName: "เจ้าของอีกบริษัท",
    password: "demo1234",
  });

  console.log("Seed complete.");
  console.log("  Demo login : demo@sendo.test / demo1234");
  console.log("  Other login: other@sendo.test / demo1234 (different tenant)");
}

export async function seedDemoData(db: PrismaClient, force = false) {
  return db.$transaction(async (tx) => {
    const existingCompanies = await tx.company.count();
    if (existingCompanies > 0 && !force) {
      throw new SeedRefusedError(
        "Refusing to seed a populated database. Set SENDO_SEED_FORCE=true only when you intend to replace all business data.",
      );
    }
    if (force) await deleteBusinessData(tx);
    await insertDemoData(tx);
  });
}

async function main() {
  const databaseUrl = process.env.SENDO_DATABASE_URL;
  const db = new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);
  try {
    await seedDemoData(db, process.env.SENDO_SEED_FORCE === "true");
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(error instanceof SeedRefusedError ? 2 : 1);
  });
}
