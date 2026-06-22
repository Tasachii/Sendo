/**
 * e-Tax Invoice (Thailand, ETDA) — Phase 3.
 *
 * Thailand's e-Tax Invoice & e-Receipt is a PDF/A-3 file carrying an embedded XML payload
 * conforming to **ขมธอ.3-2560 v2.0**, digitally signed (PAdES) with a certificate issued to
 * the seller. Three pieces are involved:
 *   1. build the XML payload from our document model        ← implemented here (pure, tested)
 *   2. validate it is well-formed & internally consistent   ← implemented here (pure, tested)
 *   3. embed XML in a PDF/A-3 container and PAdES-sign it    ← injectable (needs a real cert + libs)
 *
 * Step 3 needs a real PKCS#12 certificate and a PDF/A-3 + signing library, so it is modelled as
 * an injectable dependency (`ETaxDeps`). Production wires a real signer; tests inject a fake.
 * Until a signer is provided, `buildSignedETaxPdf` throws rather than silently shipping a
 * non-compliant document.
 *
 * NOTE: the XML element names below follow the documented ขมธอ.3-2560 structure (a UBL/CII-style
 * tax invoice). They MUST be validated against the official XSD before real submission — treat the
 * tag set as the integration point, not as certified-final.
 *
 * Reference: ETDA `e-TaxInvoice-PDFgen` (studied for format; not copied — that project is C#/iTextSharp).
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
  issueDate: string; // ISO (YYYY-MM-DD or full ISO)
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

/** Injectable side-effecting steps. Production supplies real implementations; tests fake them. */
export interface ETaxDeps {
  /** Render the XML into a PDF/A-3 container with the XML embedded as an attachment. */
  embedInPdfA3(xml: string, doc: ETaxDocument): Promise<Uint8Array>;
  /** Apply a PAdES digital signature using the credential. */
  sign(pdf: Uint8Array, credential: SigningCredential): Promise<Uint8Array>;
}

const DOC_TYPES = new Set(["388", "80", "81"]);
const satang = (s: number) => (s / 100).toFixed(2);
const xmlEsc = (v: string) =>
  String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));

function validateParty(role: string, p: ETaxParty | undefined, out: string[]) {
  if (!p) { out.push(`${role}: missing`); return; }
  if (!p.name?.trim()) out.push(`${role}: name is required`);
  if (!/^\d{13}$/.test(p.taxId ?? "")) out.push(`${role}: taxId must be 13 digits`);
  if (!/^\d{5}$/.test(p.branchCode ?? "")) out.push(`${role}: branchCode must be 5 digits (e.g. "00000")`);
  if (!p.address?.trim()) out.push(`${role}: address is required`);
}

/**
 * Returns a list of problems; empty array means the document is valid to serialize.
 * Mirrors the app's poka-yoke stance: an invalid document can't be turned into XML.
 */
export function validateETaxDocument(doc: ETaxDocument): string[] {
  const out: string[] = [];
  if (!DOC_TYPES.has(doc.documentType)) out.push(`documentType must be one of 388/80/81`);
  if (!doc.number?.trim()) out.push("number is required");
  if (!/^\d{4}-\d{2}-\d{2}/.test(doc.issueDate ?? "")) out.push("issueDate must be ISO (YYYY-MM-DD)");
  validateParty("seller", doc.seller, out);
  validateParty("buyer", doc.buyer, out);

  if (!doc.lines?.length) {
    out.push("at least one line item is required");
  } else {
    doc.lines.forEach((l, i) => {
      if (!l.description?.trim()) out.push(`line ${i + 1}: description is required`);
      if (!(l.quantity > 0)) out.push(`line ${i + 1}: quantity must be > 0`);
      if (l.unitPriceSatang < 0) out.push(`line ${i + 1}: unitPriceSatang must be >= 0`);
      const expected = Math.round(l.quantity * l.unitPriceSatang);
      if (l.lineTotalSatang !== expected) out.push(`line ${i + 1}: lineTotal ${l.lineTotalSatang} != qty×unitPrice ${expected}`);
    });
    const lineSum = doc.lines.reduce((s, l) => s + l.lineTotalSatang, 0);
    if (doc.grandTotalSatang !== lineSum + doc.vatSatang) {
      out.push(`grandTotal ${doc.grandTotalSatang} != lineSum ${lineSum} + vat ${doc.vatSatang}`);
    }
  }
  if (doc.vatSatang < 0) out.push("vatSatang must be >= 0");
  return out;
}

