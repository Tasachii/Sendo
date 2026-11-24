import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { issueInvoice } from "../app/actions/invoices";
import { GET as invoicePdf } from "../app/api/invoices/[id]/pdf/route";
import { GET as whtPdf } from "../app/api/invoices/[id]/wht/route";

const db = new PrismaClient();
let companyId = "";
let customerId = "";
let userId = "";
let invoiceId = "";

beforeAll(async () => {
  const company = await db.company.create({
    data: {
      name: "ORIGINAL SELLER",
      taxId: "0105550000010",
      address: "ORIGINAL SELLER ADDRESS",
      branch: "ORIGINAL BRANCH",
      taxSettings: {
        create: { jobType: "transport_service", label: "ORIGINAL FREIGHT INCOME", vatRate: 0.07, whtRate: 0.03, vatApplicable: true },
      },
    },
  });
  companyId = company.id;
  const customer = await db.customer.create({
    data: {
      companyId,
      name: "ORIGINAL BUYER",
      taxId: "0105550000012",
      address: "ORIGINAL BUYER ADDRESS",
      branch: "ORIGINAL BRANCH",
      isVatRegistered: true,
    },
  });
  customerId = customer.id;
  const user = await db.user.create({
    data: { companyId, email: `pdf-flow-${Date.now()}@test.local`, passwordHash: "x", name: "owner", role: "OWNER" },
  });
  userId = user.id;
  const invoice = await db.invoice.create({
    data: {
      companyId,
      customerId,
      createdById: userId,
      number: "INV-PDF-FLOW",
      status: "DRAFT",
      jobType: "transport_service",
      subtotalSatang: 100_000,
      vatSatang: 7_000,
      whtSatang: 3_000,
      netSatang: 104_000,
      items: { create: { description: "FREIGHT", qty: 1, unitPriceSatang: 100_000, lineTotalSatang: 100_000 } },
    },
  });
  invoiceId = invoice.id;
  getServerSession.mockResolvedValue({
    user: { id: userId, companyId, role: "OWNER", name: "owner", email: "owner@test.local" },
  });
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { companyId } });
  await db.invoiceItem.deleteMany({ where: { invoice: { companyId } } });
  await db.invoice.deleteMany({ where: { companyId } });
  await db.customer.deleteMany({ where: { companyId } });
  await db.taxSetting.deleteMany({ where: { companyId } });
  await db.user.deleteMany({ where: { companyId } });
  await db.company.deleteMany({ where: { id: companyId } });
  await db.$disconnect();
});

describe("issued PDF snapshot round trip", () => {
  it("renders both PDFs from issue-time details after the same live rows change", async () => {
    await expect(issueInvoice(invoiceId)).resolves.toEqual({ ok: true, id: invoiceId });
    await db.company.update({ where: { id: companyId }, data: { name: "EDITED SELLER", address: "EDITED SELLER ADDRESS" } });
    await db.customer.update({ where: { id: customerId }, data: { name: "EDITED BUYER", address: "EDITED BUYER ADDRESS" } });
    await db.taxSetting.update({
      where: { companyId_jobType: { companyId, jobType: "transport_service" } },
      data: { label: "EDITED INCOME" },
    });

    const routeContext = { params: Promise.resolve({ id: invoiceId }) };
    const invoiceResponse = await invoicePdf(new Request(`http://test/api/invoices/${invoiceId}/pdf`), routeContext);
    const whtResponse = await whtPdf(new Request(`http://test/api/invoices/${invoiceId}/wht`), routeContext);
    const invoiceBytes = new Uint8Array(await invoiceResponse.arrayBuffer());
    const whtBytes = new Uint8Array(await whtResponse.arrayBuffer());
    expect(invoiceResponse.status).toBe(200);
    expect(whtResponse.status).toBe(200);
    expect(new TextDecoder().decode(invoiceBytes.slice(0, 4))).toBe("%PDF");
    expect(new TextDecoder().decode(whtBytes.slice(0, 4))).toBe("%PDF");

    const proofDirectory = process.env.SENDO_PDF_PROOF_DIR;
    if (proofDirectory) {
      await mkdir(proofDirectory, { recursive: true });
      await Promise.all([
        writeFile(path.join(proofDirectory, "issued-invoice-proof.pdf"), invoiceBytes),
        writeFile(path.join(proofDirectory, "issued-wht-proof.pdf"), whtBytes),
      ]);
    }
  });
});
