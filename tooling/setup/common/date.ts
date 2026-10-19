/**
 * Formats a date as local `YYYY-MM-DD` — the day as the person running the command sees it.
 *
 * @remarks
 * The one "today" of the tooling: an iteration's opened and history dates, the TSDoc budget's
 * recorded date. Local, not UTC, so a command run late in the evening records the day it was run.
 */
export function localDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
