import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatBaht } from "@/lib/money";

// หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ).
// In a logistics payment the CUSTOMER pays us and withholds tax, so the customer
// is the withholder (ผู้จ่ายเงิน) and our company is the payee (ผู้ถูกหักภาษี).
// Sendo pre-fills the form from the invoice. (See DECISIONS.md.)
export type WhtPdfData = {
  number: string;
  issueDate: string;
  withholder: { name: string; taxId: string | null; address: string | null }; // customer
  payee: { name: string; taxId: string; address: string }; // our company
  incomeLabel: string;
  baseSatang: number;
  whtSatang: number;
  whtRatePct: number;
};

const s = StyleSheet.create({
  page: { fontFamily: "Sarabun", fontSize: 10, padding: 32, color: "#0f172a" },
  center: { textAlign: "center" },
  title: { fontSize: 15, fontWeight: "bold" },
  sub: { fontSize: 9, color: "#475569" },
  box: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 4, padding: 8, marginTop: 8 },
  label: { fontSize: 8, color: "#64748b", marginBottom: 2 },
  bold: { fontWeight: "bold" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  th: { flexDirection: "row", backgroundColor: "#f1f5f9", padding: 5, fontWeight: "bold" },
  td: { flexDirection: "row", padding: 5, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  c1: { flex: 5 }, c2: { flex: 2, textAlign: "right" }, c3: { flex: 2, textAlign: "right" },
  mt12: { marginTop: 12 },
  sign: { marginTop: 36, alignItems: "flex-end" },
  signbox: { width: 230, textAlign: "center" },
  signline: { borderTopWidth: 1, borderTopColor: "#94a3b8", marginTop: 28, paddingTop: 3, fontSize: 9 },
});

export function WhtCertPDF({ data }: { data: WhtPdfData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.center}>
          <Text style={s.title}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</Text>
          <Text style={s.sub}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร · อ้างอิงใบกำกับภาษีเลขที่ {data.number}</Text>
        </View>

        <View style={s.box}>
          <Text style={s.label}>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (ผู้จ่ายเงิน)</Text>
          <Text style={s.bold}>{data.withholder.name}</Text>
          <Text>{data.withholder.address || "-"}</Text>
          <Text>เลขประจำตัวผู้เสียภาษี: {data.withholder.taxId || "-"}</Text>
        </View>

        <View style={s.box}>
          <Text style={s.label}>ผู้ถูกหักภาษี ณ ที่จ่าย (ผู้รับเงิน)</Text>
          <Text style={s.bold}>{data.payee.name}</Text>
          <Text>{data.payee.address}</Text>
          <Text>เลขประจำตัวผู้เสียภาษี: {data.payee.taxId}</Text>
        </View>

        <View style={s.mt12}>
          <View style={s.th}>
            <Text style={s.c1}>ประเภทเงินได้</Text>
            <Text style={s.c2}>จำนวนเงิน</Text>
            <Text style={s.c3}>ภาษีที่หัก</Text>
          </View>
          <View style={s.td}>
            <Text style={s.c1}>{data.incomeLabel} (หัก {data.whtRatePct}%)</Text>
            <Text style={s.c2}>{formatBaht(data.baseSatang)}</Text>
            <Text style={s.c3}>{formatBaht(data.whtSatang)}</Text>
          </View>
          <View style={[s.row, { paddingHorizontal: 5 }]}>
            <Text style={s.bold}>รวมภาษีที่หักและนำส่ง</Text>
            <Text style={s.bold}>{formatBaht(data.whtSatang)} บาท</Text>
          </View>
        </View>

        <Text style={[s.sub, s.mt12]}>ผู้จ่ายเงิน  (1) หัก ณ ที่จ่าย   (2) ออกให้ตลอดไป   (3) ออกให้ครั้งเดียว</Text>
        <Text style={s.sub}>วันที่ออกหนังสือ: {data.issueDate}</Text>

        <View style={s.sign}>
          <View style={s.signbox}><Text style={s.signline}>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</Text></View>
        </View>
      </Page>
    </Document>
  );
}
