import { describe, it, expect } from "vitest";
import { registerSchema, customerSchema, invoiceItemSchema, documentDraftSchema, documentConversionSchema, isISOCalendarDate, isValidThaiTaxId } from "../lib/validation";

const baseRegister = {
  companyName: "บ. ขนส่ง",
  companyTaxId: "0105551234567",
  companyAddress: "กทม.",
  ownerName: "เจ้าของ",
  email: "owner@test.co",
  password: "secret12",
};

describe("registerSchema.companyTaxId (A5 — exactly 13 digits)", () => {
  it("accepts exactly 13 digits", () => {
    expect(registerSchema.safeParse(baseRegister).success).toBe(true);
  });

  it("rejects 12 digits", () => {
    const r = registerSchema.safeParse({ ...baseRegister, companyTaxId: "010555123456" });
    expect(r.success).toBe(false);
  });

  it("rejects 14 digits", () => {
    const r = registerSchema.safeParse({ ...baseRegister, companyTaxId: "01055512345678" });
    expect(r.success).toBe(false);
  });

  it("rejects 13 chars with a trailing letter", () => {
    const r = registerSchema.safeParse({ ...baseRegister, companyTaxId: "123456789012a" });
    expect(r.success).toBe(false);
  });

  it("rejects non-digit / alpha input", () => {
    expect(registerSchema.safeParse({ ...baseRegister, companyTaxId: "abcdefghijklm" }).success).toBe(false);
  });
});

describe("registerSchema other fields", () => {
  it("requires password >= 8 chars", () => {
    expect(registerSchema.safeParse({ ...baseRegister, password: "short7!" }).success).toBe(false);
  });

  it("requires a valid email", () => {
    expect(registerSchema.safeParse({ ...baseRegister, email: "not-an-email" }).success).toBe(false);
  });
});

describe("customerSchema.taxId (A6 — optional but format-checked when present)", () => {
  const base = { name: "ลูกค้า" };

  it("allows an absent taxId (non-VAT buyer)", () => {
    expect(customerSchema.safeParse(base).success).toBe(true);
  });

  it("allows an empty-string taxId", () => {
    expect(customerSchema.safeParse({ ...base, taxId: "" }).success).toBe(true);
  });

  it("accepts a valid 13-digit taxId", () => {
    expect(customerSchema.safeParse({ ...base, taxId: "0105552222333" }).success).toBe(true);
  });

  it("rejects a present-but-malformed taxId", () => {
    expect(customerSchema.safeParse({ ...base, taxId: "12345" }).success).toBe(false);
    expect(customerSchema.safeParse({ ...base, taxId: "0105552222333X" }).success).toBe(false);
  });
});

describe("invoiceItemSchema", () => {
  it("enforces qty > 0", () => {
    expect(invoiceItemSchema.safeParse({ description: "x", qty: 0, unitPriceBaht: 10 }).success).toBe(false);
    expect(invoiceItemSchema.safeParse({ description: "x", qty: -1, unitPriceBaht: 10 }).success).toBe(false);
    expect(invoiceItemSchema.safeParse({ description: "x", qty: 1.5, unitPriceBaht: 10 }).success).toBe(true);
  });

  it("rejects a negative unit price", () => {
    expect(invoiceItemSchema.safeParse({ description: "x", qty: 1, unitPriceBaht: -1 }).success).toBe(false);
  });

  it("defaults pricingMode to FLAT", () => {
    const r = invoiceItemSchema.parse({ description: "x", qty: 1, unitPriceBaht: 10 });
    expect(r.pricingMode).toBe("FLAT");
  });
});

