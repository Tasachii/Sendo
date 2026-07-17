import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { DocType } from "@prisma/client";
import { formatBaht } from "@/lib/money";
import { bahtText } from "@/lib/bahtText";
import { docMeta } from "@/lib/docTypes";

export type InvoicePdfData = {
  docType?: DocType; // defaults to TAX_INVOICE for the legacy path
  copy?: boolean; // true → print the สำเนา (copy) edition instead of the ต้นฉบับ (original)
  number: string;
  issueDate: string;
  secondaryDate?: { label: string; value: string } | null;
  company: { name: string; taxId: string; address: string; branch: string };
  customer: { name: string; taxId: string | null; address: string | null; branch: string };
  branding?: {
    logoDataUrl?: string | null;
    sealDataUrl?: string | null;
    signatureDataUrl?: string | null;
  } | null;
  items: { description: string; qty: number; unitPriceSatang: number; discountSatang?: number; lineTotalSatang: number }[];
  docDiscountSatang?: number;
  subtotalSatang: number;
  vatSatang: number;
  whtSatang: number;
  netSatang: number;
  trackingNo: string | null;
  note: string | null;
  paymentMethod?: string | null;
  payeeName?: string | null;
  reason?: string | null;
  refDocNumber?: string | null;
};

const s = StyleSheet.create({
  page: { fontFamily: "Sarabun", fontSize: 10, padding: 32, color: "#0f172a" },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 96, height: 48, objectFit: "contain" },
  titleWrap: { flex: 1, alignItems: "center" },
  title: { fontSize: 16, fontWeight: "bold" },
  sub: { fontSize: 9, color: "#475569" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  box: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4, padding: 8, flex: 1 },
  label: { fontSize: 8, color: "#64748b", marginBottom: 2 },
  bold: { fontWeight: "bold" },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
  th: { flexDirection: "row", backgroundColor: "#f1f5f9", paddingVertical: 5, paddingHorizontal: 6, fontWeight: "bold" },
  td: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  cDesc: { flex: 5 },
  cQty: { flex: 1.5, textAlign: "right" },
  cPrice: { flex: 2, textAlign: "right" },
  cDisc: { flex: 1.5, textAlign: "right" },
  cTotal: { flex: 2, textAlign: "right" },
  totals: { width: 240, marginLeft: "auto", marginTop: 10 },
  tline: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  net: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#cbd5e1", paddingTop: 4, marginTop: 2 },
  sign: { flexDirection: "row", justifyContent: "space-between", marginTop: 36 },
  signbox: { width: 200, textAlign: "center" },
  sealWrap: { alignItems: "center", height: 56, justifyContent: "flex-end" },
  seal: { position: "absolute", width: 72, height: 72, opacity: 0.85, objectFit: "contain" },
  signImg: { width: 120, height: 40, objectFit: "contain", marginBottom: 2 },
  signline: { borderTopWidth: 1, borderTopColor: "#94a3b8", marginTop: 4, paddingTop: 3, fontSize: 9 },
  noteTxt: { fontSize: 9, color: "#475569", marginTop: 12 },
  amountWords: { flexDirection: "row", justifyContent: "space-between", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 4, backgroundColor: "#f8fafc", paddingVertical: 5, paddingHorizontal: 8, marginTop: 10 },
  amountWordsLabel: { fontSize: 9, color: "#64748b" },
  amountWordsValue: { fontWeight: "bold", flex: 1, textAlign: "right", marginLeft: 8 },
});

