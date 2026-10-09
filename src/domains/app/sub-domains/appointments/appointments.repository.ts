import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository, nullsLastSortKeys } from '@/domains/app/base-record.repository.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { contactLinkedSearchCondition } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import { contact_activities } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.schema.js';
import {
  CONTACT_ACTIVITY_BOOKING_AUTOMATION_KINDS,
  CONTACT_ACTIVITY_DELIVERY_STATUS,
  CONTACT_ACTIVITY_REMINDER_STOPPED_REASON,
} from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import type { ContactLinkedSearch } from '@/domains/app/sub-domains/contacts/contacts.validator.js';
import { buildContainsLikePattern } from '@/shared/utils/http/list-query.util.js';
import { toHourMinute } from '@/shared/utils/validation/record-fields.util.js';
import {
  APPOINTMENT_SLOT_HOLDING_STATUS_VALUES,
  APPOINTMENT_STATUS,
} from './appointments.constants.js';
import { appointments } from './appointments.schema.js';
import type { AppointmentSummaryOutput } from './appointments.types.js';

/** A list `q` of appointments: the contact-linked search, plus the raw text for the service label. */
type AppointmentSearch = ContactLinkedSearch & { label?: string | undefined };

/** The statuses a person's last visit is read from — they came (4.A.6). */
const VISITED_STATUS_VALUES = [APPOINTMENT_STATUS.CHECKED_IN, APPOINTMENT_STATUS.COMPLETED];
/** The statuses a person's next visit is read from — still booked. */
const UPCOMING_STATUS_VALUES = [APPOINTMENT_STATUS.SCHEDULED, APPOINTMENT_STATUS.CONFIRMED];

/** One appointment of a contact as its last or next visit (the contact's preview, 4.A.6). */
interface ContactVisitRow extends AppointmentSummaryOutput {
  contact_public_id: string;
}

/**
 * Persistence for `app.appointments` (launch ROUTE #132, routes-final 6) — the shared app record
 * reads and writes on its table, plus what a contact reads of its visits.
 *
 * @remarks
 * - **Algorithm:** `q` matches the service label, the contact (its search text or contact number)
 *   and the appointment number (`#2841`). Sorts: `appointment_date` (default — date, then start,
 *   ascending: the day view, A8), `visit_stage_changed_at` (the floor — longest in a stage first;
 *   rows outside the floor last) and `created_at` (newest first).
 * - **Failure modes:** a unique or exclusion violation propagates (the service maps
 *   `excl_appointments_*` to `slot_taken`, A3).
 */
