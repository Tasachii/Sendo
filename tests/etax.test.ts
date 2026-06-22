import { describe, it, expect, vi } from "vitest";
import {
  validateETaxDocument,
  buildETaxXml,
  buildSignedETaxPdf,
  type ETaxDocument,
  type ETaxDeps,
  type SigningCredential,
} from "../lib/etax";

// A fully valid type-388 tax invoice: one line of 2 × 1,000.00 = 2,000.00, VAT 7% = 140.00,
// grand total 2,140.00 (all in satang).
function validDoc(overrides: Partial<ETaxDocument> = {}): ETaxDocument {
  return {
    documentType: "388",
    number: "INV-2026-0001",
    issueDate: "2026-01-15",
    seller: { name: "บ. ขนส่ง จำกัด", taxId: "0105551234567", branchCode: "00000", address: "กทม." },
    buyer: { name: "ลูกค้า เอ", taxId: "0105552222333", branchCode: "00000", address: "เชียงใหม่" },
    lines: [
      { description: "ค่าขนส่ง", quantity: 2, unitPriceSatang: 100_000, lineTotalSatang: 200_000 },
    ],
    vatSatang: 14_000,
    grandTotalSatang: 214_000,
    ...overrides,
  };
}

describe("validateETaxDocument", () => {
  it("returns [] for a fully valid 388 document", () => {
    expect(validateETaxDocument(validDoc())).toEqual([]);
  });

  it("accepts documentType 388/80/81 and rejects others", () => {
    expect(validateETaxDocument(validDoc({ documentType: "80" }))).toEqual([]);
    expect(validateETaxDocument(validDoc({ documentType: "81" }))).toEqual([]);
    const bad = validateETaxDocument(validDoc({ documentType: "999" as ETaxDocument["documentType"] }));
    expect(bad.some((p) => p.includes("documentType must be one of 388/80/81"))).toBe(true);
  });

  it("rejects a non-ISO or empty issueDate", () => {
    expect(validateETaxDocument(validDoc({ issueDate: "2026/01/01" })).some((p) => p.includes("issueDate"))).toBe(true);
    expect(validateETaxDocument(validDoc({ issueDate: "" })).some((p) => p.includes("issueDate"))).toBe(true);
  });

  it("enforces a 13-digit taxId on BOTH seller and buyer", () => {
    const sellerBad = validateETaxDocument(validDoc({ seller: { ...validDoc().seller, taxId: "010555123456" } }));
    expect(sellerBad.some((p) => p.includes("seller: taxId must be 13 digits"))).toBe(true);

    const buyerLetters = validateETaxDocument(validDoc({ buyer: { ...validDoc().buyer, taxId: "010555123456X" } }));
    expect(buyerLetters.some((p) => p.includes("buyer: taxId must be 13 digits"))).toBe(true);

    expect(validateETaxDocument(validDoc())).toEqual([]); // exactly 13 accepted
  });

  it("requires a 5-digit branchCode", () => {
    expect(validateETaxDocument(validDoc({ seller: { ...validDoc().seller, branchCode: "0" } })).some((p) => p.includes("branchCode must be 5 digits"))).toBe(true);
    expect(validateETaxDocument(validDoc({ seller: { ...validDoc().seller, branchCode: "00000" } }))).toEqual([]);
  });

  it("requires at least one line item", () => {
    expect(validateETaxDocument(validDoc({ lines: [] })).some((p) => p.includes("at least one line item is required"))).toBe(true);
  });

  it("rejects bad per-line fields (description / quantity / price)", () => {
    const noDesc = validateETaxDocument(validDoc({ lines: [{ description: "  ", quantity: 1, unitPriceSatang: 100, lineTotalSatang: 100 }] }));
    expect(noDesc.some((p) => p.includes("line 1: description is required"))).toBe(true);

    const zeroQty = validateETaxDocument(validDoc({ lines: [{ description: "x", quantity: 0, unitPriceSatang: 100, lineTotalSatang: 0 }] }));
    expect(zeroQty.some((p) => p.includes("line 1: quantity must be > 0"))).toBe(true);

    const negPrice = validateETaxDocument(validDoc({ lines: [{ description: "x", quantity: 1, unitPriceSatang: -1, lineTotalSatang: -1 }] }));
    expect(negPrice.some((p) => p.includes("line 1: unitPriceSatang must be >= 0"))).toBe(true);
  });

  it("reports a line-total that doesn't reconcile with qty × unitPrice", () => {
    const doc = validDoc({
      lines: [{ description: "ค่าขนส่ง", quantity: 2, unitPriceSatang: 100_000, lineTotalSatang: 199_999 }],
      grandTotalSatang: 213_999,
    });
    expect(validateETaxDocument(doc).some((p) => p.includes("line 1: lineTotal"))).toBe(true);
  });

  it("reports a grand-total that doesn't reconcile with lineSum + vat", () => {
    const doc = validDoc({ grandTotalSatang: 999_999 });
    expect(validateETaxDocument(doc).some((p) => p.includes("grandTotal"))).toBe(true);
  });

  it("reports a negative vatSatang", () => {
    const doc = validDoc({ vatSatang: -1, grandTotalSatang: 199_999 });
    expect(validateETaxDocument(doc).some((p) => p.includes("vatSatang must be >= 0"))).toBe(true);
  });
});

