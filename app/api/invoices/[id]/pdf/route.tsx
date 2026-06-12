import { renderToBuffer } from "@react-pdf/renderer";
import { getSessionContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { registerThaiFont } from "@/components/pdf/fonts";
import { InvoicePDF } from "@/components/pdf/InvoicePDF";

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

  registerThaiFont();
  const buffer = await renderToBuffer(
    <InvoicePDF
      data={{
        number: inv.number,
        issueDate: inv.issueDate.toISOString().slice(0, 10),
        company: { name: inv.company.name, taxId: inv.company.taxId, address: inv.company.address, branch: inv.company.branch },
        customer: { name: inv.customer.name, taxId: inv.customer.taxId, address: inv.customer.address, branch: inv.customer.branch },
        items: inv.items.map((it) => ({ description: it.description, qty: it.qty, unitPriceSatang: it.unitPriceSatang, lineTotalSatang: it.lineTotalSatang })),
        subtotalSatang: inv.subtotalSatang,
        vatSatang: inv.vatSatang,
        whtSatang: inv.whtSatang,
        netSatang: inv.netSatang,
        trackingNo: inv.trackingNo,
        note: inv.note,
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
