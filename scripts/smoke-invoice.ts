// One-off: create + issue an invoice for the demo company so we can smoke-test PDFs.
import { PrismaClient } from "@prisma/client";
import { computeTotals, nextInvoiceNumber } from "../lib/invoice";

const db = new PrismaClient();

async function main() {
  const company = await db.company.findFirst({ where: { name: { contains: "เซ็นโด" } } });
  if (!company) throw new Error("demo company not found — run npm run seed");
  const owner = await db.user.findFirst({ where: { companyId: company.id } });
  const customer = await db.customer.findFirst({ where: { companyId: company.id, isVatRegistered: true } });
  const setting = await db.taxSetting.findFirst({ where: { companyId: company.id, jobType: "transport_service" } });
  if (!owner || !customer || !setting) throw new Error("missing seed data");

  const totals = computeTotals(
    [{ description: "ค่าขนส่งพ่วงบริการ กทม.–เชียงใหม่", qty: 1, unitPriceBaht: 20000 }],
    setting
  );
  const number = await nextInvoiceNumber(db, company.id);
  const inv = await db.invoice.create({
    data: {
      companyId: company.id, number, customerId: customer.id,
      issueDate: new Date(), status: "SENT", jobType: "transport_service",
      subtotalSatang: totals.subtotalSatang, vatSatang: totals.vatSatang,
      whtSatang: totals.whtSatang, netSatang: totals.netSatang,
      createdById: owner.id, items: { create: totals.items },
    },
  });
  console.log(JSON.stringify({
    id: inv.id, number: inv.number,
    subtotal: totals.subtotalSatang, vat: totals.vatSatang, wht: totals.whtSatang, net: totals.netSatang,
  }));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
