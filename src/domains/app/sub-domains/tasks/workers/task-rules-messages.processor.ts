import { isMessagingDeliveryEnabled } from '@/infrastructure/messaging/meta-messaging.config.js';
import { rupees } from '@/shared/utils/validation/record-fields.util.js';
import { CONTACT_ACTIVITY_AUTOMATION_KIND } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import { templateParameter } from '@/domains/app/sub-domains/contacts/contact-activities/whatsapp-notice-templates.js';
import {
  APPOINTMENT_REMINDER_STATUS,
  APPOINTMENT_STATUS,
} from '@/domains/app/sub-domains/appointments/appointments.constants.js';
import type {
  BookingMessageCandidate,
  ReceiptMessageCandidate,
  TaskRuleMessagesRepository,
} from '@/domains/app/sub-domains/tasks/task-rule-messages.repository.js';
import type {
  TaskRulesOrganization,
  TaskRulesRepository,
} from '@/domains/app/sub-domains/tasks/task-rules.repository.js';

/**
 * WC-6: the day-before reminder — asks for a "Yes" only while the booking is unconfirmed.
 *
 * @remarks
 * - **Notes:** English text (D78), as TK10's messages are.
 */
export function bookingReminderBody(booking: BookingMessageCandidate): string {
  const ask =
    booking.status === APPOINTMENT_STATUS.CONFIRMED ? 'See you then!' : 'Reply YES to confirm.';
  return `Hi ${booking.firstName}, a reminder of your visit at ${booking.branchName} tomorrow, ${booking.visitDate} at ${booking.visitTime}. ${ask}`;
}

/**
 * WC-5: the confirm request right after booking.
 *
 * @remarks
 * - **Notes:** a "Yes" reply confirms the booking (WC-8).
 */
export function bookingConfirmBody(booking: BookingMessageCandidate): string {
  return `Hi ${booking.firstName}, your visit at ${booking.branchName} is booked for ${booking.visitDate} at ${booking.visitTime}. Reply YES to confirm.`;
}

/**
 * WC-6's parameters for the `booking_reminder` template (D32): name, branch, date, time.
 *
 * @remarks
 * - **Notes:** in `WHATSAPP_NOTICE_TEMPLATES` order; each on one line, never empty.
 */
export function bookingReminderParameters(booking: BookingMessageCandidate): string[] {
  return [
    templateParameter({ value: booking.firstName, fallback: 'there' }),
    templateParameter({ value: booking.branchName, fallback: 'the clinic' }),
    templateParameter({ value: booking.visitDate, fallback: '-' }),
    templateParameter({ value: booking.visitTime, fallback: '-' }),
  ];
}

/**
 * WC-5's parameters for the `booking_confirm` template (D32): name, date, time.
 *
 * @remarks
 * - **Notes:** in `WHATSAPP_NOTICE_TEMPLATES` order; each on one line, never empty.
 */
export function bookingConfirmParameters(booking: {
  firstName: string | null;
  visitDate: string | null;
  visitTime: string | null;
}): string[] {
  return [
    templateParameter({ value: booking.firstName, fallback: 'there' }),
    templateParameter({ value: booking.visitDate, fallback: '-' }),
    templateParameter({ value: booking.visitTime, fallback: '-' }),
  ];
}

/**
 * WC-9: the receipt — the amount, its invoice when it has one, the day it was paid.
 *
 * @remarks
 * - **Notes:** the amount as the stream shows money (`₹1,500.00`).
 */
export function receiptBody(receipt: ReceiptMessageCandidate): string {
  const against = receipt.invoiceNumber === null ? '' : ` for invoice ${receipt.invoiceNumber}`;
  return `Hi ${receipt.firstName}, we have received ${rupees(receipt.amount)}${against} on ${receipt.paidOn}. Thank you!`;
}

/**
 * WC-9's parameters for the `payment_receipt` template (D32): name, amount, what it paid for, day.
 *
 * @remarks
 * - **Notes:** "invoice …" when it has one, else "your visit".
 */
