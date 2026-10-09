import { describe, expect, it } from 'vitest';
import { dayCloseSummaryBody } from '@/domains/app/sub-domains/billing/day-closes/day-close-summary.message.js';
import type { PendingDayCloseSummary } from '@/domains/app/sub-domains/billing/day-closes/day-close-summary.repository.js';

const summary: PendingDayCloseSummary = {
  id: 1,
  branchName: 'Vesu',
  closeDate: '9 Oct',
  expectedCash: 1740,
  countedCash: 1700,
  closedByName: 'Riya S.',
  figures: {
    cash_in: 2000,
    cash_out: 260,
    net: { cash: 1740, upi: 6550, card: 0, credit: 0 },
    entry_count: 14,
  },
};

/** The day-close summary the admins get on WhatsApp (launch D78, WC-10). */
describe('dayCloseSummaryBody', () => {
  it('the branch and day, the net by mode, the count against the expected, who closed it', () => {
    expect(dayCloseSummaryBody(summary).split('\n')).toEqual([
      'Day closed · Vesu · 9 Oct',
      'Net ₹8,290.00 — cash ₹1,740.00 · UPI ₹6,550.00 · card ₹0.00',
      'Cash counted ₹1,700.00, expected ₹1,740.00 (₹40.00 short)',
      '14 entries · closed by Riya S.',
    ]);
  });

  it('a matched drawer, an extra, one entry and the midnight auto-close', () => {
    expect(dayCloseSummaryBody({ ...summary, countedCash: 1740 })).toContain('(drawer matched)');
    expect(dayCloseSummaryBody({ ...summary, countedCash: 1800.5 })).toContain(
      '(₹60.50 extra in the drawer)',
    );
    const auto = dayCloseSummaryBody({
      ...summary,
      closedByName: null,
      figures: { ...summary.figures, entry_count: 1 },
    });
    expect(auto.split('\n')[3]).toBe('1 entry · closed automatically at midnight');
  });
});
