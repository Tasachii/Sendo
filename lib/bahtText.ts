// จำนวนเงินเป็นตัวอักษร — render an integer-satang amount as Thai words for the
// legal money line on a tax document (e.g. 9907 → "เก้าสิบเก้าบาทเจ็ดสตางค์").
// Input is satang (baht × 100), matching lib/money.ts, so the สตางค์ part is exact.

const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** Read an integer 0–999,999 as Thai words. Returns "" for 0 (callers add ศูนย์).
 * `partOfLarger` marks a group that follows a ล้าน group, so a lone trailing 1
 * still reads เอ็ด (ราชบัณฑิตฯ: ๑,๐๐๐,๐๐๑ → หนึ่งล้านเอ็ด, not หนึ่งล้านหนึ่ง). */
function readGroup(n: number, partOfLarger = false): string {
  const str = String(n);
  const len = str.length;
  let out = "";
  for (let i = 0; i < len; i++) {
    const digit = Number(str[i]);
    const place = len - i - 1; // 0 = units, 1 = tens, … 5 = แสน
    if (digit === 0) continue;
    if (place === 1) {
      // tens: 1 → สิบ, 2 → ยี่สิบ, else <digit>สิบ
      out += digit === 1 ? "สิบ" : digit === 2 ? "ยี่สิบ" : DIGITS[digit] + "สิบ";
    } else if (place === 0) {
      // units: a trailing 1 that follows a higher place reads เอ็ด, standalone reads หนึ่ง
      out += digit === 1 && (len > 1 || partOfLarger) ? "เอ็ด" : DIGITS[digit];
    } else {
      out += DIGITS[digit] + PLACES[place];
    }
  }
  return out;
}

/** Read a non-negative integer as Thai words, compounding ล้าน for each 10^6. */
function readInteger(n: number): string {
  if (n === 0) return "ศูนย์";
  if (n >= 1_000_000) {
    const high = Math.floor(n / 1_000_000);
    const low = n % 1_000_000;
    return readInteger(high) + "ล้าน" + (low > 0 ? readGroup(low, true) : "");
  }
  return readGroup(n);
}

/**
 * Convert an integer-satang amount to a Thai baht phrase.
 *   10000     → "หนึ่งร้อยบาทถ้วน"
 *   9907      → "เก้าสิบเก้าบาทเจ็ดสตางค์"
 *   50        → "ห้าสิบสตางค์"      (sub-baht: no บาท)
 *   0         → "ศูนย์บาทถ้วน"
 * Negative amounts (credit adjustments) get a "ลบ" prefix.
 */
export function bahtText(satang: number): string {
  const rounded = Math.round(satang);
  if (rounded < 0) return "ลบ" + bahtText(-rounded);

  const baht = Math.floor(rounded / 100);
  const st = rounded % 100;

  if (baht === 0 && st > 0) return readGroup(st) + "สตางค์";

  const bahtPart = readInteger(baht) + "บาท";
  return st === 0 ? bahtPart + "ถ้วน" : bahtPart + readGroup(st) + "สตางค์";
}
