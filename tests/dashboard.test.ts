import { describe, expect, it } from "vitest";
import { dashboardMetrics, type DashboardDocument } from "../lib/dashboard";

const july = new Date(2026, 6, 1);
const august = new Date(2026, 7, 1);
const row = (patch: Partial<DashboardDocument>): DashboardDocument => ({
  id: "base", sourceId: null, docType: "TAX_INVOICE", status: "SENT",
  issueDate: new Date(2026, 6, 11), netSatang: 107_000, ...patch,
});

describe("dashboardMetrics reporting policy", () => {
  it("excludes drafts and voids from issued money", () => {
    const result = dashboardMetrics([
      row({ id: "issued" }), row({ id: "draft", status: "DRAFT" }), row({ id: "void", status: "VOID" }),
    ], july, august);
    expect(result.issuedThisMonth).toEqual({ count: 1, netSatang: 107_000 });
  });

  it("counts only the latest billing leaf in a conversion lineage", () => {
    const result = dashboardMetrics([
      row({ id: "invoice" }),
      row({ id: "receipt", sourceId: "invoice", docType: "RECEIPT", status: "PAID" }),
    ], july, august);
    expect(result.issuedThisMonth).toEqual({ count: 1, netSatang: 107_000 });
    expect(result.unpaid).toEqual({ count: 0, netSatang: 0 });
  });

  it("keeps counting an issued source while its derived document is still a draft", () => {
    const result = dashboardMetrics([
      row({ id: "invoice" }),
      row({ id: "receipt", sourceId: "invoice", docType: "RECEIPT", status: "DRAFT" }),
    ], july, august);
    expect(result.issuedThisMonth).toEqual({ count: 1, netSatang: 107_000 });
  });

  it("uses an exclusive month end boundary", () => {
    const result = dashboardMetrics([row({ id: "next", issueDate: august })], july, august);
    expect(result.issuedThisMonth.count).toBe(0);
  });
});
