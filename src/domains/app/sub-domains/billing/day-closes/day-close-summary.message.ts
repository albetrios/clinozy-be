import { rupees } from '@/shared/utils/validation/record-fields.util.js';
import type { PendingDayCloseSummary } from './day-close-summary.repository.js';

/** Paise for an exact comparison. */
function paiseOf(value: number): number {
  return Math.round(value * 100);
}

/** "matched", or how much was short or extra in the drawer. */
function drawerOf(summary: PendingDayCloseSummary): string {
  const difference = (paiseOf(summary.countedCash) - paiseOf(summary.expectedCash)) / 100;
  if (difference === 0) return 'drawer matched';
  return difference < 0
    ? `${rupees(-difference)} short`
    : `${rupees(difference)} extra in the drawer`;
}

/**
 * The day-close summary the admins get on WhatsApp (launch D78, WC-10) — "Day closed · summary
 * sent to admin on WhatsApp".
 *
 * @remarks
 * - **Algorithm:** four lines: the branch and the day; the net by mode (the day page's figures);
 *   the counted against the expected cash and the difference; the entries and who closed it (or
 *   the midnight auto-close).
 * - **Notes:** English text, as the patients' messages are.
 */
export function dayCloseSummaryBody(summary: PendingDayCloseSummary): string {
  const { net, entry_count: entryCount } = summary.figures;
  const total =
    (paiseOf(net.cash) + paiseOf(net.upi) + paiseOf(net.card) + paiseOf(net.credit)) / 100;
  const closedBy =
    summary.closedByName === null
      ? 'closed automatically at midnight'
      : `closed by ${summary.closedByName}`;
  return [
    `Day closed · ${summary.branchName} · ${summary.closeDate}`,
    `Net ${rupees(total)} — cash ${rupees(net.cash)} · UPI ${rupees(net.upi)} · card ${rupees(net.card)}`,
    `Cash counted ${rupees(summary.countedCash)}, expected ${rupees(summary.expectedCash)} (${drawerOf(summary)})`,
    `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} · ${closedBy}`,
  ].join('\n');
}
