import { describe, it, expect, vi, beforeEach } from "vitest";

// Hermetic route tests: mock the tenant guard, the Prisma client, the PDF
// renderer, the Thai-font registration, and the PDF components themselves so we
// can (a) drive each status/auth branch and (b) capture the exact props the
// route hands the PDF component (role mapping + derived rate).
const { getSessionContext, dbInvoiceFindFirst, dbTaxSettingFindFirst, renderToBuffer } = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  dbInvoiceFindFirst: vi.fn(),
  dbTaxSettingFindFirst: vi.fn(),
  renderToBuffer: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({ getSessionContext }));
vi.mock("@/lib/db", () => ({
  db: {
    invoice: { findFirst: dbInvoiceFindFirst },
    taxSetting: { findFirst: dbTaxSettingFindFirst },
  },
}));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer }));
vi.mock("@/components/pdf/fonts", () => ({ registerThaiFont: vi.fn() }));
// keep the PDF components as plain markers so the route's JSX element carries the
// data prop through to renderToBuffer, where we read it back.
vi.mock("@/components/pdf/InvoicePDF", () => ({ InvoicePDF: () => null }));
vi.mock("@/components/pdf/WhtCertPDF", () => ({ WhtCertPDF: () => null }));

import { GET as pdfGET } from "../app/api/invoices/[id]/pdf/route";
import { GET as whtGET } from "../app/api/invoices/[id]/wht/route";

// the route passes <Component data={...} /> to renderToBuffer; read the data prop
// off the React element it was called with.
function renderedData(): Record<string, unknown> {
  const el = renderToBuffer.mock.calls.at(-1)?.[0] as { props?: { data?: Record<string, unknown> } };
  return el?.props?.data ?? {};
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = new Request("http://x/api/invoices/abc/pdf");

function baseInvoice(overrides: Record<string, unknown> = {}) {
  return {
    number: "INV-2026-0001",
    status: "SENT",
    jobType: "transport_service",
    issueDate: new Date("2026-03-15T00:00:00Z"),
    subtotalSatang: 2_000_000, // 20,000 baht
    vatSatang: 140_000,
    whtSatang: 60_000, // 3% of subtotal
    netSatang: 2_080_000,
    trackingNo: "TH123",
    note: null,
    company: { name: "ACME ขนส่ง", taxId: "0105550000010", address: "กทม.", branch: "สำนักงานใหญ่" },
    customer: { name: "ลูกค้า ก", taxId: "0105550000012", address: "เชียงใหม่", branch: "สำนักงานใหญ่" },
    items: [{ description: "ค่าขนส่ง", qty: 1, unitPriceSatang: 2_000_000, lineTotalSatang: 2_000_000 }],
    ...overrides,
  };
}

beforeEach(() => {
  getSessionContext.mockReset();
  dbInvoiceFindFirst.mockReset();
  dbTaxSettingFindFirst.mockReset();
  renderToBuffer.mockReset();
  renderToBuffer.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
});

describe("GET /api/invoices/[id]/pdf", () => {
  it("401 when unauthenticated", async () => {
    getSessionContext.mockResolvedValue(null);
    const res = await pdfGET(req, params("abc"));
    expect(res.status).toBe(401);
    expect(renderToBuffer).not.toHaveBeenCalled();
  });

  it("404 when the invoice is not found (or cross-tenant)", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    dbInvoiceFindFirst.mockResolvedValue(null);
    const res = await pdfGET(req, params("abc"));
    expect(res.status).toBe(404);
    // tenant scope is enforced in the where clause
    expect(dbInvoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "abc", companyId: "c1" } })
    );
  });

  it("400 when the invoice is still a DRAFT", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    dbInvoiceFindFirst.mockResolvedValue(baseInvoice({ status: "DRAFT" }));
    const res = await pdfGET(req, params("abc"));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("ต้องออกใบกำกับภาษีก่อน");
    expect(renderToBuffer).not.toHaveBeenCalled();
  });

  it("renders a SENT invoice with the right Content-Disposition filename", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    dbInvoiceFindFirst.mockResolvedValue(baseInvoice({ status: "SENT" }));
    const res = await pdfGET(req, params("abc"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="INV-2026-0001.pdf"');
    expect(renderToBuffer).toHaveBeenCalledTimes(1);
    // body is the rendered buffer
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes)).toContain("%PDF");
  });

  it("maps invoice data onto the InvoicePDF (company = seller, customer = buyer)", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    dbInvoiceFindFirst.mockResolvedValue(baseInvoice());
    await pdfGET(req, params("abc"));
    expect(renderedData()).toMatchObject({
      number: "INV-2026-0001",
      issueDate: "2026-03-15",
      company: { name: "ACME ขนส่ง", taxId: "0105550000010" },
      customer: { name: "ลูกค้า ก", taxId: "0105550000012" },
      subtotalSatang: 2_000_000,
    });
  });
});

