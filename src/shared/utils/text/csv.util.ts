import { toText } from '@/shared/utils/validation/record-fields.util.js';

/** Cells a spreadsheet would run as a formula (CSV injection) — prefixed with `'` on export. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: arrays joined with `|`, objects as JSON, quoted when needed, formulas defused. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = Array.isArray(value)
    ? value.map((item: unknown) => toText(item)).join('|')
    : toText(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Rows as RFC 4180 CSV — the header is the union of the rows' keys in first-seen order; cells
 * that start like a formula are prefixed with `'` so a spreadsheet shows them as text.
 */
export function toCsv(rows: readonly Record<string, unknown>[]): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
