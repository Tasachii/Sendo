/**
 * e-Tax Invoice — Phase 3 SCAFFOLD ONLY (not wired up).
 *
 * Thailand's e-Tax Invoice & e-Receipt (ETDA) is a PDF/A-3 file with an embedded XML
 * payload conforming to ขมธอ.3-2560 v2.0, signed with a digital certificate issued to
 * the company. This is substantial work — certificate handling, XML schema, PDF/A-3
 * conformance — so this module only defines the interface and leaves the body as TODO.
 *
 * Reference: ETDA `e-TaxInvoice-PDFgen` (studied for format; not copied — that project is
 * C#/iTextSharp). Our PDFs already use the Sarabun font ETDA expects.
 */

export type ETaxParty = {
  name: string;
  taxId: string;
  branchCode: string; // "00000" = สำนักงานใหญ่
  address: string;
};

export type ETaxLine = {
  description: string;
  quantity: number;
  unitPriceSatang: number;
  lineTotalSatang: number;
};

export type ETaxDocument = {
  documentType: "388" | "80" | "81"; // 388 tax invoice, 80 debit note, 81 credit note
  number: string;
  issueDate: string; // ISO
  seller: ETaxParty;
  buyer: ETaxParty;
  lines: ETaxLine[];
  vatSatang: number;
  grandTotalSatang: number;
};

export type SigningCredential = {
  // PKCS#12 cert + password, or an HSM/cloud-signing handle.
  pfx: Buffer;
  passphrase: string;
};

/**
 * TODO(phase-3): build the ขมธอ.3-2560 XML, embed it in a PDF/A-3 container, and apply a
 * PAdES digital signature with `credential`. Until implemented this throws so callers can't
 * silently ship a non-compliant document.
 */
export async function buildSignedETaxPdf(
  _doc: ETaxDocument,
  _credential: SigningCredential
): Promise<Uint8Array> {
  throw new Error("e-Tax Invoice generation is not implemented yet (Phase 3). See lib/etax.ts.");
}