export class AppointmentsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: appointments,
      entity: 'appointment',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        appointment_date: {
          keys: [{ value: 'appointment_date' }, { value: 'start_time' }],
          defaultOrder: 'asc',
        },
        visit_stage_changed_at: {
          keys: nullsLastSortKeys({
            value: () => sql`${appointments.visit_stage_changed_at}`,
            sqlType: 'timestamptz',
            empty: sql`'-infinity'::timestamptz`,
            defaultOrder: 'asc',
          }),
          defaultOrder: 'asc',
        },
        created_at: { keys: [{ value: 'created_at' }], defaultOrder: 'desc' },
      },
      derivedFilters: {
        search: (value, organizationId) => {
          const search = value as AppointmentSearch;
          const linked = contactLinkedSearchCondition({
            search,
            contactIdColumn: appointments.contact_id,
            recordNumberColumn: appointments.appointment_number,
            organizationId,
          });
          return search.label === undefined
            ? linked
            : sql`(${linked} or ${appointments.service_label} ilike ${buildContainsLikePattern(search.label)})`;
        },
      },
      defaultSort: 'appointment_date',
      defaultOrder: 'asc',
    });
  }

  /**
   * WC-7 (launch D78): the booking's confirm request or reminder still waiting in the queue — no
   * delivery job holds it — is stopped (`failed`, `reminder_stopped`); one in flight goes.
   */
  async stopQueuedBookingMessages(appointmentId: number): Promise<void> {
    await getRequestDatabase()
      .update(contact_activities)
      .set({
        delivery_status: CONTACT_ACTIVITY_DELIVERY_STATUS.FAILED,
        failure_reason: CONTACT_ACTIVITY_REMINDER_STOPPED_REASON,
        failed_at: sql`now()`,
        updated_at: sql`greatest(now(), ${contact_activities.created_at})`,
      } as never)
      .where(
        and(
          eq(contact_activities.appointment_id, appointmentId),
          inArray(contact_activities.automation_kind, [
            ...CONTACT_ACTIVITY_BOOKING_AUTOMATION_KINDS,
          ]),
          eq(contact_activities.delivery_status, CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED),
          isNull(contact_activities.delivery_claimed_at),
        ),
      );
  }

  /** Whether any live appointment points at the contact (CT7 — the contact cannot be removed). */
  async hasLiveAppointmentForContact(contactId: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq(appointments.contact_id, contactId), isNull(appointments.deleted_at)))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Each contact's last visit (the latest checked-in or completed appointment up to today) and next
   * one (the first scheduled or confirmed from today), by the contacts' public ids (4.A.6).
   */
  async findLastAndNextVisits(options: {
    contactPublicIds: readonly string[];
    today: string;
  }): Promise<{ last: Map<string, ContactVisitRow>; next: Map<string, ContactVisitRow> }> {
    const last = new Map<string, ContactVisitRow>();
    const next = new Map<string, ContactVisitRow>();
    if (options.contactPublicIds.length === 0) return { last, next };
    const rows = await getRequestDatabase()
      .select({
        contact_public_id: contacts.public_id,
        id: appointments.public_id,
        appointment_date: appointments.appointment_date,
        start_time: appointments.start_time,
        service_label: appointments.service_label,
        status: appointments.status,
      })
      .from(appointments)
      .innerJoin(contacts, eq(contacts.id, appointments.contact_id))
      .where(
        and(
          inArray(contacts.public_id, [...options.contactPublicIds]),
          isNull(appointments.deleted_at),
          or(
            and(
              inArray(appointments.status, VISITED_STATUS_VALUES),
              lte(appointments.appointment_date, options.today),
            ),
            and(
              inArray(appointments.status, UPCOMING_STATUS_VALUES),
              gte(appointments.appointment_date, options.today),
            ),
          ),
        ),
      )
      .orderBy(asc(appointments.appointment_date), asc(appointments.start_time));
    for (const row of rows) {
      const visit = { ...row, start_time: toHourMinute(row.start_time) };
      if ((VISITED_STATUS_VALUES as readonly string[]).includes(row.status)) {
        last.set(row.contact_public_id, visit);
      } else if (!next.has(row.contact_public_id)) {
        next.set(row.contact_public_id, visit);
      }
    }
    return { last, next };
  }

  /**
   * The day's slot-holding bookings (walk-ins aside) of the named doctor, room or machine — the
   * busy spans the slots view leaves out (6.8 #3).
   */
  async findBusySpans(options: {
    organizationId: number;
    date: string;
    resources: Readonly<Record<string, number | null>>;
  }): Promise<{ start: string; durationMinutes: number }[]> {
    const named = Object.entries(options.resources).filter(
      (entry): entry is [string, number] => entry[1] !== null,
    );
    if (named.length === 0) return [];
    const rows = await getRequestDatabase()
      .select({ start: appointments.start_time, duration: appointments.duration_minutes })
      .from(appointments)
      .where(
        and(
          eq(appointments.organization_id, options.organizationId),
          eq(appointments.appointment_date, options.date),
          isNull(appointments.deleted_at),
          eq(appointments.is_walk_in, false),
          inArray(appointments.status, [...APPOINTMENT_SLOT_HOLDING_STATUS_VALUES]),
          or(...named.map(([column, id]) => eq(this.column(column), id))),
        ),
      )
      .orderBy(desc(appointments.start_time));
    return rows.map((row) => ({ start: row.start, durationMinutes: row.duration }));
  }
}
