import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const SHOTS = "docs/images";
mkdirSync(SHOTS, { recursive: true });

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', "demo@sendo.test");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15000 });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1320, height: 920 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// login screen
await page.goto(`${BASE}/login`);
await page.waitForSelector("text=Sendo");
await page.screenshot({ path: `${SHOTS}/login.png` });

await login(page);
await page.waitForSelector("text=หน้าหลัก");
await page.screenshot({ path: `${SHOTS}/dashboard.png` });

await page.goto(`${BASE}/invoices`);
await page.waitForSelector("text=ใบแจ้งหนี้");
await page.screenshot({ path: `${SHOTS}/invoices.png` });

await page.locator("tbody tr td a").first().click();
await page.waitForSelector("text=ผู้ขาย");
await page.screenshot({ path: `${SHOTS}/invoice-detail.png`, fullPage: true });

// create-invoice with a filled-in example (no submit)
await page.goto(`${BASE}/invoices/new`);
await page.waitForSelector("text=สร้างใบแจ้งหนี้");
await page.locator("form select").nth(0).selectOption({ label: "บริษัท ลูกค้าเอ จำกัด" });
await page.locator("form select").nth(1).selectOption({ label: "ขนส่งพ่วงบริการ" });
await page.getByPlaceholder("รายละเอียด").first().fill("ค่าขนส่งพ่วงบริการ กทม.–เชียงใหม่");
await page.getByPlaceholder("จำนวน").first().fill("1");
await page.getByPlaceholder("ราคา/หน่วย").first().fill("20000");
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/invoice-new.png`, fullPage: true });

await page.goto(`${BASE}/reports`);
await page.waitForSelector("text=รายงานภาษี");
await page.screenshot({ path: `${SHOTS}/reports.png`, fullPage: true });

await page.goto(`${BASE}/settings`);
await page.waitForSelector("text=ตั้งค่าภาษี");
await page.screenshot({ path: `${SHOTS}/settings.png` });

// mobile dashboard
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const mp = await m.newPage();
await login(mp);
await mp.waitForSelector('h1:has-text("หน้าหลัก")');
await mp.waitForTimeout(300);
await mp.screenshot({ path: `${SHOTS}/dashboard-mobile.png` });

await browser.close();
console.log("screenshots written to", SHOTS);