export function InvoicePDF({ data }: { data: InvoicePdfData }) {
  const meta = docMeta(data.docType ?? "TAX_INVOICE");
  const brand = data.branding ?? {};
  const docDiscount = data.docDiscountSatang ?? 0;
  const lineSum = data.subtotalSatang + docDiscount;
  const hasLineDiscount = data.items.some((it) => (it.discountSatang ?? 0) > 0);
  const isSubstitute = meta.type === "RECEIPT_SUBSTITUTE";
  // Amount-in-words states the tax-inclusive grand total (มูลค่าสินค้า + VAT) — the
  // "รวมเป็นเงิน" figure. WHT is a separate settlement and does not reduce it.
  const grandTotalSatang = data.subtotalSatang + data.vatSatang;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* header: logo + title */}
        <View style={s.headRow}>
          <View style={{ width: 96 }}>{brand.logoDataUrl ? <Image style={s.logo} src={brand.logoDataUrl} /> : null}</View>
          <View style={s.titleWrap}>
            <Text style={s.title}>{meta.title}</Text>
            <Text style={s.sub}>{data.copy ? "(สำเนา / Copy)" : "(ต้นฉบับ / Original)"}</Text>
            {data.refDocNumber ? <Text style={s.sub}>อ้างอิงเอกสารเลขที่ {data.refDocNumber}</Text> : null}
          </View>
          <View style={{ width: 96 }} />
        </View>

        <View style={[s.between, s.mt12]}>
          <View style={[s.box, { marginRight: 6 }]}>
            <Text style={s.label}>{isSubstitute ? "ผู้จ่ายเงิน (บริษัทของเรา)" : "ผู้ขาย / ผู้ประกอบการจดทะเบียน"}</Text>
            <Text style={s.bold}>{data.company.name}</Text>
            <Text>{data.company.address}</Text>
            <Text>เลขประจำตัวผู้เสียภาษี: {data.company.taxId}</Text>
            <Text>สาขา: {data.company.branch}</Text>
          </View>
          <View style={[s.box, { marginLeft: 6 }]}>
            <Text style={s.label}>{isSubstitute ? "ผู้รับเงิน" : "ลูกค้า / ผู้ซื้อ"}</Text>
            <Text style={s.bold}>{isSubstitute && data.payeeName ? data.payeeName : data.customer.name}</Text>
            <Text>{data.customer.address || "-"}</Text>
            <Text>เลขประจำตัวผู้เสียภาษี: {data.customer.taxId || "-"}</Text>
            <Text>สาขา: {data.customer.branch}</Text>
          </View>
        </View>

        <View style={[s.between, s.mt8]}>
          <Text>เลขที่: <Text style={s.bold}>{data.number}</Text></Text>
          <Text>วันที่: {data.issueDate}</Text>
          {data.secondaryDate ? <Text>{data.secondaryDate.label}: {data.secondaryDate.value}</Text> : <Text> </Text>}
        </View>
        {data.paymentMethod ? <Text style={[s.sub, { marginTop: 2 }]}>วิธีชำระเงิน: {data.paymentMethod}</Text> : null}
        {data.reason ? <Text style={[s.sub, { marginTop: 2 }]}>เหตุผล: {data.reason}</Text> : null}

        {/* line items */}
        <View style={s.mt12}>
          <View style={s.th}>
            <Text style={s.cDesc}>รายการ</Text>
            <Text style={s.cQty}>จำนวน</Text>
            <Text style={s.cPrice}>ราคา/หน่วย</Text>
            {hasLineDiscount ? <Text style={s.cDisc}>ส่วนลด</Text> : null}
            <Text style={s.cTotal}>จำนวนเงิน</Text>
          </View>
          {data.items.map((it, i) => (
            <View style={s.td} key={i}>
              <Text style={s.cDesc}>{it.description}</Text>
              <Text style={s.cQty}>{it.qty}</Text>
              <Text style={s.cPrice}>{formatBaht(it.unitPriceSatang)}</Text>
              {hasLineDiscount ? <Text style={s.cDisc}>{(it.discountSatang ?? 0) > 0 ? `- ${formatBaht(it.discountSatang ?? 0)}` : "-"}</Text> : null}
              <Text style={s.cTotal}>{formatBaht(it.lineTotalSatang)}</Text>
            </View>
          ))}
        </View>

        {/* totals */}
        <View style={s.totals}>
          {docDiscount > 0 ? (
            <>
              <View style={s.tline}><Text>มูลค่ารวมรายการ</Text><Text>{formatBaht(lineSum)}</Text></View>
              <View style={s.tline}><Text>ส่วนลดท้ายบิล</Text><Text>- {formatBaht(docDiscount)}</Text></View>
            </>
          ) : null}
          <View style={s.tline}><Text>มูลค่าสินค้า/บริการ</Text><Text>{formatBaht(data.subtotalSatang)}</Text></View>
          {meta.isTaxDoc ? <View style={s.tline}><Text>ภาษีมูลค่าเพิ่ม (VAT)</Text><Text>{formatBaht(data.vatSatang)}</Text></View> : null}
          <View style={s.tline}><Text>รวมเป็นเงิน</Text><Text>{formatBaht(data.subtotalSatang + data.vatSatang)}</Text></View>
          {meta.showWht && data.whtSatang > 0 ? <View style={s.tline}><Text>หัก ณ ที่จ่าย</Text><Text>- {formatBaht(data.whtSatang)}</Text></View> : null}
          <View style={s.net}><Text style={s.bold}>{meta.type === "QUOTATION" ? "ยอดรวมทั้งสิ้น" : "ยอดชำระสุทธิ"}</Text><Text style={s.bold}>{formatBaht(data.netSatang)} บาท</Text></View>
        </View>

        {/* จำนวนเงินรวมทั้งสิ้น เป็นตัวอักษร — legally required on a Thai tax document */}
        <View style={s.amountWords}>
          <Text style={s.amountWordsLabel}>จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)</Text>
          <Text style={s.amountWordsValue}>({bahtText(grandTotalSatang)})</Text>
        </View>

        {data.note ? <Text style={s.noteTxt}>หมายเหตุ: {data.note}</Text> : null}

        <View style={s.sign}>
          <View style={s.signbox}>
            <Text style={s.signline}>{isSubstitute ? "ผู้รับเงิน" : "ผู้รับสินค้า/บริการ"}</Text>
          </View>
          <View style={s.signbox}>
            <View style={s.sealWrap}>
              {brand.sealDataUrl ? <Image style={s.seal} src={brand.sealDataUrl} /> : null}
              {brand.signatureDataUrl ? <Image style={s.signImg} src={brand.signatureDataUrl} /> : null}
            </View>
            <Text style={s.signline}>ผู้มีอำนาจลงนาม ({data.company.name})</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
