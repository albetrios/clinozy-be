import { type SQL, sql } from 'drizzle-orm';
import { assertWorkerDatabaseContext } from '@/infrastructure/database/contexts/database-context-runtime.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { contact_activities } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.schema.js';
import { CONTACT_ACTIVITY_AUTOMATION_KIND } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import {
  APPOINTMENT_REMINDER_STATUS,
  APPOINTMENT_STATUS,
} from '@/domains/app/sub-domains/appointments/appointments.constants.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { payments } from '@/domains/app/sub-domains/billing/payments/payments.schema.js';
import { PAYMENT_KIND } from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import { TASK_RULES_MESSAGES_PER_KIND } from './workers/task-rules.constants.js';

/** A booking a confirm request or a reminder goes to (WC-5, WC-6). */
export interface BookingMessageCandidate {
  appointmentId: number;
  contactId: number;
  firstName: string;
  branchName: string;
  /** `12 Oct`. */
  visitDate: string;
  /** `10:30`. */
  visitTime: string;
  status: string;
}

/** A receipt the person gets on WhatsApp (WC-9). */
export interface ReceiptMessageCandidate {
  paymentId: number;
  contactId: number;
  firstName: string;
  amount: number;
  invoiceNumber: string | null;
  /** `12 Oct`. */
  paidOn: string;
}

/** A row of a candidates read (bigint ids and numerics come back as text). */
type CandidateRow = Record<string, string | number | null>;

/** The organization's clock: `now()` in its time zone. */
function localNow(timeZone: string): SQL {
  return sql`(now() at time zone ${timeZone})`;
}

/** A booking's start, as an instant. */
function startOf(timeZone: string): SQL {
  return sql`((${appointments.appointment_date} + ${appointments.start_time}) at time zone ${timeZone})`;
}

/** The reads every booking message shares: the person, the branch, the date and time as shown. */
function bookingSelect(): SQL {
  return sql`select ${appointments.id} as appointment_id, ${appointments.contact_id} as contact_id,
      ${contacts.first_name} as first_name, ${branches.name} as branch_name,
      to_char(${appointments.appointment_date}, 'DD Mon') as visit_date,
      to_char(${appointments.start_time}, 'HH24:MI') as visit_time,
      ${appointments.status} as status
    from ${appointments}
    join ${contacts} on ${contacts.id} = ${appointments.contact_id}
    join ${branches} on ${branches.id} = ${appointments.branch_id}`;
}

/** A booking candidate row as the step reads it. */
function toBooking(row: CandidateRow): BookingMessageCandidate {
  return {
    appointmentId: Number(row.appointment_id),
    contactId: Number(row.contact_id),
    firstName: String(row.first_name),
    branchName: String(row.branch_name),
    visitDate: String(row.visit_date),
    visitTime: String(row.visit_time),
    status: String(row.status),
  };
}

/**
 * The reads of the messages Clinozy queues in the rules run (launch D78 — WC-5, WC-6, WC-9), on a
 * handle pinned to one organization's context.
 *
 * @remarks
 * - **Algorithm:** each read is one SQL over its records, at most a batch per run, earliest first:
 *   the day-before reminders (tomorrow's scheduled or confirmed bookings once the clinic's reminder
 *   hour has passed, booked before it, nothing failed, no reminder yet), the confirm requests
 *   (scheduled bookings not asked yet, more than 2 hours and at most 60 days ahead, no walk-in)
 *   and the receipts (`receipt` payments of the last 24 hours with a contact, live and not
 *   reversed, with no receipt message yet).
 * - **Failure modes:** a database error propagates to the run (BullMQ retries it).
 */
export class TaskRuleMessagesRepository {
  constructor(private readonly databaseHandle: WorkerDatabaseHandle) {}

