import { requireWriter, db } from "@/lib/tenant";
import { InvoiceForm } from "./InvoiceForm";

export default async function NewInvoicePage() {
  const ctx = await requireWriter();
  const [customers, services, taxSettings] = await Promise.all([
    db.customer.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    db.service.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    db.taxSetting.findMany({ where: { companyId: ctx.companyId }, orderBy: { jobType: "asc" } }),
  ]);

  return (
    <InvoiceForm
      customers={customers.map((c) => ({
        id: c.id,
        name: c.name,
        isVatRegistered: c.isVatRegistered,
        taxId: c.taxId,
        hasAddress: !!c.address,
      }))}
      services={services.map((s) => ({
        id: s.id,
        name: s.name,
        defaultJobType: s.defaultJobType,
        defaultUnitPriceBaht: s.defaultUnitPriceSatang / 100,
      }))}
      taxSettings={taxSettings.map((t) => ({
        jobType: t.jobType,
        label: t.label,
        vatRate: t.vatRate,
        whtRate: t.whtRate,
        vatApplicable: t.vatApplicable,
      }))}
    />
  );
}