function partyXml(tag: string, p: ETaxParty): string {
  return `  <${tag}>
    <Name>${xmlEsc(p.name)}</Name>
    <TaxID>${xmlEsc(p.taxId)}</TaxID>
    <BranchID>${xmlEsc(p.branchCode)}</BranchID>
    <Address>${xmlEsc(p.address)}</Address>
  </${tag}>`;
}

/**
 * Serialize an ETaxDocument to ขมธอ.3-2560-style XML. Throws if the document is invalid
 * (call `validateETaxDocument` first to get the full list of problems).
 */
export function buildETaxXml(doc: ETaxDocument): string {
  const problems = validateETaxDocument(doc);
  if (problems.length) throw new Error(`Invalid e-Tax document:\n- ${problems.join("\n- ")}`);

  const lineSum = doc.lines.reduce((s, l) => s + l.lineTotalSatang, 0);
  const lines = doc.lines
    .map(
      (l, i) => `    <LineItem>
      <SequenceNo>${i + 1}</SequenceNo>
      <Description>${xmlEsc(l.description)}</Description>
      <Quantity>${l.quantity}</Quantity>
      <UnitPrice currencyID="THB">${satang(l.unitPriceSatang)}</UnitPrice>
      <LineTotal currencyID="THB">${satang(l.lineTotalSatang)}</LineTotal>
    </LineItem>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ขมธอ.3-2560 v2.0 (structure follows ETDA documentation; validate against official XSD before filing) -->
<TaxInvoice>
  <DocumentHeader>
    <DocumentType>${doc.documentType}</DocumentType>
    <ID>${xmlEsc(doc.number)}</ID>
    <IssueDateTime>${xmlEsc(doc.issueDate)}</IssueDateTime>
  </DocumentHeader>
${partyXml("Seller", doc.seller)}
${partyXml("Buyer", doc.buyer)}
  <LineItems>
${lines}
  </LineItems>
  <Summary>
    <LineTotal currencyID="THB">${satang(lineSum)}</LineTotal>
    <TaxAmount currencyID="THB">${satang(doc.vatSatang)}</TaxAmount>
    <GrandTotal currencyID="THB">${satang(doc.grandTotalSatang)}</GrandTotal>
  </Summary>
</TaxInvoice>`;
}

/**
 * Full pipeline: validate → build XML → embed in PDF/A-3 → PAdES-sign.
 * Steps 3–4 are injected via `deps` (real signer in production, fake in tests). Without `deps`
 * this throws — we never emit an unsigned/non-compliant file silently.
 */
export async function buildSignedETaxPdf(
  doc: ETaxDocument,
  credential: SigningCredential,
  deps?: ETaxDeps
): Promise<Uint8Array> {
  const xml = buildETaxXml(doc); // throws on invalid doc
  if (!deps) {
    throw new Error(
      "e-Tax signing not configured: provide ETaxDeps (PDF/A-3 embedder + PAdES signer with a real " +
        "PKCS#12 certificate). XML payload built OK; only the sign/embed step is pending. See lib/etax.ts."
    );
  }
  if (!credential?.pfx?.length || !credential.passphrase) {
    throw new Error("e-Tax signing requires a PKCS#12 certificate (pfx) and passphrase.");
  }
  const pdf = await deps.embedInPdfA3(xml, doc);
  return deps.sign(pdf, credential);
}