  /** WC-6: tomorrow's bookings whose day-before reminder is due now. */
  async findReminderCandidates(options: {
    organizationId: number;
    timeZone: string;
    reminderHour: number;
  }): Promise<BookingMessageCandidate[]> {
    const { organizationId, timeZone, reminderHour } = options;
    const reminderAt = sql`(((${appointments.appointment_date} - 1) + make_time(${reminderHour}, 0, 0)) at time zone ${timeZone})`;
    const rows = (await this.databaseHandle.execute(sql`${bookingSelect()}
      where ${appointments.organization_id} = ${organizationId}
        and ${appointments.deleted_at} is null
        and ${appointments.is_walk_in} = false
        and ${contacts.deleted_at} is null
        and ${contacts.notices_stopped_at} is null
        and ${appointments.status} in (${APPOINTMENT_STATUS.SCHEDULED}, ${APPOINTMENT_STATUS.CONFIRMED})
        and ${appointments.reminder_status} in (${APPOINTMENT_REMINDER_STATUS.NOT_SENT}, ${APPOINTMENT_REMINDER_STATUS.CONFIRM_REQUESTED})
        and ${appointments.appointment_date} = (${localNow(timeZone)})::date + 1
        and now() >= ${reminderAt}
        and ${appointments.created_at} < ${reminderAt}
      order by ${startOf(timeZone)}, ${appointments.id}
      limit ${TASK_RULES_MESSAGES_PER_KIND}`)) as unknown as CandidateRow[];
    return rows.map(toBooking);
  }

  /** WC-5: scheduled bookings not asked to confirm yet. */
  async findConfirmRequestCandidates(options: {
    organizationId: number;
    timeZone: string;
  }): Promise<BookingMessageCandidate[]> {
    const { organizationId, timeZone } = options;
    const start = startOf(timeZone);
    const rows = (await this.databaseHandle.execute(sql`${bookingSelect()}
      where ${appointments.organization_id} = ${organizationId}
        and ${appointments.deleted_at} is null
        and ${appointments.is_walk_in} = false
        and ${contacts.deleted_at} is null
        and ${contacts.notices_stopped_at} is null
        and ${appointments.status} = ${APPOINTMENT_STATUS.SCHEDULED}
        and ${appointments.reminder_status} = ${APPOINTMENT_REMINDER_STATUS.NOT_SENT}
        and ${start} > now() + interval '2 hours'
        and ${start} <= now() + interval '60 days'
      order by ${start}, ${appointments.id}
      limit ${TASK_RULES_MESSAGES_PER_KIND}`)) as unknown as CandidateRow[];
    return rows.map(toBooking);
  }

  /** WC-9: the day's receipts with no receipt message yet. */
  async findReceiptCandidates(options: {
    organizationId: number;
    timeZone: string;
  }): Promise<ReceiptMessageCandidate[]> {
    const { organizationId, timeZone } = options;
    const reversal = sql`(select 1 from ${payments} as reversal where reversal.reverses_payment_id = ${payments.id} and reversal.deleted_at is null)`;
    const receiptMessage = sql`(select 1 from ${contact_activities}
      where ${contact_activities.payment_id} = ${payments.id}
        and ${contact_activities.automation_kind} = ${CONTACT_ACTIVITY_AUTOMATION_KIND.PAYMENT_RECEIPT})`;
    const rows = (await this.databaseHandle.execute(sql`select ${payments.id} as payment_id,
        ${payments.contact_id} as contact_id, ${contacts.first_name} as first_name,
        ${payments.amount}::text as amount, ${invoices.invoice_number} as invoice_number,
        to_char(${payments.paid_at} at time zone ${timeZone}, 'DD Mon') as paid_on
      from ${payments}
      join ${contacts} on ${contacts.id} = ${payments.contact_id}
      left join ${invoices} on ${invoices.id} = ${payments.invoice_id}
      where ${payments.organization_id} = ${organizationId}
        and ${payments.kind} = ${PAYMENT_KIND.RECEIPT}
        and ${payments.deleted_at} is null
        and ${contacts.deleted_at} is null
        and ${contacts.notices_stopped_at} is null
        and ${payments.created_at} >= now() - interval '24 hours'
        and not exists ${reversal}
        and not exists ${receiptMessage}
      order by ${payments.created_at}, ${payments.id}
      limit ${TASK_RULES_MESSAGES_PER_KIND}`)) as unknown as CandidateRow[];
    return rows.map((row) => ({
      paymentId: Number(row.payment_id),
      contactId: Number(row.contact_id),
      firstName: String(row.first_name),
      amount: Number(row.amount),
      invoiceNumber:
        row.invoice_number === null || row.invoice_number === ''
          ? null
          : String(row.invoice_number),
      paidOn: String(row.paid_on),
    }));
  }
}

/** Worker-only factory — a handle pinned to one organization's context (D78). */
export function createWorkerTaskRuleMessagesRepository(
  databaseHandle: WorkerDatabaseHandle,
): TaskRuleMessagesRepository {
  assertWorkerDatabaseContext(['organization']);
  return new TaskRuleMessagesRepository(databaseHandle);
}
