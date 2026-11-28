// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InvoiceActions } from "../app/(app)/invoices/[id]/InvoiceActions";
import type { InvoiceActionResult } from "../app/actions/invoices";

const { convertDocument, push } = vi.hoisted(() => ({ convertDocument: vi.fn(), push: vi.fn() }));
vi.mock("@/app/actions/invoices", () => ({ convertDocument }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const props = { id: "source", companyId: "company", actorId: "actor", docType: "TAX_INVOICE", status: "SENT", hasWht: false, canWrite: true } as const;
let host: HTMLDivElement;
let root: Root;
async function render(changes: Partial<Parameters<typeof InvoiceActions>[0]> = {}) {
  await act(async () => root.render(createElement(InvoiceActions, { ...props, ...changes })));
}
function button(name: string) {
  const element = Array.from(host.querySelectorAll("button")).find(b => b.textContent === name);
  if (!element) throw new Error(`Missing button: ${name}`);
  return element;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  vi.resetAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps one intent through double activation, lost response and reload, then rotates it on a new conversion", async () => {
  const prompt = vi.spyOn(window, "prompt").mockReturnValue("  synthetic reason  ");
  let loseResponse!: (error: Error) => void;
  convertDocument.mockImplementationOnce(() => new Promise<InvoiceActionResult>((_, reject) => { loseResponse = reject; }));
  await render();
  const credit = button("แปลงเป็นใบลดหนี้");
  credit.focus();
  expect(document.activeElement).toBe(credit);
  await act(async () => { credit.click(); credit.click(); });
  expect(convertDocument).toHaveBeenCalledTimes(1);
  const details = convertDocument.mock.calls[0][2];
  expect(details).toMatchObject({ intentKey: expect.any(String), reason: "synthetic reason" });
  expect(credit.disabled).toBe(true);
  expect(host.querySelector('[role="status"]')?.textContent).toContain("กำลังแปลง");
  await act(async () => loseResponse(new Error("lost response")));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("ยังยืนยันผลไม่ได้");
  await act(async () => root.unmount());
  root = createRoot(host);
  await render({ status: "VOID" });
  const retry = button("ลองอีกครั้ง: แปลงเป็นใบลดหนี้");
  expect(retry.disabled).toBe(false);
  convertDocument.mockResolvedValueOnce({ ok: true, id: "original" });
  await act(async () => retry.click());
  expect(convertDocument.mock.calls[1]).toEqual(["source", "CREDIT_NOTE", details]);
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith("/invoices/original");
  expect(sessionStorage.length).toBe(0);
  await render();
  convertDocument.mockResolvedValueOnce({ ok: true, id: "new" });
  await act(async () => button("แปลงเป็นใบลดหนี้").click());
  expect(convertDocument.mock.calls[2][2].intentKey).not.toBe(details.intentKey);
  expect(push).toHaveBeenCalledWith("/invoices/new");
});

it("handles cancellation, business errors, transient failures and session isolation", async () => {
  const prompt = vi.spyOn(window, "prompt").mockReturnValueOnce(null).mockReturnValueOnce("   ");
  await render();
  await act(async () => button("แปลงเป็นใบลดหนี้").click());
  await act(async () => button("แปลงเป็นใบลดหนี้").click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("ระบุเหตุผล");
  expect(convertDocument).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(0);
  prompt.mockReturnValue("test");
  convertDocument.mockResolvedValueOnce({ ok: false, error: "busy", retryable: true });
  await act(async () => button("แปลงเป็นใบลดหนี้").click());
  const original = convertDocument.mock.calls[0];
  for (const scope of [{ actorId: "other" }, { id: "other" }, { companyId: "other" }]) {
    await render(scope);
    expect(button("แปลงเป็นใบลดหนี้").disabled).toBe(false);
  }
  await render({ canWrite: false });
  expect(host.querySelector("button")).toBeNull();
  await render();
  convertDocument.mockResolvedValueOnce({ ok: false, error: "synthetic refusal" });
  await act(async () => button("ลองอีกครั้ง: แปลงเป็นใบลดหนี้").click());
  expect(convertDocument.mock.calls[1]).toEqual(original);
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("synthetic refusal");
  expect(sessionStorage.length).toBe(0);
});

it("reports unavailable tab storage before sending any conversion", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
  await render();
  await act(async () => button("แปลงเป็นใบเสร็จรับเงิน").click());
  expect(convertDocument).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("พื้นที่จัดเก็บ");
  expect(button("แปลงเป็นใบเสร็จรับเงิน").disabled).toBe(false);
});

const slot = 'sendo.convert.v1:["company","actor","source"]';
const uuid = "a13fe53b-7bad-41f1-a448-4dc95c373b1a";
it.each([
  ["malformed JSON", "{"], ["empty text", ""], ["null", "null"], ["array", "[]"],
  ["missing key", JSON.stringify({ target: "RECEIPT" })],
  ["invalid key", JSON.stringify({ target: "RECEIPT", intentKey: "invalid" })],
  ["incompatible target", JSON.stringify({ target: "QUOTATION", intentKey: uuid })],
  ["unknown target", JSON.stringify({ target: "OTHER", intentKey: uuid })],
  ["invalid reason", JSON.stringify({ target: "RECEIPT", intentKey: uuid, reason: {} })],
  ["missing note reason", JSON.stringify({ target: "CREDIT_NOTE", intentKey: uuid })],
  ["future format", JSON.stringify({ target: "RECEIPT", intentKey: uuid, version: 2 })],
])("preserves %s until explicit recovery and sends no request during recovery", async (_, raw) => {
  sessionStorage.setItem(slot, raw);
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("ตรวจสอบเอกสาร");
  expect(host.textContent).not.toContain("แปลงเป็น");
  expect(sessionStorage.getItem(slot)).toBe(raw);
  const reset = button("ตรวจสอบแล้ว ล้างคำขอที่อ่านไม่ได้");
  reset.focus();
  expect(document.activeElement).toBe(reset);
  await act(async () => reset.click());
  expect(convertDocument).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(slot)).toBeNull();
  convertDocument.mockResolvedValue({ ok: true, id: "intentional" });
  await act(async () => button("แปลงเป็นใบเสร็จรับเงิน").click());
  expect(convertDocument).toHaveBeenCalledTimes(1);
  expect(convertDocument.mock.calls[0][2].intentKey).not.toBe(uuid);
});

