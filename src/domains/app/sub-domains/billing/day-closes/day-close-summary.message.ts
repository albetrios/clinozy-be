import { rupees } from '@/shared/utils/validation/record-fields.util.js';
import { templateParameter } from '@/domains/app/sub-domains/contacts/contact-activities/whatsapp-notice-templates.js';
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

/** The day's net across the modes, in rupees. */
function netTotalOf(summary: PendingDayCloseSummary): number {
  const { net } = summary.figures;
  return (paiseOf(net.cash) + paiseOf(net.upi) + paiseOf(net.card) + paiseOf(net.credit)) / 100;
}

/** "3 entries" or "1 entry". */
function entriesOf(summary: PendingDayCloseSummary): string {
  const count = summary.figures.entry_count;
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

/** Who closed the day, or the midnight auto-close. */
function closedByOf(summary: PendingDayCloseSummary): string {
  return summary.closedByName === null
    ? 'closed automatically at midnight'
    : `closed by ${summary.closedByName}`;
}

/**
 * The day-close summary's parameters for its WhatsApp template (launch D32, WC-10): branch, day,
 * net, cash, UPI, card, counted, expected, the drawer, the entries, who closed it.
 *
 * @remarks
 * - **Notes:** the same figures as {@link dayCloseSummaryBody}, each on one line, never empty.
 */
export function dayCloseSummaryParameters(summary: PendingDayCloseSummary): string[] {
  const { net } = summary.figures;
  return [
    templateParameter({ value: summary.branchName, fallback: 'the branch' }),
    templateParameter({ value: summary.closeDate, fallback: '-' }),
    rupees(netTotalOf(summary)),
    rupees(net.cash),
    rupees(net.upi),
    rupees(net.card),
    rupees(summary.countedCash),
    rupees(summary.expectedCash),
    drawerOf(summary),
    entriesOf(summary),
    templateParameter({ value: closedByOf(summary), fallback: 'closed' }),
  ];
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
  const { net } = summary.figures;
  return [
    `Day closed · ${summary.branchName} · ${summary.closeDate}`,
    `Net ${rupees(netTotalOf(summary))} — cash ${rupees(net.cash)} · UPI ${rupees(net.upi)} · card ${rupees(net.card)}`,
    `Cash counted ${rupees(summary.countedCash)}, expected ${rupees(summary.expectedCash)} (${drawerOf(summary)})`,
    `${entriesOf(summary)} · ${closedByOf(summary)}`,
  ].join('\n');
}
