import Link from "next/link";
import { requireWriter, db } from "@/lib/tenant";
import { ALL_DOC_TYPES, docMeta } from "@/lib/docTypes";
import type { DocType } from "@prisma/client";
import { DocumentForm } from "./DocumentForm";

const VALID = new Set(ALL_DOC_TYPES.map((m) => m.type));

const BLURB: Record<DocType, string> = {
  QUOTATION: "เสนอราคาให้ลูกค้าก่อนเริ่มงาน — แปลงเป็นใบแจ้งหนี้/ใบกำกับภาษีได้ในคลิกเดียว",
  BILLING_NOTE: "เรียกเก็บเงินตามงวด ก่อนออกใบกำกับภาษีเต็มรูป",
  TAX_INVOICE: "ใบกำกับภาษีเต็มรูป (มาตรา 86/4) สำหรับผู้ซื้อที่ต้องการเครดิตภาษี",
  RECEIPT: "ออกเมื่อรับเงินแล้ว — ใบเสร็จรับเงิน/ใบกำกับภาษีในใบเดียว",
  RECEIPT_SUBSTITUTE: "ใช้แทนใบเสร็จเมื่อจ่ายเงินให้ผู้ที่ออกใบเสร็จให้ไม่ได้",
  CREDIT_NOTE: "ลดยอดหนี้จากใบกำกับภาษีเดิม (สินค้าคืน/ลดราคา)",
  DEBIT_NOTE: "เพิ่มยอดหนี้จากใบกำกับภาษีเดิม (เรียกเก็บเพิ่ม)",
};

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const ctx = await requireWriter();

  // No (or invalid) type → show the chooser.
  if (!type || !VALID.has(type as DocType)) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">สร้างเอกสารใหม่</h1>
          <p className="text-sm text-muted">เลือกประเภทเอกสารที่ต้องการออก</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_DOC_TYPES.map((m) => (
            <Link key={m.type} href={`/documents/new?type=${m.type}`}
              className="group rounded-xl bg-surface p-5 ring-1 ring-line transition hover:ring-accent">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{m.emoji}</span>
                <span className="font-semibold group-hover:text-accent">{m.short}</span>
              </div>
              <p className="mt-2 text-sm text-muted">{BLURB[m.type]}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const docType = type as DocType;
  const [customers, services, taxSettings] = await Promise.all([
    db.customer.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    db.service.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    db.taxSetting.findMany({ where: { companyId: ctx.companyId }, orderBy: { jobType: "asc" } }),
  ]);

  if (customers.length === 0 || taxSettings.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">สร้าง{docMeta(docType).short}</h1>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          ต้องมีลูกค้าและการตั้งค่าภาษีอย่างน้อย 1 รายการก่อน —{" "}
          <Link href="/customers" className="font-medium underline">เพิ่มลูกค้า</Link>
        </div>
      </div>
    );
  }

  return (
    <DocumentForm
      docType={docType}
      customers={customers.map((c) => ({ id: c.id, name: c.name, isVatRegistered: c.isVatRegistered, taxId: c.taxId, hasAddress: !!c.address }))}
      services={services.map((s) => ({ id: s.id, name: s.name, defaultJobType: s.defaultJobType, defaultUnitPriceBaht: s.defaultUnitPriceSatang / 100 }))}
      taxSettings={taxSettings.map((t) => ({ jobType: t.jobType, label: t.label, vatRate: t.vatRate, whtRate: t.whtRate, vatApplicable: t.vatApplicable }))}
    />
  );
}
