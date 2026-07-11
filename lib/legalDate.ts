/**
 * Single policy for dates that appear on Thai legal documents and tax reports.
 *
 * Database values are instants, while the legal calendar day is the day observed
 * in Thailand. Keeping this conversion here prevents behavior from changing with
 * the server's configured timezone.
 */
export const LEGAL_TIME_ZONE = "Asia/Bangkok";

const BANGKOK_UTC_OFFSET_MS = 7 * 60 * 60 * 1_000;
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LEGAL_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type LegalDateParts = { year: number; month: number; day: number };

function legalDateParts(date: Date): LegalDateParts {
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return { year: values.year, month: values.month, day: values.day };
}

export function legalDate(date: Date): string {
  const { year, month, day } = legalDateParts(date);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function legalYearMonth(date: Date): Pick<LegalDateParts, "year" | "month"> {
  const { year, month } = legalDateParts(date);
  return { year, month };
}

export function legalYear(date: Date): number {
  return legalDateParts(date).year;
}

export function currentLegalYear(now = new Date()): number {
  return legalYear(now);
}

/** Half-open UTC interval covering a complete Asia/Bangkok calendar year. */
export function legalYearRange(year: number): { start: Date; end: Date } {
  if (!Number.isInteger(year)) throw new RangeError("Legal year must be an integer");
  return {
    start: new Date(Date.UTC(year, 0, 1) - BANGKOK_UTC_OFFSET_MS),
    end: new Date(Date.UTC(year + 1, 0, 1) - BANGKOK_UTC_OFFSET_MS),
  };
}
