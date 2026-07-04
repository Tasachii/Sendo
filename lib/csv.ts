// CSV emission helpers, shared by any export route. Kept here (not inline in one
// route) so every current and future CSV path reuses the same injection guard.

/**
 * Make a single CSV cell safe:
 *  - neutralize spreadsheet formula/DDE injection: a cell that starts with
 *    = + - @ TAB or CR is prefixed with a leading apostrophe so Excel/Sheets
 *    treats it as text, not a formula.
 *  - RFC-4180 quoting: a cell containing a comma, quote, CR or LF is wrapped in
 *    double quotes with any internal quote doubled.
 */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Join one row of cells, each passed through `csvCell`. */
export const csvRow = (cells: (string | number)[]): string => cells.map(csvCell).join(",");
