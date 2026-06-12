import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatBaht } from "@/lib/money";

export type InvoicePdfData = {
  number: string;
  issueDate: string;
  company: { name: string; taxId: string; address: string; branch: string };
  customer: { name: string; taxId: string | null; address: string | null; branch: string };
  items: { description: string; qty: number; unitPriceSatang: number; lineTotalSatang: number }[];
  subtotalSatang: number;
  vatSatang: number;
  whtSatang: number;
  netSatang: number;
  trackingNo: string | null;
  note: string | null;
};

const s = StyleSheet.create({
  page: { fontFamily: "Sarabun", fontSize: 10, padding: 32, color: "#0f172a" },
  center: { textAlign: "center" },
  title: { fontSize: 16, fontWeight: "bold" },
  sub: { fontSize: 9, color: "#475569" },
  row: { flexDirection: "row" },
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
  cTotal: { flex: 2, textAlign: "right" },
  totals: { width: 220, marginLeft: "auto", marginTop: 10 },
  tline: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  net: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#cbd5e1", paddingTop: 4, marginTop: 2 },
  sign: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  signbox: { width: 200, textAlign: "center" },
  signline: { borderTopWidth: 1, borderTopColor: "#94a3b8", marginTop: 28, paddingTop: 3, fontSize: 9 },
});

export function InvoicePDF({ data }: { data: InvoicePdfData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Field 1: the words ใบกำกับภาษี are present (template-enforced) */}
        <View style={s.center}>
          <Text style={s.title}>ใบกำกับภาษี / ใบแจ้งหนี้</Text>
          <Text style={s.sub}>(ต้นฉบับ / Original)</Text>
        </View>

        <View style={[s.between, s.mt12]}>
          <View style={[s.box, { marginRight: 6 }]}>
            <Text style={s.label}>ผู้ขาย / ผู้ประกอบการจดทะเบียน</Text>
            <Text style={s.bold}>{data.company.name}</Text>
            <Text>{data.company.address}</Text>
            <Text>เลขประจำตัวผู้เสียภาษี: {data.company.taxId}</Text>
            <Text>สาขา: {data.company.branch}</Text>
          </View>
          <View style={[s.box, { marginLeft: 6 }]}>
            <Text style={s.label}>ลูกค้า / ผู้ซื้อ</Text>
            <Text style={s.bold}>{data.customer.name}</Text>
            <Text>{data.customer.address || "-"}</Text>
            <Text>เลขประจำตัวผู้เสียภาษี: {data.customer.taxId || "-"}</Text>
            <Text>สาขา: {data.customer.branch}</Text>
          </View>
        </View>

        <View style={[s.between, s.mt8]}>
          <Text>เลขที่: <Text style={s.bold}>{data.number}</Text></Text>
          <Text>วันที่: {data.issueDate}</Text>
          {data.trackingNo ? <Text>Tracking: {data.trackingNo}</Text> : <Text> </Text>}
        </View>

        {/* line items */}
        <View style={s.mt12}>
          <View style={s.th}>
            <Text style={s.cDesc}>รายการ</Text>
            <Text style={s.cQty}>จำนวน</Text>
            <Text style={s.cPrice}>ราคา/หน่วย</Text>
            <Text style={s.cTotal}>จำนวนเงิน</Text>
          </View>
          {data.items.map((it, i) => (
            <View style={s.td} key={i}>
              <Text style={s.cDesc}>{it.description}</Text>
              <Text style={s.cQty}>{it.qty}</Text>
              <Text style={s.cPrice}>{formatBaht(it.unitPriceSatang)}</Text>
              <Text style={s.cTotal}>{formatBaht(it.lineTotalSatang)}</Text>
            </View>
          ))}
        </View>

        {/* Field 6: VAT shown separately from the goods/service amount */}
        <View style={s.totals}>
          <View style={s.tline}><Text>มูลค่าสินค้า/บริการ</Text><Text>{formatBaht(data.subtotalSatang)}</Text></View>
          <View style={s.tline}><Text>ภาษีมูลค่าเพิ่ม (VAT)</Text><Text>{formatBaht(data.vatSatang)}</Text></View>
          <View style={s.tline}><Text>รวมเป็นเงิน</Text><Text>{formatBaht(data.subtotalSatang + data.vatSatang)}</Text></View>
          <View style={s.tline}><Text>หัก ณ ที่จ่าย</Text><Text>- {formatBaht(data.whtSatang)}</Text></View>
          <View style={s.net}><Text style={s.bold}>ยอดชำระสุทธิ</Text><Text style={s.bold}>{formatBaht(data.netSatang)} บาท</Text></View>
        </View>

        {data.note ? <Text style={[s.sub, s.mt12]}>หมายเหตุ: {data.note}</Text> : null}

        <View style={s.sign}>
          <View style={s.signbox}><Text style={s.signline}>ผู้รับสินค้า/บริการ</Text></View>
          <View style={s.signbox}><Text style={s.signline}>ผู้มีอำนาจลงนาม ({data.company.name})</Text></View>
        </View>
      </Page>
    </Document>
  );
}
