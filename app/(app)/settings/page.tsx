import { requireSession, db } from "@/lib/tenant";
import { TaxSettingsManager } from "./TaxSettingsManager";

export default async function SettingsPage() {
  const ctx = await requireSession();
  const settings = await db.taxSetting.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { jobType: "asc" },
  });
  return (
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
  );
}
