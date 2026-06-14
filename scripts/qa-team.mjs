import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const bugs = [], ok = [];
const check = (c, m) => (c ? ok.push(m) : bugs.push(m));
const login = async (p, e, pw) => { await p.goto(`${BASE}/login`); await p.fill('input[name=email]', e); await p.fill('input[name=password]', pw); await p.click('button[type=submit]'); await p.waitForURL("**/dashboard", { timeout: 15000 }); };

const b = await chromium.launch();
try {
  const p = await (await b.newContext()).newPage();
  await login(p, "demo@sendo.test", "demo1234");
  // owner sees Team nav + page
  await p.goto(`${BASE}/team`);
  await p.waitForSelector("text=ทีมงาน");
  const email = `staff${Date.now()}@sendo.test`;
  await p.click("text=+ เพิ่มสมาชิก");
  await p.fill('input[name=name]', "พนักงานทดสอบ");
  await p.fill('input[name=email]', email);
  await p.fill('input[name=password]', "staff1234");
  await p.selectOption('select[name=role]', "STAFF");
  await p.click('form button:has-text("เพิ่มสมาชิก")');
  await p.waitForTimeout(800);
  check((await p.textContent("body")).includes(email), "owner added a STAFF member (row visible)");

  // new member can log in
  const p2 = await (await b.newContext()).newPage();
  await login(p2, email, "staff1234");
  check(p2.url().includes("/dashboard"), "new STAFF member can log in");
  // STAFF should NOT see the Team nav (owner-only)
  await p2.goto(`${BASE}/team`);
  await p2.waitForSelector("h1");
  check((await p2.textContent("body")).includes("เฉพาะเจ้าของบริษัท"), "STAFF is blocked from team management");
  // STAFF sees only their company's data (tenant)
  await p2.goto(`${BASE}/invoices`);
  await p2.waitForSelector("text=ใบแจ้งหนี้");
  ok.push("STAFF can view company invoices");
} catch (e) { bugs.push("FATAL: " + e.message); } finally { await b.close(); }

console.log("\n=== TEAM QA ===");
ok.forEach((m) => console.log("  ✓ " + m));
bugs.forEach((m) => console.log("  ✗ " + m));
console.log(`${ok.length} passed, ${bugs.length} failed`);
process.exit(bugs.length ? 1 : 0);
