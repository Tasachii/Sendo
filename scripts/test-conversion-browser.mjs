import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const workspace = await mkdtemp(path.join(tmpdir(), "sendo-browser-"));
const stop = new AbortController();
const onSignal = () => stop.abort();
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

let browser;
let db;
let server;
let serverExit;

async function availablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

async function run(cli, args, env) {
  const child = spawn(process.execPath, [path.join(workspace, "node_modules", cli), ...args], {
    cwd: workspace, env, stdio: "inherit", signal: stop.signal,
  });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve() : reject(new Error(`${cli} failed (exit ${code})`)));
  });
}

async function copyFixture() {
  // Copy only application/build sources and installed dependencies. Never copy .env,
  // .git, .next, a database, or the user's local configuration into the test.
  for (const entry of [
    "app", "components", "lib", "types", "public", "tests", "scripts",
    "prisma/schema.prisma", "prisma/migrations", "prisma/seed.ts",
    "package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "proxy.ts",
    "postcss.config.mjs", "vitest.config.ts",
  ]) {
    await cp(path.join(root, entry), path.join(workspace, entry), {
      recursive: true,
      filter: async source => {
        const name = path.basename(source);
        if (name.startsWith(".") || /\.(db|sqlite|sqlite3)([-.]|$)|\.(pem|p12|pfx)$/i.test(name)) return false;
        // Source symlinks could resolve into the original workspace or another project.
        assert(!(await lstat(source)).isSymbolicLink(), `Unexpected source symlink: ${name}`);
        return true;
      },
    });
  }
  const dependencies = path.join(root, "node_modules");
  const destination = path.join(workspace, "node_modules");
  for (const entry of ["", "prisma", "@prisma", "@prisma/client", ".prisma"]) {
    assert((await lstat(path.join(dependencies, entry))).isDirectory(), "Expected local npm-installed Prisma dependencies");
  }
  // macOS supports a fast copy-on-write clone. On Linux normal copying also keeps
  // Prisma generation and build output entirely outside the original checkout.
  const clone = process.platform === "darwin"
    ? spawnSync("cp", ["-cR", dependencies, destination], { stdio: "ignore" })
    : null;
  if (clone?.status !== 0) {
    await cp(dependencies, destination, { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
  }
}

async function fixture() {
  const requireFixture = createRequire(path.join(workspace, "package.json"));
  const { PrismaClient } = requireFixture("@prisma/client");
  db = new PrismaClient({ datasourceUrl: `file:${path.join(workspace, "prisma", "dev.db")}` });
  const bcrypt = requireFixture("bcryptjs");
  const password = randomBytes(24).toString("hex");
  const email = "conversion@example.test";
  const company = await db.company.create({
    data: {
      name: "Synthetic browser test", address: "Test fixture", taxId: "0000000000000",
      users: { create: { name: "Synthetic operator", email, passwordHash: await bcrypt.hash(password, 10), role: "OWNER" } },
      customers: { create: { name: "Synthetic customer" } },
      taxSettings: { create: { jobType: "test", label: "Test", vatRate: 0, whtRate: 0, vatApplicable: false } },
    },
    include: { users: true, customers: true },
  });
  const actor = company.users[0];
  const quote = await db.invoice.create({
    data: {
      companyId: company.id, createdById: actor.id, customerId: company.customers[0].id,
      number: "QUO-TEST-0001", docType: "QUOTATION", status: "SENT", jobType: "test",
      subtotalSatang: 25000, vatSatang: 0, whtSatang: 0, netSatang: 25000,
      items: { create: { description: "Synthetic fee", qty: 1, unitPriceSatang: 25000, lineTotalSatang: 25000 } },
    },
  });
  return { actor, quote, email, password };
}

async function startServer(port, env) {
  server = spawn(process.execPath, [path.join(workspace, "node_modules/next/dist/bin/next"),
    "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: workspace, env, stdio: ["ignore", "pipe", "inherit"],
  });
  serverExit = new Promise(resolve => server.once("close", resolve));
  // Wait for this process's Ready message, never attach to an unrelated service
  // if the allocated port is taken between reservation and bind.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Production server did not start")), 60_000);
    const finish = (error) => {
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    let output = "";
    server.stdout.on("data", chunk => {
      process.stdout.write(chunk);
      output = (output + chunk).slice(-256);
      if (/Ready in/.test(output)) finish();
    });
    server.once("error", finish);
    server.once("close", code => finish(new Error(`Production server exited (${code})`)));
  });
}

async function assertConversions(actor, quote, ids) {
  const documents = await db.invoice.findMany({
    where: { sourceId: quote.id }, select: { id: true, companyId: true, createdById: true, docType: true, status: true },
  });
  assert.deepEqual(documents.map(d => d.id).sort(), [...ids].sort());
  for (const doc of documents) {
    assert.equal(doc.companyId, actor.companyId);
    assert.equal(doc.createdById, actor.id);
    assert.equal(doc.docType, "BILLING_NOTE");
    assert.equal(doc.status, "DRAFT");
  }
  const audits = await db.auditLog.findMany({
    where: { action: "DOC_CONVERT" }, select: { entityId: true, companyId: true, userId: true },
  });
  assert.deepEqual(audits.map(a => a.entityId).sort(), [...ids].sort());
  assert(audits.every(a => a.companyId === actor.companyId && a.userId === actor.id));
  const intents = await db.conversionIntent.findMany({ where: { companyId: actor.companyId, actorId: actor.id } });
  assert.deepEqual(intents.map(i => i.documentId).sort(), [...ids].sort());
  assert.equal(new Set(intents.map(i => i.key)).size, ids.length);
  const counter = await db.documentCounter.findFirstOrThrow({ where: { companyId: actor.companyId, series: "BILL" } });
  assert.equal(counter.lastSeq, ids.length);
}

try {
  await copyFixture();
  const port = await availablePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const home = path.join(workspace, "home");
  await mkdir(home);
  // A small allowlist prevents inherited auth, DB, signing, cloud, proxy and
  // deployment credentials from reaching Prisma or the Next build/server.
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    SystemRoot: process.env.SystemRoot,
    TMPDIR: workspace,
    TEMP: workspace,
    TMP: workspace,
    NEXTAUTH_URL: baseURL,
    NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
    NEXT_TELEMETRY_DISABLED: "1",
    CI: "1",
  };

  await run("prisma/build/index.js", ["generate"], env);
  await run("prisma/build/index.js", ["migrate", "deploy"], env);
  const { actor, quote, email, password } = await fixture();
  await run("next/dist/bin/next", ["build"], env);
  await startServer(port, env);

  browser = await chromium.launch({
    headless: true,
    ...(process.argv.includes("--chrome") ? { channel: "chrome" } : {}),
    env: Object.fromEntries(Object.entries(env).filter(([key, value]) => value !== undefined && !key.startsWith("NEXTAUTH_"))),
  });
  const page = await browser.newPage({ baseURL, serviceWorkers: "block" });
  page.setDefaultTimeout(30_000);
  await page.route("**/*", async route => {
    if (new URL(route.request().url()).origin !== baseURL) await route.abort();
    else await route.continue();
  });
  await Promise.all([
    page.waitForResponse(r => r.url() === `${baseURL}/api/auth/session`),
    page.goto("/login"),
  ]);
  await page.locator("[name=email]").fill(email);
  await page.locator("[name=password]").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL("**/dashboard");

  const sourcePath = `/invoices/${quote.id}`;
  await page.goto(sourcePath);
  const convertButton = () => page.getByRole("button", { name: "แปลงเป็นใบแจ้งหนี้", exact: true });

  let committedResponse;
  let interceptError;
  const discard = async route => {
    if (route.request().method() !== "POST" || !route.request().headers()["next-action"]) {
      await route.fallback();
      return;
    }
    try {
      const response = await route.fetch({ maxRedirects: 0 });
      assert.equal(response.status(), 200);
      const original = await db.invoice.findFirstOrThrow({ where: { sourceId: quote.id } });
      await assertConversions(actor, quote, [original.id]);
      committedResponse = original.id;
    } catch (error) {
      interceptError = error;
    } finally {
      // The server has committed, but the tab never receives its result.
      await route.abort("connectionreset");
    }
  };
  await page.route(`${baseURL}${sourcePath}`, discard);
  await convertButton().click();
  await page.getByRole("alert").filter({ hasText: "ยังยืนยันผลไม่ได้" }).waitFor();
  if (interceptError) throw interceptError;
  assert(committedResponse, "The committed response was not intercepted");
  await page.unroute(`${baseURL}${sourcePath}`, discard);

  await page.reload();
  await page.getByRole("button", { name: /ลองอีกครั้ง.*ใบแจ้งหนี้/ }).click();
  await page.waitForURL(`${baseURL}/invoices/${committedResponse}`);
  await assertConversions(actor, quote, [committedResponse]);

  await page.goto(sourcePath);
  await convertButton().click();
  await page.waitForURL(url => url.pathname.startsWith("/invoices/") && url.pathname !== sourcePath);
  const independentId = new URL(page.url()).pathname.split("/").at(-1);
  assert.notEqual(independentId, committedResponse);
  await assertConversions(actor, quote, [committedResponse, independentId]);
  console.log("PASS: production Chromium sign-in, committed response discarded, same-tab reload and retry returned the original draft, and a new intent created exactly one more draft and audit.");
} finally {
  try {
    await browser?.close();
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      server.kill("SIGTERM");
      await Promise.race([serverExit, delay(5000, undefined, { ref: false })]);
      if (server.exitCode === null && server.signalCode === null) {
        server.kill("SIGKILL");
        await serverExit;
      }
    }
    try {
      await db?.$disconnect();
    } finally {
      await rm(workspace, { recursive: true, force: true });
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    }
  }
}
