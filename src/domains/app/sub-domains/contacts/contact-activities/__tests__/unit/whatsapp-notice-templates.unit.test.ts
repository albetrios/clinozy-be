import { describe, expect, it } from 'vitest';
import {
  isOutsideServiceWindow,
  renderWhatsAppTemplate,
  templateParameter,
  templateParameterCount,
  WHATSAPP_DAY_CLOSE_SUMMARY_TEMPLATE,
  WHATSAPP_NOTICE_TEMPLATES,
} from '@/domains/app/sub-domains/contacts/contact-activities/whatsapp-notice-templates.js';
import {
  CONTACT_ACTIVITY_AUTOMATION_KIND_VALUES,
  CONTACT_ACTIVITY_TEMPLATE_PARAMETERS_MAX,
} from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import {
  bookingConfirmParameters,
  bookingReminderParameters,
  receiptParameters,
} from '@/domains/app/sub-domains/tasks/workers/task-rules-messages.processor.js';
import { dayCloseSummaryParameters } from '@/domains/app/sub-domains/billing/day-closes/day-close-summary.message.js';

const EVERY_TEMPLATE = [
  ...Object.values(WHATSAPP_NOTICE_TEMPLATES),
  WHATSAPP_DAY_CLOSE_SUMMARY_TEMPLATE,
];

const BOOKING = {
  appointmentId: 1,
  contactId: 2,
  firstName: 'Asha',
  branchName: 'Vesu',
  visitDate: '12 Oct',
  visitTime: '10:30',
  status: 'scheduled',
};

/** The notice templates (launch D32) — what Ops submits to Meta, and what the composers fill. */
describe('WhatsApp notice templates', () => {
  it('has one template per automated notice', () => {
    expect(Object.keys(WHATSAPP_NOTICE_TEMPLATES).sort()).toEqual(
      [...CONTACT_ACTIVITY_AUTOMATION_KIND_VALUES].sort(),
    );
  });

  it.each(EVERY_TEMPLATE.map((template) => [template.name, template]))(
    '%s: parameters numbered 1…n, none at either end, within the column cap, in English',
    (_name, template) => {
      const positions = [...template.text.matchAll(/\{\{(\d+)\}\}/g)].map((match) =>
        Number(match[1]),
      );
      const count = templateParameterCount(template);
      expect([...new Set(positions)].sort((a, b) => a - b)).toEqual(
        Array.from({ length: count }, (_, index) => index + 1),
      );
      expect(count).toBeLessThanOrEqual(CONTACT_ACTIVITY_TEMPLATE_PARAMETERS_MAX);
      expect(template.text, 'Meta refuses a template that starts with a parameter').not.toMatch(
        /^\{\{/,
      );
      expect(template.text, 'or ends with one').not.toMatch(/\}\}[.!?]?$/);
      expect(template.languageCode).toBe('en');
      expect(template.name).toMatch(/^[a-z_]+$/);
    },
  );

  it('each composer fills exactly its template', () => {
    const receipt = {
      paymentId: 1,
      contactId: 2,
      firstName: 'Asha',
      amount: 1500,
      invoiceNumber: '2026-27/0004',
      paidOn: '9 Oct',
    };
    const pairs: [string, string[]][] = [
      ['booking_reminder', bookingReminderParameters(BOOKING)],
      ['booking_confirm', bookingConfirmParameters(BOOKING)],
      ['payment_receipt', receiptParameters(receipt)],
    ];
    for (const [kind, parameters] of pairs) {
      const template = WHATSAPP_NOTICE_TEMPLATES[kind as keyof typeof WHATSAPP_NOTICE_TEMPLATES];
      expect(parameters, kind).toHaveLength(templateParameterCount(template));
    }
    expect(
      renderWhatsAppTemplate(
        WHATSAPP_NOTICE_TEMPLATES.payment_receipt,
        receiptParameters({ ...receipt, invoiceNumber: null }),
      ),
    ).toBe('Hi Asha, we have received ₹1,500.00 for your visit on 9 Oct. Thank you!');
    const summary = dayCloseSummaryParameters({
      id: 1,
      branchName: 'Vesu',
      closeDate: '9 Oct',
      expectedCash: 100,
      countedCash: 100,
      closedByName: null,
      figures: {
        cash_in: 100,
        cash_out: 0,
        net: { cash: 100, upi: 0, card: 0, credit: 0 },
        entry_count: 1,
      },
    } as never);
    expect(summary).toHaveLength(templateParameterCount(WHATSAPP_DAY_CLOSE_SUMMARY_TEMPLATE));
    expect(summary.slice(-3)).toEqual([
      'drawer matched',
      '1 entry',
      'closed automatically at midnight',
    ]);
  });

  it('flattens a parameter onto one line and never leaves it empty', () => {
    expect(templateParameter('Asha\nMehta\t  Jr', 'there')).toBe('Asha Mehta Jr');
    expect(templateParameter('   ', 'there')).toBe('there');
    expect(templateParameter(null, 'there')).toBe('there');
    expect(bookingConfirmParameters({ firstName: null, visitDate: null, visitTime: '' })).toEqual([
      'there',
      '-',
      '-',
    ]);
  });

  it('renders the text a person reads; a missing parameter stays visible', () => {
    expect(
      renderWhatsAppTemplate(WHATSAPP_NOTICE_TEMPLATES.booking_confirm, [
        'Asha',
        '12 Oct',
        '10:30',
      ]),
    ).toBe('Hi Asha, please confirm your visit on 12 Oct at 10:30. Reply YES to confirm.');
    expect(renderWhatsAppTemplate(WHATSAPP_NOTICE_TEMPLATES.booking_confirm, ['Asha'])).toContain(
      '{{2}}',
    );
  });

  it('the 24-hour window: never wrote, or 24 hours or more ago, is outside', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    expect(isOutsideServiceWindow(null, now)).toBe(true);
    expect(isOutsideServiceWindow(new Date('2026-10-08T12:00:00Z'), now)).toBe(true);
    expect(isOutsideServiceWindow(new Date('2026-10-08T12:00:01Z'), now)).toBe(false);
    expect(isOutsideServiceWindow(new Date('2026-10-09T11:59:00Z'), now)).toBe(false);
  });
});
