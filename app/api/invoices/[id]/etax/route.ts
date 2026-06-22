import { getSessionContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { buildETaxXml, buildSignedETaxPdf, validateETaxDocument } from "@/lib/etax";
import { invoiceToETaxDocument, isETaxEligible } from "@/lib/etax-map";
import { createETaxSigner } from "@/lib/etax-signer";

/**
 * e-Tax export. Builds the ขมธอ.3-2560 XML from the document. When a signing
 * certificate is configured (env ETAX_PFX_BASE64 + ETAX_PFX_PASSPHRASE) it returns
 * a PAdES-signed PDF/A-3 with the XML embedded; otherwise it returns the XML payload
 * so the document is still exportable. Tenant-scoped; issued VAT documents only.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const inv = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { company: true, customer: true, items: true },
  });
  if (!inv) return new Response("Not found", { status: 404 });
  if (inv.status === "DRAFT") return new Response("ต้องออกเอกสารก่อนจึงจะสร้าง e-Tax ได้", { status: 400 });
  if (!isETaxEligible(inv.docType)) return new Response("เอกสารประเภทนี้ไม่รองรับ e-Tax", { status: 400 });

  const doc = invoiceToETaxDocument(inv, inv.company, inv.customer);
  const problems = validateETaxDocument(doc);
  if (problems.length) return new Response(`ข้อมูล e-Tax ไม่ครบ:\n- ${problems.join("\n- ")}`, { status: 400 });

  const pfxB64 = process.env.ETAX_PFX_BASE64;
  const passphrase = process.env.ETAX_PFX_PASSPHRASE;

  // No certificate configured → hand back the (valid, tested) XML payload.
  if (!pfxB64 || !passphrase) {
    const xml = buildETaxXml(doc);
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="etax-${inv.number}.xml"`,
      },
    });
  }

  // Certificate present → produce the signed PDF/A-3.
  try {
    const pdf = await buildSignedETaxPdf(doc, { pfx: Buffer.from(pfxB64, "base64"), passphrase }, createETaxSigner());
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="etax-${inv.number}.pdf"`,
      },
    });
  } catch (e) {
    return new Response(`สร้าง e-Tax ที่ลงนามไม่สำเร็จ: ${(e as Error).message}`, { status: 500 });
  }
}