describe("documentDraftSchema dates and legal note fields", () => {
  const base = {
    docType: "TAX_INVOICE", customerId: "c", jobType: "service", issueDate: "2026-07-11",
    items: [{ description: "x", qty: 1, unitPriceBaht: 1000 }], shipments: [],
  };

  it("strictly rejects impossible and malformed calendar dates", () => {
    expect(isISOCalendarDate("2024-02-29")).toBe(true);
    expect(isISOCalendarDate("2026-02-29")).toBe(false);
    expect(documentDraftSchema.safeParse({ ...base, issueDate: "not-a-date" }).success).toBe(false);
    expect(documentDraftSchema.safeParse({ ...base, issueDate: "2026-02-30" }).success).toBe(false);
  });

  it("rejects secondary dates before the issue date", () => {
    expect(documentDraftSchema.safeParse({ ...base, dueDate: "2026-07-10" }).success).toBe(false);
  });

  it.each(["CREDIT_NOTE", "DEBIT_NOTE"] as const)("requires reason and reference for %s", (docType) => {
    expect(documentDraftSchema.safeParse({ ...base, docType, reason: "", refDocNumber: "" }).success).toBe(false);
    expect(documentDraftSchema.safeParse({ ...base, docType, reason: "แก้ไขยอด", refDocNumber: "INV-1" }).success).toBe(true);
  });
});

describe("documentConversionSchema", () => {
  it.each(["CREDIT_NOTE", "DEBIT_NOTE"] as const)("requires a trimmed reason for %s", (target) => {
    expect(documentConversionSchema.safeParse({ target, reason: "   " }).success).toBe(false);
    expect(documentConversionSchema.safeParse({ target, reason: "แก้ไขยอด" }).success).toBe(true);
  });

  it("does not require a reason for ordinary conversion targets", () => {
    expect(documentConversionSchema.safeParse({ target: "RECEIPT" }).success).toBe(true);
  });
});

// ── Thai tax-ID check digit (มอด 11) ──────────────────────────────────────────
// Every Thai 13-digit เลขประจำตัวผู้เสียภาษี (personal or นิติบุคคล) carries a mod-11
// check digit as its 13th digit. A pure length/regex check (the old A6 rule) lets a
// single-digit typo through; the checksum catches it on input (poka-yoke).
describe("isValidThaiTaxId — mod-11 check digit", () => {
  it.each([
    "0105558083491", // real นิติบุคคล TIN (check digit 1)
    "1101700230708", // personal ID form, valid check digit 8
    "0105551234567", // used elsewhere in the fixtures — genuinely valid
  ])("accepts a checksum-valid id: %s", (id) => {
    expect(isValidThaiTaxId(id)).toBe(true);
  });

  it.each([
    "0105558083490", // last digit off by one → wrong checksum
    "1101700230705", // wrong check digit (valid is …708)
    "0105550000010", // wrong check digit (valid is …015)
  ])("rejects a 13-digit id with a bad check digit: %s", (id) => {
    expect(isValidThaiTaxId(id)).toBe(false);
  });

  it.each([
    "",
    "123",
    "010555123456", // 12 digits
    "01055512345678", // 14 digits
    "123456789012a", // trailing non-digit
    "abcdefghijklm",
  ])("rejects a malformed id: %s", (id) => {
    expect(isValidThaiTaxId(id)).toBe(false);
  });
});

describe("schemas enforce the tax-ID checksum on input (SE4)", () => {
  it("registerSchema rejects a 13-digit companyTaxId with a bad checksum", () => {
    expect(registerSchema.safeParse({ ...baseRegister, companyTaxId: "0105558083490" }).success).toBe(false);
  });

  it("registerSchema accepts a checksum-valid companyTaxId", () => {
    expect(registerSchema.safeParse({ ...baseRegister, companyTaxId: "0105558083491" }).success).toBe(true);
  });

  it("customerSchema rejects a present-but-bad-checksum taxId", () => {
    expect(customerSchema.safeParse({ name: "ลูกค้า", taxId: "0105550000010" }).success).toBe(false);
  });

  it("customerSchema still allows an absent taxId (non-VAT buyer)", () => {
    expect(customerSchema.safeParse({ name: "ลูกค้า" }).success).toBe(true);
    expect(customerSchema.safeParse({ name: "ลูกค้า", taxId: "" }).success).toBe(true);
  });

  it("customerSchema accepts a checksum-valid taxId", () => {
    expect(customerSchema.safeParse({ name: "ลูกค้า", taxId: "0105552222333" }).success).toBe(true);
  });
});