export function receiptParameters(receipt: ReceiptMessageCandidate): string[] {
  return [
    templateParameter({ value: receipt.firstName, fallback: 'there' }),
    rupees(receipt.amount),
    receipt.invoiceNumber === null ? 'your visit' : `invoice ${receipt.invoiceNumber}`,
    templateParameter({ value: receipt.paidOn, fallback: '-' }),
  ];
}

/**
 * The messages the app queues in an organization's rules run (launch D78): the day-before
 * reminders (WC-6), the confirm requests (WC-5) and the receipts (WC-9) — each a queued WhatsApp
 * notice on the person's stream, linked to its booking or payment, sent by the messaging worker.
 * Answers how many it queued.
 *
 * @remarks
 * - **Algorithm:** nothing unless the clinic's WhatsApp is connected and delivery is on. Reminders
 *   go first, so a booking due both a confirm request and its reminder in one run gets the
 *   reminder alone (it asks for the "Yes" too). Each booking message moves the booking's
 *   `reminder_status` (`reminder_queued`, `confirm_requested`) in the same transaction.
 * - **Failure modes:** a database error rolls the run back and propagates (BullMQ retries).
 * - **Side effects:** `contact_activities` inserts, `contacts.last_activity_at`,
 *   `appointments.reminder_status`.
 */
export async function queueClinozyMessages(options: {
  repository: TaskRulesRepository;
  messages: TaskRuleMessagesRepository;
  organization: TaskRulesOrganization;
}): Promise<number> {
  const { repository, messages, organization } = options;
  if (!(organization.isWhatsAppConnected && isMessagingDeliveryEnabled())) return 0;
  const scope = { organizationId: organization.id, timeZone: organization.timeZone };
  let queuedCount = 0;
  const queueBooking = async ({
    booking,
    reminder,
  }: {
    booking: BookingMessageCandidate;
    reminder: boolean;
  }) => {
    await repository.queueClinozyMessage({
      organizationId: organization.id,
      contactId: booking.contactId,
      body: reminder ? bookingReminderBody(booking) : bookingConfirmBody(booking),
      templateParameters: reminder
        ? bookingReminderParameters(booking)
        : bookingConfirmParameters(booking),
      link: { appointment_id: booking.appointmentId },
      automationKind: reminder
        ? CONTACT_ACTIVITY_AUTOMATION_KIND.BOOKING_REMINDER
        : CONTACT_ACTIVITY_AUTOMATION_KIND.BOOKING_CONFIRM,
      isNotice: true,
    });
    await repository.markBookingMessageQueued({
      appointmentId: booking.appointmentId,
      from: reminder
        ? [APPOINTMENT_REMINDER_STATUS.NOT_SENT, APPOINTMENT_REMINDER_STATUS.CONFIRM_REQUESTED]
        : [APPOINTMENT_REMINDER_STATUS.NOT_SENT],
      to: reminder
        ? APPOINTMENT_REMINDER_STATUS.REMINDER_QUEUED
        : APPOINTMENT_REMINDER_STATUS.CONFIRM_REQUESTED,
    });
    queuedCount += 1;
  };
  for (const booking of await messages.findReminderCandidates({
    ...scope,
    reminderHour: organization.reminderHour,
  })) {
    await queueBooking({ booking, reminder: true });
  }
  for (const booking of await messages.findConfirmRequestCandidates(scope)) {
    await queueBooking({ booking, reminder: false });
  }
  for (const receipt of await messages.findReceiptCandidates(scope)) {
    await repository.queueClinozyMessage({
      organizationId: organization.id,
      contactId: receipt.contactId,
      body: receiptBody(receipt),
      templateParameters: receiptParameters(receipt),
      link: { payment_id: receipt.paymentId },
      automationKind: CONTACT_ACTIVITY_AUTOMATION_KIND.PAYMENT_RECEIPT,
      isNotice: true,
    });
    queuedCount += 1;
  }
  return queuedCount;
}
