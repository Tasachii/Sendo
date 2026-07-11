import { describe, it, expect } from "vitest";
import { registerSchema, customerSchema, invoiceItemSchema, documentDraftSchema, documentConversionSchema, isISOCalendarDate } from "../lib/validation";

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
