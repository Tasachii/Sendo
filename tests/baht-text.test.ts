import { describe, it, expect } from "vitest";
import { bahtText } from "../lib/bahtText";

// จำนวนเงินเป็นตัวอักษร (amount in Thai words). Input is integer satang — the same
// server-truth unit the rest of the money code uses (lib/money.ts) — so we never
// lose the สตางค์ to float error (e.g. 99.07 must read เจ็ดสตางค์, not เจ็ดสิบ).

describe("bahtText — the cases named in the SE4 brief", () => {
  it("9907 satang (99.07) → เก้าสิบเก้าบาทเจ็ดสตางค์", () => {
    expect(bahtText(9907)).toBe("เก้าสิบเก้าบาทเจ็ดสตางค์");
  });

  it("10000 satang (100.00) → หนึ่งร้อยบาทถ้วน", () => {
    expect(bahtText(10000)).toBe("หนึ่งร้อยบาทถ้วน");
  });

  it("100000125 satang (1,000,001.25) → หนึ่งล้านเอ็ดบาทยี่สิบห้าสตางค์", () => {
    // ราชบัณฑิตฯ: เลขตั้งแต่ ๒ หลักที่ลงท้ายด้วย ๑ อ่าน "เอ็ด" แม้ข้ามหลักล้าน
    expect(bahtText(100_000_125)).toBe("หนึ่งล้านเอ็ดบาทยี่สิบห้าสตางค์");
  });

  it("0 satang → ศูนย์บาทถ้วน", () => {
    expect(bahtText(0)).toBe("ศูนย์บาทถ้วน");
  });
});

describe("bahtText — เอ็ด / สิบ / ยี่สิบ special forms", () => {
  it.each([
    [100, "หนึ่งบาทถ้วน"], // standalone 1 is หนึ่ง, never เอ็ด
    [1000, "สิบบาทถ้วน"], // tens digit 1 is สิบ, never หนึ่งสิบ
    [1100, "สิบเอ็ดบาทถ้วน"], // 11 → สิบเอ็ด
    [2000, "ยี่สิบบาทถ้วน"], // tens digit 2 is ยี่สิบ
    [2100, "ยี่สิบเอ็ดบาทถ้วน"], // 21 → ยี่สิบเอ็ด
    [10100, "หนึ่งร้อยเอ็ดบาทถ้วน"], // 101 → หนึ่งร้อยเอ็ด
    [11111, "หนึ่งร้อยสิบเอ็ดบาทสิบเอ็ดสตางค์"], // 111.11
  ])("%d satang → %s", (satang, expected) => {
    expect(bahtText(satang)).toBe(expected);
  });
});

describe("bahtText — place values and millions", () => {
  it.each([
    [100000, "หนึ่งพันบาทถ้วน"], // 1,000
    [1000000, "หนึ่งหมื่นบาทถ้วน"], // 10,000
    [10000000, "หนึ่งแสนบาทถ้วน"], // 100,000
    [100000000, "หนึ่งล้านบาทถ้วน"], // 1,000,000
  ])("%d satang → %s", (satang, expected) => {
    expect(bahtText(satang)).toBe(expected);
  });

  it("123,456,700 baht reads with a nested ล้าน group", () => {
    // 1,234,567 baht = 123,456,700 satang
    expect(bahtText(123_456_700)).toBe(
      "หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทถ้วน"
    );
  });

  it("21,000,000 baht → ยี่สิบเอ็ดล้านบาทถ้วน (เอ็ด survives before ล้าน)", () => {
    expect(bahtText(2_100_000_000)).toBe("ยี่สิบเอ็ดล้านบาทถ้วน");
  });
});

describe("bahtText — สตางค์ handling", () => {
  it.each([
    [1, "หนึ่งสตางค์"],
    [5, "ห้าสตางค์"],
    [25, "ยี่สิบห้าสตางค์"],
    [50, "ห้าสิบสตางค์"],
    [70, "เจ็ดสิบสตางค์"], // 0.70 — contrast with 0.07 which is เจ็ดสตางค์
  ])("%d satang (sub-baht) → %s", (satang, expected) => {
    expect(bahtText(satang)).toBe(expected);
  });

  it("rounds a non-integer satang defensively", () => {
    expect(bahtText(9906.6)).toBe("เก้าสิบเก้าบาทเจ็ดสตางค์");
  });

  it("handles a negative amount with a ลบ prefix", () => {
    expect(bahtText(-100)).toBe("ลบหนึ่งบาทถ้วน");
  });
});
