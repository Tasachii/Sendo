import { requireSession, db } from "@/lib/tenant";
import { TaxSettingsManager } from "./TaxSettingsManager";
import { CompanyProfileManager } from "./CompanyProfileManager";

export default async function SettingsPage() {
  const ctx = await requireSession();
  const [company, settings] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId } }),
    db.taxSetting.findMany({ where: { companyId: ctx.companyId }, orderBy: { jobType: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">ตั้งค่า</h1>
        <p className="text-sm text-muted">ข้อมูลบริษัท แบรนด์บนเอกสาร และอัตราภาษี</p>
      </div>

      <CompanyProfileManager
        canEdit={ctx.role === "OWNER"}
        initial={{
          name: company.name,
          taxId: company.taxId,
          address: company.address,
          branch: company.branch,
          isVatRegistered: company.isVatRegistered,
          logoDataUrl: company.logoDataUrl,
          sealDataUrl: company.sealDataUrl,
          signatureDataUrl: company.signatureDataUrl,
        }}
      />

      <TaxSettingsManager
        initial={settings.map((t) => ({
          jobType: t.jobType,
          label: t.label,
          vatRate: t.vatRate,
          whtRate: t.whtRate,
          vatApplicable: t.vatApplicable,
        }))}
        canWrite={ctx.role !== "VIEWER"}
      />
    </div>
  );
}
