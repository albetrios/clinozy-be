import { describe, expect, it } from 'vitest';
import {
  bookingConfirmBody,
  bookingReminderBody,
  receiptBody,
} from '@/domains/app/sub-domains/tasks/workers/task-rules-messages.processor.js';
import type { BookingMessageCandidate } from '@/domains/app/sub-domains/tasks/task-rule-messages.repository.js';

const booking: BookingMessageCandidate = {
  appointmentId: 1,
  contactId: 2,
  firstName: 'Asha',
  branchName: 'Vesu',
  visitDate: '12 Oct',
  visitTime: '10:30',
  status: 'scheduled',
};

/** The texts of the app's booking messages and receipts (launch D78 — WC-5, WC-6, WC-9). */
describe("The app's message bodies", () => {
  it('WC-5: the confirm request names the branch, the day and the time, and asks for a Yes', () => {
    expect(bookingConfirmBody(booking)).toBe(
      'Hi Asha, your visit at Vesu is booked for 12 Oct at 10:30. Reply YES to confirm.',
    );
  });

  it('WC-6: the reminder asks for a Yes only while the booking is unconfirmed', () => {
    expect(bookingReminderBody(booking)).toBe(
      'Hi Asha, a reminder of your visit at Vesu tomorrow, 12 Oct at 10:30. Reply YES to confirm.',
    );
    expect(bookingReminderBody({ ...booking, status: 'confirmed' })).toBe(
      'Hi Asha, a reminder of your visit at Vesu tomorrow, 12 Oct at 10:30. See you then!',
    );
  });

  it('WC-9: the receipt names the amount, and its invoice when it has one', () => {
    const receipt = {
      paymentId: 3,
      contactId: 2,
      firstName: 'Asha',
      amount: 15_000,
      invoiceNumber: 'VS/2026-27/0012',
      paidOn: '9 Oct',
    };
    expect(receiptBody(receipt)).toBe(
      'Hi Asha, we have received ₹15,000.00 for invoice VS/2026-27/0012 on 9 Oct. Thank you!',
    );
    expect(receiptBody({ ...receipt, invoiceNumber: null, amount: 500 })).toBe(
      'Hi Asha, we have received ₹500.00 on 9 Oct. Thank you!',
    );
  });
});