describe("GET /api/invoices/[id]/wht", () => {
  it("401 when unauthenticated", async () => {
    getSessionContext.mockResolvedValue(null);
    const res = await whtGET(req, params("abc"));
    expect(res.status).toBe(401);
  });

  it("404 when the invoice is not found", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    dbInvoiceFindFirst.mockResolvedValue(null);
    const res = await whtGET(req, params("abc"));
    expect(res.status).toBe(404);
  });

  it("400 when the invoice is a DRAFT", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    dbInvoiceFindFirst.mockResolvedValue(baseInvoice({ status: "DRAFT" }));
    const res = await whtGET(req, params("abc"));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("ต้องออกใบกำกับภาษีก่อน");
  });

  it("400 when there is no withholding (whtSatang <= 0)", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    dbInvoiceFindFirst.mockResolvedValue(baseInvoice({ whtSatang: 0 }));
    const res = await whtGET(req, params("abc"));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("ไม่มีการหัก ณ ที่จ่าย");
    expect(renderToBuffer).not.toHaveBeenCalled();
  });

  it("renders with the WHT-prefixed filename", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    dbInvoiceFindFirst.mockResolvedValue(baseInvoice());
    dbTaxSettingFindFirst.mockResolvedValue({ label: "ค่าขนส่ง" });
    const res = await whtGET(req, params("abc"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="WHT-INV-2026-0001.pdf"');
  });

  it("maps roles: withholder = customer (payer), payee = company (us)", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    dbInvoiceFindFirst.mockResolvedValue(baseInvoice());
    dbTaxSettingFindFirst.mockResolvedValue({ label: "ค่าขนส่ง" });
    await whtGET(req, params("abc"));
    expect(renderedData()).toMatchObject({
      // the customer withholds and pays us → customer is the withholder
      withholder: { name: "ลูกค้า ก", taxId: "0105550000012" },
      // our company is the one being withheld from → company is the payee
      payee: { name: "ACME ขนส่ง", taxId: "0105550000010" },
      incomeLabel: "ค่าขนส่ง",
      baseSatang: 2_000_000,
      whtSatang: 60_000,
    });
  });

  it("derives whtRatePct from stored whtSatang/subtotalSatang (A13)", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    // 60,000 / 2,000,000 = 3%
    dbInvoiceFindFirst.mockResolvedValue(baseInvoice({ whtSatang: 60_000, subtotalSatang: 2_000_000 }));
    dbTaxSettingFindFirst.mockResolvedValue({ label: "ค่าขนส่ง" });
    await whtGET(req, params("abc"));
    expect(renderedData().whtRatePct).toBe(3);
  });

  it("the derived rate is STABLE even when the live TaxSetting changed post-issue (A13)", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    // stored amounts say 5% (100,000 / 2,000,000) — what was actually withheld at issue
    dbInvoiceFindFirst.mockResolvedValue(baseInvoice({ whtSatang: 100_000, subtotalSatang: 2_000_000 }));
    // …but the company has since edited the live rate to 1% — must be IGNORED
    dbTaxSettingFindFirst.mockResolvedValue({ label: "ค่าขนส่ง", whtRate: 0.01 });
    await whtGET(req, params("abc"));
    expect(renderedData().whtRatePct).toBe(5);
  });

  it("guards divide-by-zero: subtotalSatang = 0 → rate 0%", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    dbInvoiceFindFirst.mockResolvedValue(baseInvoice({ subtotalSatang: 0, whtSatang: 5_000 }));
    dbTaxSettingFindFirst.mockResolvedValue({ label: "ค่าขนส่ง" });
    await whtGET(req, params("abc"));
    expect(renderedData().whtRatePct).toBe(0);
  });

  it("falls back to a default income label when no TaxSetting exists", async () => {
    getSessionContext.mockResolvedValue({ companyId: "c1" });
    dbInvoiceFindFirst.mockResolvedValue(baseInvoice());
    dbTaxSettingFindFirst.mockResolvedValue(null);
    await whtGET(req, params("abc"));
    expect(renderedData().incomeLabel).toBe("ค่าขนส่ง/บริการ");
  });
});
