import { renderToBuffer } from "@react-pdf/renderer";
import { getSessionContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { registerThaiFont } from "@/components/pdf/fonts";
import { InvoicePDF } from "@/components/pdf/InvoicePDF";
import { docMeta } from "@/lib/docTypes";

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const inv = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { customer: true, items: true, company: true },
  });
  if (!inv) return new Response("Not found", { status: 404 });
  if (inv.status === "DRAFT") return new Response("ต้องออกใบกำกับภาษีก่อนจึงจะดาวน์โหลดได้", { status: 400 });

  const meta = docMeta(inv.docType);
  const secondaryValue =
    meta.dateField === "dueDate" ? iso(inv.dueDate)
    : meta.dateField === "validUntil" ? iso(inv.validUntil)
    : meta.dateField === "receivedDate" ? iso(inv.receivedDate)
    : null;

  registerThaiFont();
  const buffer = await renderToBuffer(
    <InvoicePDF
      data={{
        docType: inv.docType,
        number: inv.number,
        issueDate: iso(inv.issueDate)!,
        secondaryDate: secondaryValue ? { label: meta.dateLabel, value: secondaryValue } : null,
        company: { name: inv.company.name, taxId: inv.company.taxId, address: inv.company.address, branch: inv.company.branch },
        customer: { name: inv.customer.name, taxId: inv.customer.taxId, address: inv.customer.address, branch: inv.customer.branch },
        branding: { logoDataUrl: inv.company.logoDataUrl, sealDataUrl: inv.company.sealDataUrl, signatureDataUrl: inv.company.signatureDataUrl },
        items: inv.items.map((it) => ({ description: it.description, qty: it.qty, unitPriceSatang: it.unitPriceSatang, discountSatang: it.discountSatang, lineTotalSatang: it.lineTotalSatang })),
        docDiscountSatang: inv.docDiscountSatang,
        subtotalSatang: inv.subtotalSatang,
        vatSatang: inv.vatSatang,
        whtSatang: inv.whtSatang,
        netSatang: inv.netSatang,
        trackingNo: inv.trackingNo,
        note: inv.note,
        paymentMethod: inv.paymentMethod,
        payeeName: inv.payeeName,
        reason: inv.reason,
        refDocNumber: inv.refDocNumber,
      }}
    />
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.number}.pdf"`,
    },
  });
}
