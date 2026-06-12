import { requireSession, db } from "@/lib/tenant";
import { ServicesManager } from "./ServicesManager";

export default async function ServicesPage() {
  const ctx = await requireSession();
  const [services, taxSettings] = await Promise.all([
    db.service.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    db.taxSetting.findMany({ where: { companyId: ctx.companyId }, orderBy: { jobType: "asc" } }),
  ]);
  return (
    <ServicesManager
      initial={services}
      jobTypes={taxSettings.map((t) => ({ jobType: t.jobType, label: t.label }))}
      canWrite={ctx.role !== "VIEWER"}
    />
  );
}
