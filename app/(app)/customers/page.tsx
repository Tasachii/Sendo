import { requireSession, db } from "@/lib/tenant";
import { CustomersManager } from "./CustomersManager";

export default async function CustomersPage() {
  const ctx = await requireSession();
  const customers = await db.customer.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { name: "asc" },
  });
  return <CustomersManager initial={customers} canWrite={ctx.role !== "VIEWER"} />;
}
