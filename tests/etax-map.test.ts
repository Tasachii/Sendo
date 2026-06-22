import { describe, it, expect } from "vitest";
import { invoiceToETaxDocument, isETaxEligible, toBranchCode } from "../lib/etax-map";
import { validateETaxDocument } from "../lib/etax";

const company = { name: "บ. ขนส่ง จำกัด", taxId: "0105551234567", address: "กทม.", branch: "สำนักงานใหญ่" };
const customer = { name: "ลูกค้า", taxId: "0105552222333", address: "เชียงใหม่", branch: "สำนักงานใหญ่" };

function inv(overrides: Record<string, unknown> = {}) {
  return {
    docType: "TAX_INVOICE" as const,
    number: "INV-2026-0001",
    issueDate: new Date("2026-03-15T00:00:00Z"),
    vatSatang: 14_000,
    items: [{ description: "ค่าขนส่ง", qty: 2, unitPriceSatang: 100_000, discountSatang: 0, lineTotalSatang: 200_000 }],
    ...overrides,
  };
}

describe("etax-map", () => {
  it("maps a tax invoice to a valid 388 document", () => {
    const doc = invoiceToETaxDocument(inv(), company, customer);
    expect(doc.documentType).toBe("388");
    expect(doc.grandTotalSatang).toBe(214_000); // lineSum 200,000 + vat 14,000
    expect(validateETaxDocument(doc)).toEqual([]);
  });

  it("maps credit/debit notes to 81/80", () => {
    expect(invoiceToETaxDocument(inv({ docType: "CREDIT_NOTE" }), company, customer).documentType).toBe("81");
    expect(invoiceToETaxDocument(inv({ docType: "DEBIT_NOTE" }), company, customer).documentType).toBe("80");
  });

  it("collapses a discounted line to a net amount that still validates", () => {
    const doc = invoiceToETaxDocument(
      inv({ items: [{ description: "x", qty: 3, unitPriceSatang: 100_000, discountSatang: 50_000, lineTotalSatang: 250_000 }] }),
      company,
      customer
    );
    expect(doc.lines[0].quantity).toBe(1);
    expect(doc.lines[0].unitPriceSatang).toBe(250_000);
    expect(validateETaxDocument(doc)).toEqual([]); // identity lineTotal === qty×unitPrice holds
  });

  it("rejects non-VAT document types", () => {
    expect(isETaxEligible("QUOTATION")).toBe(false);
    expect(isETaxEligible("TAX_INVOICE")).toBe(true);
    expect(() => invoiceToETaxDocument(inv({ docType: "QUOTATION" }), company, customer)).toThrow();
  });

  it("derives the 5-digit branch code", () => {
    expect(toBranchCode("สำนักงานใหญ่")).toBe("00000");
    expect(toBranchCode("สาขา 12")).toBe("00012");
    expect(toBranchCode(null)).toBe("00000");
  });
});
