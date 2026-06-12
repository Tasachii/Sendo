import { describe, it, expect } from "vitest";
import { validateForIssue, type IssueCheckInput } from "../lib/poka-yoke";

const valid: IssueCheckInput = {
  company: { name: "บ. ขนส่ง", address: "กทม.", taxId: "0105551234567", branch: "สำนักงานใหญ่" },
  customer: { name: "ลูกค้า", address: "เชียงใหม่", branch: "สำนักงานใหญ่", taxId: "0105552222333", isVatRegistered: true },
  invoice: { number: "INV-2026-0001", issueDate: new Date() },
  items: [{ description: "ค่าขนส่ง", qty: 1, unitPriceSatang: 2000000 }],
};

describe("poka-yoke validateForIssue (มาตรา 86/4)", () => {
  it("passes a complete invoice", () => {
    expect(validateForIssue(valid)).toEqual([]);
  });

  it("blocks when buyer has no address", () => {
    const errs = validateForIssue({ ...valid, customer: { ...valid.customer, address: null } });
    expect(errs.some((e) => e.includes("ที่อยู่"))).toBe(true);
  });

  it("blocks VAT-registered buyer with no taxId", () => {
    const errs = validateForIssue({ ...valid, customer: { ...valid.customer, taxId: null } });
    expect(errs.some((e) => e.includes("เลขประจำตัวผู้เสียภาษี"))).toBe(true);
  });

  it("allows non-VAT buyer without taxId", () => {
    const errs = validateForIssue({ ...valid, customer: { ...valid.customer, taxId: null, isVatRegistered: false } });
    expect(errs).toEqual([]);
  });

  it("blocks empty line items and missing date", () => {
    const errs = validateForIssue({ ...valid, items: [], invoice: { number: "X", issueDate: null } });
    expect(errs.some((e) => e.includes("รายการ"))).toBe(true);
    expect(errs.some((e) => e.includes("วันที่"))).toBe(true);
  });
});