describe("buildETaxXml", () => {
  it("throws on an invalid document with the aggregated problem list", () => {
    expect(() => buildETaxXml(validDoc({ documentType: "999" as ETaxDocument["documentType"] }))).toThrow(/Invalid e-Tax document/);
  });

  it("escapes XML-significant characters in free text (injection-safe)", () => {
    const doc = validDoc({
      lines: [{ description: `A & B <x> "q" 'z'`, quantity: 1, unitPriceSatang: 100, lineTotalSatang: 100 }],
      vatSatang: 0,
      grandTotalSatang: 100,
    });
    const xml = buildETaxXml(doc);
    expect(xml).toContain("A &amp; B &lt;x&gt; &quot;q&quot; &apos;z&apos;");
    // no raw injected element leaks through
    expect(xml).not.toContain("<x>");
  });

  it("formats the Summary LineTotal as the sum of line totals with 2 decimals", () => {
    const doc = validDoc({
      lines: [
        { description: "a", quantity: 1, unitPriceSatang: 100_000, lineTotalSatang: 100_000 },
        { description: "b", quantity: 1, unitPriceSatang: 50_000, lineTotalSatang: 50_000 },
      ],
      vatSatang: 10_500,
      grandTotalSatang: 160_500,
    });
    const xml = buildETaxXml(doc);
    expect(xml).toContain(`<LineTotal currencyID="THB">1500.00</LineTotal>`); // 150,000 satang
    expect(xml).toContain(`<TaxAmount currencyID="THB">105.00</TaxAmount>`);
    expect(xml).toContain(`<GrandTotal currencyID="THB">1605.00</GrandTotal>`);
  });

  it("numbers line sequences 1-based and ascending", () => {
    const doc = validDoc({
      lines: [
        { description: "a", quantity: 1, unitPriceSatang: 100, lineTotalSatang: 100 },
        { description: "b", quantity: 1, unitPriceSatang: 100, lineTotalSatang: 100 },
      ],
      vatSatang: 0,
      grandTotalSatang: 200,
    });
    const xml = buildETaxXml(doc);
    expect(xml).toContain("<SequenceNo>1</SequenceNo>");
    expect(xml).toContain("<SequenceNo>2</SequenceNo>");
    expect(xml.indexOf("<SequenceNo>1</SequenceNo>")).toBeLessThan(xml.indexOf("<SequenceNo>2</SequenceNo>"));
  });

  it("emits the document header fields (type / id)", () => {
    const xml = buildETaxXml(validDoc());
    expect(xml).toContain("<DocumentType>388</DocumentType>");
    expect(xml).toContain("<ID>INV-2026-0001</ID>");
    expect(xml).toContain("<Seller>");
    expect(xml).toContain("<Buyer>");
  });
});

describe("buildSignedETaxPdf", () => {
  const credential: SigningCredential = { pfx: Buffer.from("fake-pfx"), passphrase: "secret" };

  it("throws when deps are omitted", async () => {
    await expect(buildSignedETaxPdf(validDoc(), credential)).rejects.toThrow(/e-Tax signing not configured/);
  });

  it("throws when credential pfx is empty or passphrase missing", async () => {
    const deps: ETaxDeps = {
      embedInPdfA3: vi.fn(async () => new Uint8Array([1])),
      sign: vi.fn(async () => new Uint8Array([2])),
    };
    await expect(buildSignedETaxPdf(validDoc(), { pfx: Buffer.alloc(0), passphrase: "x" }, deps)).rejects.toThrow(/PKCS#12 certificate/);
    await expect(buildSignedETaxPdf(validDoc(), { pfx: Buffer.from("x"), passphrase: "" }, deps)).rejects.toThrow(/PKCS#12 certificate/);
  });

  it("embeds the built XML then signs that PDF and returns the signer's bytes", async () => {
    const builtPdf = new Uint8Array([10, 20, 30]);
    const signed = new Uint8Array([99]);
    const deps: ETaxDeps = {
      embedInPdfA3: vi.fn(async () => builtPdf),
      sign: vi.fn(async () => signed),
    };
    const out = await buildSignedETaxPdf(validDoc(), credential, deps);
    expect(out).toBe(signed);

    const xmlArg = (deps.embedInPdfA3 as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(xmlArg).toContain("<ID>INV-2026-0001</ID>");
    expect(deps.sign).toHaveBeenCalledWith(builtPdf, credential);
  });
});