it("rechecks storage at activation and never downgrades malformed pending data to an unkeyed conversion", async () => {
  await render();
  const convert = button("แปลงเป็นใบเสร็จรับเงิน");
  sessionStorage.setItem(slot, JSON.stringify({ target: "RECEIPT" }));
  await act(async () => convert.click());
  expect(convertDocument).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("ตรวจสอบเอกสาร");
});

it("keeps a replacement intent when an old recovery control is activated or an old response arrives", async () => {
  sessionStorage.setItem(slot, "{");
  await render();
  const reset = button("ตรวจสอบแล้ว ล้างคำขอที่อ่านไม่ได้");
  const saved = JSON.stringify({ target: "RECEIPT", intentKey: uuid });
  sessionStorage.setItem(slot, saved);
  await act(async () => reset.click());
  expect(sessionStorage.getItem(slot)).toBe(saved);
  let finish!: (result: InvoiceActionResult) => void;
  convertDocument.mockImplementationOnce(() => new Promise<InvoiceActionResult>(resolve => { finish = resolve; }));
  await act(async () => button("ลองอีกครั้ง: แปลงเป็นใบเสร็จรับเงิน").click());
  const replacement = JSON.stringify({ target: "DEBIT_NOTE", intentKey: crypto.randomUUID(), reason: "synthetic" });
  sessionStorage.setItem(slot, replacement);
  await act(async () => finish({ ok: true, id: "original" }));
  expect(sessionStorage.getItem(slot)).toBe(replacement);
  expect(push).toHaveBeenCalledWith("/invoices/original");
});
