import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const SHOTS = "docs/images";
mkdirSync(SHOTS, { recursive: true });

const bugs = [];
const ok = [];
const check = (cond, msg) => (cond ? ok.push(msg) : bugs.push(msg));

async function login(page, email, pw) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15000 });
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // 1. Login screen
  await page.goto(`${BASE}/login`);
  await page.waitForSelector("text=Sendo");
  await page.screenshot({ path: `${SHOTS}/login.png` });

  // 2. Login + dashboard
  await login(page, "demo@sendo.test", "demo1234");
  await page.waitForSelector("text=หน้าหลัก");
  await page.screenshot({ path: `${SHOTS}/dashboard.png` });
  const dashText = await page.textContent("body");
  check(dashText.includes("ยอดออกบิลเดือนนี้"), "dashboard shows month total card");
  check(dashText.includes("เกินกำหนด"), "dashboard shows overdue card");

  // 3. Invoices list
  await page.goto(`${BASE}/invoices`);
  await page.waitForSelector("text=ใบแจ้งหนี้");
  const rows = await page.locator("tbody tr").count();
  check(rows >= 5, `invoice list has >=5 rows (got ${rows})`);
  await page.screenshot({ path: `${SHOTS}/invoices.png` });

  // 4. Invoice detail (first row)
  await page.locator("tbody tr td a").first().click();
  await page.waitForSelector("text=ผู้ขาย");
  await page.screenshot({ path: `${SHOTS}/invoice-detail.png` });

  // 5. Reports
  await page.goto(`${BASE}/reports`);
  await page.waitForSelector("text=รายงานภาษี");
  const repText = await page.textContent("body");
  check(repText.includes("ภ.พ.30"), "reports shows VAT (ภ.พ.30) column");
  check(repText.includes("รวมทั้งปี"), "reports shows yearly total row");
  await page.screenshot({ path: `${SHOTS}/reports.png` });

  // 6. Settings
  await page.goto(`${BASE}/settings`);
  await page.waitForSelector("text=ตั้งค่าภาษี");
  await page.screenshot({ path: `${SHOTS}/settings.png` });

  // 7. Create invoice — live totals QA (transport_service 20,000 -> net 20,800)
  await page.goto(`${BASE}/invoices/new`);
  await page.waitForSelector("text=สร้างใบแจ้งหนี้");
  const selects = page.locator("form select");
  await selects.nth(0).selectOption({ label: "บริษัท ลูกค้าเอ จำกัด" });
  await selects.nth(1).selectOption({ label: "ขนส่งพ่วงบริการ" });
  await page.getByPlaceholder("รายละเอียด").first().fill("QA ค่าขนส่งพ่วงบริการ");
  await page.getByPlaceholder("จำนวน").first().fill("1");
  await page.getByPlaceholder("ราคา/หน่วย").first().fill("20000");
  await page.waitForTimeout(300);
  const netText = (await page.locator("span.text-accent.font-bold").last().textContent()) ?? "";
  check(netText.includes("20,800"), `live net = 20,800 (got "${netText.trim()}")`);
  await page.screenshot({ path: `${SHOTS}/invoice-new.png` });

  // save -> detail -> issue -> PDF  (cuids are long; exclude "/new")
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => /\/invoices\/[a-z0-9]{15,}$/i.test(u.pathname), { timeout: 15000 });
  const invId = page.url().split("/").pop();
  check(invId !== "new" && invId.length > 15, `landed on invoice detail (id=${invId})`);
  await page.click("text=ออกใบกำกับภาษี");
  await page.waitForSelector("text=ดาวน์โหลดใบกำกับภาษี", { timeout: 15000 });
  ok.push("draft issued successfully (poka-yoke passed)");

  // PDF reachable with the session cookie
  const pdf = await page.request.get(`${BASE}/api/invoices/${invId}/pdf`);
  check(pdf.ok() && pdf.headers()["content-type"]?.includes("pdf"), `invoice PDF downloads (status ${pdf.status()})`);
  const wht = await page.request.get(`${BASE}/api/invoices/${invId}/wht`);
  check(wht.ok(), `WHT 50 ทวิ PDF downloads (status ${wht.status()})`);

  // 7b. Poka-yoke block — a customer with no address must not be issuable
  await page.goto(`${BASE}/customers`);
  await page.click("text=+ เพิ่มลูกค้า");
  await page.fill('input[name="name"]', "QA ลูกค้าไม่มีที่อยู่");
  await page.check('input[name="isVatRegistered"]'); // VAT but no taxId + no address
  await page.click('form button:has-text("บันทึก")');
  await page.waitForTimeout(600);
  await page.goto(`${BASE}/invoices/new`);
  await page.locator("form select").nth(0).selectOption({ label: "QA ลูกค้าไม่มีที่อยู่" });
  await page.locator("form select").nth(1).selectOption({ label: "ค่าบริการ / รับจ้างทำของ" });
  await page.getByPlaceholder("รายละเอียด").first().fill("QA ทดสอบกันพลาด");
  await page.getByPlaceholder("จำนวน").first().fill("1");
  await page.getByPlaceholder("ราคา/หน่วย").first().fill("5000");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => /\/invoices\/[a-z0-9]{15,}$/i.test(u.pathname), { timeout: 15000 });
  await page.click("text=ออกใบกำกับภาษี");
  await page.waitForTimeout(800);
  const blockedBody = await page.textContent("body");
  const blocked = blockedBody.includes("ข้อมูลไม่ครบตามมาตรา 86/4") && !blockedBody.includes("ดาวน์โหลดใบกำกับภาษี");
  check(blocked, "poka-yoke blocks issuing an invoice missing required fields");
  await page.screenshot({ path: `${SHOTS}/poka-yoke.png` });

  // 8. Mobile dashboard
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mp = await m.newPage();
  await login(mp, "demo@sendo.test", "demo1234");
  await mp.screenshot({ path: `${SHOTS}/dashboard-mobile.png` });
  await m.close();

  // 9. Tenant isolation — other company sees none of demo's invoices
  const t = await browser.newContext();
  const tp = await t.newPage();
  await login(tp, "other@sendo.test", "demo1234");
  await tp.goto(`${BASE}/invoices`);
  await tp.waitForSelector("text=ใบแจ้งหนี้");
  const otherRows = await tp.locator("tbody tr").count();
  const otherBody = await tp.textContent("body");
  const emptyOK = otherRows === 0 || otherBody.includes("ยังไม่มีใบแจ้งหนี้");
  check(emptyOK, `tenant isolation: other company sees no invoices (rows=${otherRows})`);
  await t.close();
} catch (e) {
  bugs.push("FATAL: " + e.message);
} finally {
  await browser.close();
}

console.log("\n===== QA RESULTS =====");
ok.forEach((m) => console.log("  ✓ " + m));
bugs.forEach((m) => console.log("  ✗ " + m));
console.log(`\n${ok.length} passed, ${bugs.length} failed`);
process.exit(bugs.length ? 1 : 0);
