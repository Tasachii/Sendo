// Populate the demo company with a few realistic invoices for screenshots / QA.
import { PrismaClient } from "@prisma/client";
import { computeTotals, nextInvoiceNumber } from "../lib/invoice";

const db = new PrismaClient();

async function main() {
  const company = await db.company.findFirstOrThrow({ where: { name: { contains: "เซ็นโด" } } });
  const owner = await db.user.findFirstOrThrow({ where: { companyId: company.id } });
  const customers = await db.customer.findMany({ where: { companyId: company.id } });
  const custA = customers.find((c) => c.isVatRegistered) ?? customers[0];
  const custB = customers.find((c) => !c.isVatRegistered) ?? customers[0];

  // wipe existing invoices for a clean set
  await db.invoiceItem.deleteMany({ where: { invoice: { companyId: company.id } } });
  await db.shipment.deleteMany({ where: { invoice: { companyId: company.id } } });
  await db.invoice.deleteMany({ where: { companyId: company.id } });
  await db.invoiceCounter.deleteMany({ where: { companyId: company.id } });

  const settings = Object.fromEntries(
    (await db.taxSetting.findMany({ where: { companyId: company.id } })).map((s) => [s.jobType, s])
  );

  const specs = [
    { jobType: "transport_service", cust: custA, status: "PAID", items: [{ description: "ค่าขนส่งพ่วงบริการ กทม.–เชียงใหม่", qty: 1, unitPriceBaht: 20000, pricingMode: "FLAT" }], ship: ["FLASH-TH8841", "FLASH-TH8842"] },
    { jobType: "transport_only", cust: custB, status: "SENT", items: [{ description: "ค่าขนส่งสินค้าตามน้ำหนัก", qty: 320, unitPriceBaht: 25, pricingMode: "WEIGHT" }], ship: ["KERRY-90011"] },
    { jobType: "service", cust: custA, status: "SENT", items: [{ description: "ค่าบริการแพ็คและจัดเรียงสินค้า", qty: 1, unitPriceBaht: 8500, pricingMode: "FLAT" }], ship: [] },
    { jobType: "transport_only", cust: custA, status: "OVERDUE", items: [{ description: "ค่าขนส่งตามระยะทาง", qty: 540, unitPriceBaht: 18, pricingMode: "DISTANCE" }], ship: ["JT-55120"], overdue: true },
    { jobType: "rent", cust: custB, status: "DRAFT", items: [{ description: "ค่าเช่ารถบรรทุก 6 ล้อ (3 วัน)", qty: 3, unitPriceBaht: 8000, pricingMode: "FLAT" }], ship: [] },
  ] as const;

  let i = 0;
  for (const s of specs) {
    i++;
    const setting = settings[s.jobType];
    const totals = computeTotals(s.items.map((it) => ({ ...it })), setting);
    const issue = new Date();
    issue.setDate(issue.getDate() - i * 4);
    const due = new Date(issue);
    due.setDate(due.getDate() + ("overdue" in s && s.overdue ? -2 : 15));
    await db.$transaction(async (tx) => {
      const number = await nextInvoiceNumber(tx, company.id);
      await tx.invoice.create({
        data: {
          companyId: company.id, number, customerId: s.cust.id, createdById: owner.id,
          issueDate: issue, dueDate: due, status: s.status, jobType: s.jobType,
          subtotalSatang: totals.subtotalSatang, vatSatang: totals.vatSatang,
          whtSatang: totals.whtSatang, netSatang: totals.netSatang,
          items: { create: totals.items },
          shipments: s.ship.length ? { create: s.ship.map((t) => ({ trackingNo: t })) } : undefined,
        },
      });
    });
  }
  console.log(`Created ${specs.length} demo invoices.`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
