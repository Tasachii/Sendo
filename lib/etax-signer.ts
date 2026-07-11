import type { ETaxDeps, ETaxDocument, SigningCredential } from "@/lib/etax";

/**
 * Production implementation of the e-Tax sign/embed steps (lib/etax.ts `ETaxDeps`).
 *   embedInPdfA3 — render a cover page and embed the ขมธอ.3-2560 XML as a PDF attachment
 *                  (PDF/A-3 carries its source XML this way). Uses `pdf-lib`.
 *   sign         — apply a PAdES digital signature with the seller's PKCS#12 certificate.
 *                  Uses `@signpdf`.
 *
 * Heavy deps are loaded with dynamic import so the rest of the app builds and runs even
 * when e-Tax is never used. The sign step needs a REAL certificate (env-configured); it
 * cannot be exercised without one, so it is gated behind a configured PFX in the route.
 */
export function createETaxSigner(): ETaxDeps {
  return {
    async embedInPdfA3(xml: string, doc: ETaxDocument): Promise<Uint8Array> {
      const { PDFDocument, StandardFonts, AFRelationship } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595.28, 841.89]); // A4 points
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const lines = [
        `e-Tax Invoice  ${doc.number}`,
        `Document type ${doc.documentType}  ·  Issued ${doc.issueDate}`,
        `Seller: ${doc.seller.name}  (Tax ID ${doc.seller.taxId})`,
        `Buyer:  ${doc.buyer.name}  (Tax ID ${doc.buyer.taxId})`,
        `VAT (THB): ${(doc.vatSatang / 100).toFixed(2)}`,
        `Grand total (THB): ${(doc.grandTotalSatang / 100).toFixed(2)}`,
        ``,
        `The signed XML payload (ขมธอ.3-2560 v2.0) is embedded as an attachment.`,
      ];
      lines.forEach((t, i) => page.drawText(t, { x: 48, y: 792 - i * 18, size: i === 0 ? 14 : 10, font }));

      await pdf.attach(new TextEncoder().encode(xml), `etax-${doc.number}.xml`, {
        mimeType: "application/xml",
        description: "e-Tax Invoice XML (ขมธอ.3-2560 v2.0)",
        afRelationship: AFRelationship.Source,
      });
      return pdf.save();
    },

    async sign(pdf: Uint8Array, credential: SigningCredential): Promise<Uint8Array> {
      type SignPdf = { sign(pdf: Buffer, signer: unknown): Promise<Buffer> };
      const { PDFDocument } = await import("pdf-lib");
      const { pdflibAddPlaceholder } = await import("@signpdf/placeholder-pdf-lib");
      const { SUBFILTER_ETSI_CADES_DETACHED } = await import("@signpdf/utils");
      const signpdfMod = (await import("@signpdf/signpdf")) as { default?: SignPdf } & Partial<SignPdf>;
      const { P12Signer } = await import("@signpdf/signer-p12");
      const signpdf: SignPdf = signpdfMod.default ?? (signpdfMod as SignPdf);

      const pdfDoc = await PDFDocument.load(pdf);
      pdflibAddPlaceholder({
        pdfDoc,
        reason: "e-Tax Invoice (ETDA)",
        contactInfo: "",
        name: "",
        location: "",
        subFilter: SUBFILTER_ETSI_CADES_DETACHED,
      });
      const withPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
      const signer = new P12Signer(credential.pfx, { passphrase: credential.passphrase });
      const signed: Buffer = await signpdf.sign(withPlaceholder, signer);
      return new Uint8Array(signed);
    },
  };
}
