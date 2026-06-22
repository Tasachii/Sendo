import { renderToBuffer } from "@react-pdf/renderer";
import { getSessionContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { registerThaiFont } from "@/components/pdf/fonts";
import { WhtCertPDF } from "@/components/pdf/WhtCertPDF";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const inv = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { customer: true, company: true },
  });
  if (!inv) return new Response("Not found", { status: 404 });
  if (inv.status === "DRAFT") return new Response("ต้องออกใบกำกับภาษีก่อน", { status: 400 });
  if (inv.whtSatang <= 0) return new Response("ใบแจ้งหนี้นี้ไม่มีการหัก ณ ที่จ่าย", { status: 400 });

  const setting = await db.taxSetting.findFirst({ where: { companyId: ctx.companyId, jobType: inv.jobType } });
  // Derive the rate from what was ACTUALLY withheld on this invoice (stored amounts),
  // not the live TaxSetting — so editing the rate after issue can't change a legal cert (A13).
  const whtRatePct = inv.subtotalSatang > 0 ? Math.round((inv.whtSatang / inv.subtotalSatang) * 100) : 0;

  registerThaiFont();
  const buffer = await renderToBuffer(
    <WhtCertPDF
      data={{
        number: inv.number,
        issueDate: inv.issueDate.toISOString().slice(0, 10),
        withholder: { name: inv.customer.name, taxId: inv.customer.taxId, address: inv.customer.address },
        payee: { name: inv.company.name, taxId: inv.company.taxId, address: inv.company.address },
        incomeLabel: setting?.label ?? "ค่าขนส่ง/บริการ",
        baseSatang: inv.subtotalSatang,
        whtSatang: inv.whtSatang,
        whtRatePct,
      }}
    />
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="WHT-${inv.number}.pdf"`,
    },
  });
}
