import { renderToBuffer } from "@react-pdf/renderer";
import { getSessionContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { registerThaiFont } from "@/components/pdf/fonts";
import { WhtCertPDF } from "@/components/pdf/WhtCertPDF";
import { legalDate } from "@/lib/legalDate";
import { resolveIssuedDocument } from "@/lib/issuedDocument";

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
  let issued: ReturnType<typeof resolveIssuedDocument>;
  try {
    issued = resolveIssuedDocument(inv.issuedDocumentSnapshot, {
      company: inv.company,
      customer: inv.customer,
      incomeLabel: setting?.label ?? "ค่าขนส่ง/บริการ",
    });
  } catch {
    return new Response("ข้อมูล snapshot ของเอกสารที่ออกแล้วไม่ถูกต้อง", { status: 500 });
  }
  // Derive the rate from what was ACTUALLY withheld on this invoice (stored amounts),
  // not the live TaxSetting — so editing the rate after issue can't change a legal cert (A13).
  const whtRatePct = inv.subtotalSatang > 0 ? (inv.whtSatang * 100) / inv.subtotalSatang : 0;

  registerThaiFont();
  const buffer = await renderToBuffer(
    <WhtCertPDF
      data={{
        number: inv.number,
        issueDate: legalDate(inv.issueDate),
        withholder: { name: issued.customer.name, taxId: issued.customer.taxId, address: issued.customer.address },
        payee: { name: issued.company.name, taxId: issued.company.taxId, address: issued.company.address },
        incomeLabel: issued.incomeLabel,
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
