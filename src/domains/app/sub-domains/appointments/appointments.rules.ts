import {
  type BaseRecordRow,
  findBranchBookingHours,
  findMembershipWorkingHours,
} from '@/domains/app/base-record.repository.js';
import type {
  BaseRecordChange,
  BaseRecordCollectionInput,
  BaseRecordRules,
  BaseRecordWriteContext,
} from '@/domains/app/base-record.types.js';
import { BranchHolidaysRepository } from '@/domains/app/sub-domains/branches/branch-holidays/branch-holidays.repository.js';
import { BranchMachinesRepository } from '@/domains/app/sub-domains/branches/branch-machines/branch-machines.repository.js';
import { BranchRoomsRepository } from '@/domains/app/sub-domains/branches/branch-rooms/branch-rooms.repository.js';
import { ContactsRepository } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import { ContactActivitiesRepository } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.repository.js';
import { CONTACT_ACTIVITY_TYPE } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import { ContactMembersRepository } from '@/domains/app/sub-domains/contacts/contact-members/contact-members.repository.js';
import { LeadsRepository } from '@/domains/app/sub-domains/leads/leads.repository.js';
import { OfferingsRepository } from '@/domains/app/sub-domains/offerings/offerings.repository.js';
import { PatientsRepository } from '@/domains/app/sub-domains/patients/patients.repository.js';
import { requestTaskRulesRun } from '@/domains/app/sub-domains/tasks/queues/task-rules.queue.js';
import { runEnqueueAfterCommit } from '@/core/events/event-bus.js';
import { ConflictError, fieldValidationError, NotFoundError } from '@/shared/errors/index.js';
import {
  addDaysToCalendarDate,
  calendarDateInTimeZone,
  clockTimeInTimeZone,
  clockTimeOfMinutes,
  instantInTimeZone,
  minutesOfClockTime,
  splitRecordIds,
  toHourMinute,
  weekdayOfCalendarDate,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  APPOINTMENT_BOOKING_MESSAGES_RESET,
  APPOINTMENT_DAILY_COUNTS_MAX_DAYS,
  APPOINTMENT_DEFAULT_DURATION,
  APPOINTMENT_DURATION_STEP,
  APPOINTMENT_MOVABLE_STATUS_VALUES,
  APPOINTMENT_STATUS,
  APPOINTMENT_STATUS_VALUES,
  APPOINTMENT_VISIT_STAGE_VALUES,
} from './appointments.constants.js';
import type { AppointmentsRepository } from './appointments.repository.js';

/** The fields that place an appointment — a change to any of them re-checks the slot. */
const SLOT_FIELDS = [
  'branch_id',
  'appointment_date',
  'start_time',
  'duration_minutes',
  'doctor_membership_id',
  'branch_room_id',
  'branch_machine_id',
] as const;
/** The grid slots start on by default (minutes). */
const DEFAULT_SLOT_STEP_MINUTES = 15;
/** The activity line a check-in leaves when it moves the lead (6.10). */
const CHECK_IN_ACTIVITY_BODY = 'Moved to Clinic visited at check-in';

const branchHolidaysRepository = new BranchHolidaysRepository();
const branchRoomsRepository = new BranchRoomsRepository();
const branchMachinesRepository = new BranchMachinesRepository();
const contactsRepository = new ContactsRepository();
const contactActivitiesRepository = new ContactActivitiesRepository();
const contactMembersRepository = new ContactMembersRepository();
const leadsRepository = new LeadsRepository();
const offeringsRepository = new OfferingsRepository();
const patientsRepository = new PatientsRepository();

/** Where and when one booking sits, in internal ids and minutes since midnight. */
interface Booking {
  organizationId: number;
  branchId: number;
  date: string;
  startMinutes: number;
  durationMinutes: number;
  doctorMembershipId: number | null;
}

/** Why a day (or a time) takes no bookings — the `slot_closed` reason (6.9) — with a holiday's label. */
interface DayClosure {
  reason: 'branch_inactive' | 'closed_day' | 'holiday' | 'doctor_off';
  label: string | null;
}

/** The hours a booking must fit: the branch's, and the doctor's when one is named (A4). */
interface BookingWindow {
  closure: DayClosure | null;
  opensAt: number;
  closesAt: number;
  doctorStartsAt: number | null;
  doctorEndsAt: number | null;
}

/** The organization's "now": its time zone, its date and its minutes since midnight. */
async function organizationNow(
  context: BaseRecordWriteContext,
): Promise<{ timeZone: string; today: string; nowMinutes: number }> {
  const { timezone: timeZone } = await context.ports.organizationSettings(context.scope);
  return {
    timeZone,
    today: calendarDateInTimeZone(timeZone),
    nowMinutes: minutesOfClockTime(clockTimeInTimeZone(timeZone)),
  };
}

/** A reference column's internal id, or null. */
function idOf(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

/** The booking a write's values (over the existing row's) describe. */
function bookingOf(options: {
  organizationId: number;
  values: Record<string, unknown>;
  existing?: BaseRecordRow;
}): Booking {
  const merged: Record<string, unknown> = { ...options.existing, ...options.values };
  return {
    organizationId: options.organizationId,
    branchId: Number(merged.branch_id),
    date: String(merged.appointment_date),
    startMinutes: minutesOfClockTime(String(merged.start_time)),
    durationMinutes: Number(merged.duration_minutes ?? APPOINTMENT_DEFAULT_DURATION),
    doctorMembershipId: idOf(merged.doctor_membership_id),
  };
}

/** The 409 a closed day or time answers with (6.9). */
function slotClosedError(closure: DayClosure): ConflictError {
  return new ConflictError('errors:slotClosed', { reason: closure.reason }).withReason(
    'slot_closed',
  );
}

/**
 * The hours a booking on the date must fit, or why the day is closed: the branch inactive, a day it
 * does not work, a holiday, or the doctor off that day (sub-domains 1 and 2).
 */
async function bookingWindow(options: {
  organizationId: number;
  branchId: number;
  date: string;
  doctorMembershipId: number | null;
}): Promise<BookingWindow> {
  const hours = await findBranchBookingHours({
    organizationId: options.organizationId,
    branchId: options.branchId,
  });
  if (!hours) throw new NotFoundError('Branch');
  const window: BookingWindow = {
    closure: null,
    opensAt: minutesOfClockTime(hours.opens_at),
    closesAt: minutesOfClockTime(hours.closes_at),
    doctorStartsAt: null,
    doctorEndsAt: null,
  };
  const weekday = weekdayOfCalendarDate(options.date);
  if (!hours.is_active) return { ...window, closure: { reason: 'branch_inactive', label: null } };
  if (!hours.working_days.includes(weekday)) {
    return { ...window, closure: { reason: 'closed_day', label: null } };
  }
  const holidays = await branchHolidaysRepository.list(options.organizationId, {
    limit: 1,
    equals: { branch_id: options.branchId, holiday_date: options.date },
    withTotal: false,
  });
  const holiday = holidays.items[0];
  if (holiday) return { ...window, closure: { reason: 'holiday', label: String(holiday.label) } };
  if (options.doctorMembershipId === null) return window;
  const doctor = await findMembershipWorkingHours({
    organizationId: options.organizationId,
    membershipId: options.doctorMembershipId,
  });
  if (!doctor) return window;
  if (!doctor.working_days.includes(weekday)) {
    return { ...window, closure: { reason: 'doctor_off', label: null } };
  }
  return {
    ...window,
    doctorStartsAt: minutesOfClockTime(doctor.work_starts_at),
    doctorEndsAt: minutesOfClockTime(doctor.work_ends_at),
  };
}

/**
 * Refuses a booking the slot rules forbid (6.9): a past start, a closed day, a time outside the
 * branch's hours or the doctor's (A4). A clash with another booking is the database's — the
 * exclusion constraints (A3), mapped to `slot_taken` by the service.
 */
async function assertBookable(booking: Booking, context: BaseRecordWriteContext): Promise<void> {
  const now = await organizationNow(context);
  const startsInPast =
    booking.date < now.today ||
    (booking.date === now.today && booking.startMinutes < now.nowMinutes);
  if (startsInPast) throw new ConflictError('errors:slotInPast').withReason('slot_in_past');
  const window = await bookingWindow(booking);
  if (window.closure) throw slotClosedError(window.closure);
  const end = booking.startMinutes + booking.durationMinutes;
  if (booking.startMinutes < window.opensAt || end > window.closesAt) {
    throw new ConflictError('errors:slotOutsideHours', {
      opens_at: clockTimeOfMinutes(window.opensAt),
      closes_at: clockTimeOfMinutes(window.closesAt),
    }).withReason('slot_outside_hours');
  }
  const outsideDoctorHours =
    window.doctorStartsAt !== null &&
    window.doctorEndsAt !== null &&
    (booking.startMinutes < window.doctorStartsAt || end > window.doctorEndsAt);
  if (outsideDoctorHours) throw slotClosedError({ reason: 'doctor_off', label: null });
}

/** A2: the room and the machine belong to the appointment's branch — 400 naming the field. */
async function assertPlaceInBranch(merged: Record<string, unknown>): Promise<void> {
  const places = [
    { field: 'branch_room_id', repository: branchRoomsRepository },
    { field: 'branch_machine_id', repository: branchMachinesRepository },
  ] as const;
  for (const { field, repository } of places) {
    const id = idOf(merged[field]);
    if (id === null) continue;
    const place = await repository.findById(id);
    if (place?.branch_id !== merged.branch_id) {
      throw fieldValidationError({
        field,
        messageKey: 'errors:validation.appointmentPlaceOtherBranch',
      });
    }
  }
}

/** Whether a write's value differs from the stored one (times compared as `HH:mm`). */
function changed(field: string, value: unknown, existing: BaseRecordRow): boolean {
  if (value === undefined) return false;
  if (field === 'start_time') return value !== toHourMinute(String(existing.start_time));
  return value !== existing[field];
}

/** The 409 of a move the floor or the lifecycle does not allow (A5, A11). */
function notAllowed(action: string, status: string): ConflictError {
  return new ConflictError('errors:recordTransitionNotAllowed', { action, status }).withReason(
    'transition_not_allowed',
  );
}

/** A walk-in (A6): today at now (on the 5-minute grid), checked in at once, stage `waiting`. */
async function placeWalkIn(
  values: Record<string, unknown>,
  context: BaseRecordWriteContext,
): Promise<void> {
  const now = await organizationNow(context);
  const at = new Date();
  values.appointment_date = now.today;
  values.start_time = clockTimeOfMinutes(
    now.nowMinutes - (now.nowMinutes % APPOINTMENT_DURATION_STEP),
  );
  values.status = APPOINTMENT_STATUS.CHECKED_IN;
  values.checked_in_at = at;
  values.visit_stage = APPOINTMENT_VISIT_STAGE_VALUES[0];
  values.visit_stage_changed_at = at;
}

/** A13: a booking without a label takes its offering's name — 400 on `service_label` without either. */
async function fillServiceLabel(values: Record<string, unknown>): Promise<void> {
  if (values.service_label !== undefined) return;
  const offering =
    typeof values.offering_id === 'number'
      ? await offeringsRepository.findById(values.offering_id)
      : null;
  if (!offering) {
    throw fieldValidationError({
      field: 'service_label',
      messageKey: 'errors:validation.appointmentServiceLabelRequired',
    });
  }
  values.service_label = String(offering.name).slice(0, 120);
}

/**
 * A check-in converts (A14, L8): the contact's open lead moves to `clinic_visited` (with a `system`
 * line in its stream) and a contact without a patient file gets one — home branch and usual doctor
 * from the appointment, `lead_id` the lead (P10), not yet converted (P4) — in the check-in's
 * transaction.
 */
async function convertAtCheckIn(
  row: BaseRecordRow,
  context: BaseRecordWriteContext,
): Promise<void> {
  const contactId = row.contact_id as number;
  const leadId = await leadsRepository.markVisited({ contactId, userId: context.userId });
  if (leadId !== null) {
    await contactActivitiesRepository.insert({
      organization_id: context.organizationId,
      contact_id: contactId,
      type: CONTACT_ACTIVITY_TYPE.SYSTEM,
      body: CHECK_IN_ACTIVITY_BODY,
      appointment_id: row.id,
      created_by_user_id: context.userId,
      updated_by_user_id: context.userId,
    });
  }
  if ((await contactsRepository.findPatientFile(contactId)) !== null) return;
  // P4: opening the file does not convert it — the first treatment does (7.H)
  await patientsRepository.insert({
    organization_id: context.organizationId,
    contact_id: contactId,
    home_branch_id: row.branch_id,
    doctor_membership_id: row.doctor_membership_id,
    lead_id: leadId,
    created_by_user_id: context.userId,
    updated_by_user_id: context.userId,
  });
}

/** CT11: the appointment's doctor and therapist handle its contact. */
async function addTeamToContact(
  row: BaseRecordRow,
  context: BaseRecordWriteContext,
): Promise<void> {
  const membershipIds = [row.doctor_membership_id, row.therapist_membership_id].filter(
    (id): id is number => typeof id === 'number',
  );
  await contactMembersRepository.addForContact({
    organizationId: context.organizationId,
    contactId: row.contact_id as number,
    membershipIds,
    userId: context.userId,
  });
}

/** Adds what an appointment reads of others to a page (A1): the contact summary, its patient file and open lead. */
async function decorateAppointments(outputs: Record<string, unknown>[]): Promise<void> {
  const contactIds = [...new Set(outputs.map((output) => String(output.contact_id)))];
  const contacts = new Map(
    (await contactsRepository.findSummaries(contactIds)).map((contact) => [contact.id, contact]),
  );
  const patientFiles = await contactsRepository.findPatientFiles(contactIds);
  const openLeads = await leadsRepository.findOpenLeadsOfContacts(contactIds);
  for (const output of outputs) {
    const contactId = String(output.contact_id);
    const contact = contacts.get(contactId);
    output.contact = contact
      ? {
          id: contact.id,
          contact_number: contact.contact_number,
          first_name: contact.first_name,
          last_name: contact.last_name,
          primary_phone: contact.primary_phone,
        }
      : null;
    output.patient_id = patientFiles.get(contactId)?.id ?? null;
    output.lead_id = openLeads.get(contactId)?.id ?? null;
  }
}

/** The days of a `daily-counts` window, after checking it is 1 to 62 days (400 on `date_to`). */
function countsWindow(input: Record<string, unknown>): { from: string; days: number } {
  const from = String(input.date_from);
  const days = Math.round((Date.parse(String(input.date_to)) - Date.parse(from)) / 86_400_000) + 1;
  if (days < 1 || days > APPOINTMENT_DAILY_COUNTS_MAX_DAYS) {
    throw fieldValidationError({
      field: 'date_to',
      messageKey: 'errors:validation.appointmentCountsRange',
      messageParams: { days: APPOINTMENT_DAILY_COUNTS_MAX_DAYS },
    });
  }
  return { from, days };
}

/**
 * The free slots of a day (6.8 #3): the branch's hours, working days and holidays, the doctor's
 * days and hours, and the doctor's, room's and machine's bookings — the exclusion rules' read.
 */
async function slotsOfDay(
  { input, context, branchScope, resolveReferences }: BaseRecordCollectionInput,
  repository: AppointmentsRepository,
): Promise<unknown> {
  const scope = await branchScope([String(input.branch_id)]);
  const references: Record<string, unknown> = {
    branch_id: input.branch_id,
    doctor_membership_id: input.doctor_membership_id,
    branch_room_id: input.branch_room_id,
    branch_machine_id: input.branch_machine_id,
  };
  await resolveReferences(references);
  const branchId = Number(references.branch_id);
  if (scope && !scope.ids.includes(branchId)) throw new NotFoundError('Branch');
  const date = String(input.appointment_date);
  const duration = Number(input.duration_minutes);
  const step = Number(input.step_minutes ?? DEFAULT_SLOT_STEP_MINUTES);
  const now = await organizationNow(context);
  const closed = (reason: string, label: string | null = null) => ({
    appointment_date: date,
    is_open: false,
    closed_reason: reason,
    closed_label: label,
    slots: [],
  });
  if (date < now.today) return closed('past');
  const window = await bookingWindow({
    organizationId: context.organizationId,
    branchId,
    date,
    doctorMembershipId: idOf(references.doctor_membership_id),
  });
  if (window.closure) return closed(window.closure.reason, window.closure.label);
  const busy = (
    await repository.findBusySpans({
      organizationId: context.organizationId,
      date,
      resources: {
        doctor_membership_id: idOf(references.doctor_membership_id),
        branch_room_id: idOf(references.branch_room_id),
        branch_machine_id: idOf(references.branch_machine_id),
      },
    })
  ).map((span) => {
    const start = minutesOfClockTime(span.start);
    return { start, end: start + span.durationMinutes };
  });
  const opensAt = Math.max(window.opensAt, window.doctorStartsAt ?? window.opensAt);
  const closesAt = Math.min(window.closesAt, window.doctorEndsAt ?? window.closesAt);
  const slots: { start_time: string; end_time: string }[] = [];
  for (let start = opensAt; start + duration <= closesAt; start += step) {
    if (date === now.today && start < now.nowMinutes) continue;
    const end = start + duration;
    if (busy.some((interval) => interval.start < end && start < interval.end)) continue;
    slots.push({ start_time: clockTimeOfMinutes(start), end_time: clockTimeOfMinutes(end) });
  }
  return { appointment_date: date, is_open: true, closed_reason: null, closed_label: null, slots };
}

/** The counts per day and status of a window (6.8 #4) — every day and every status, zeros included. */
async function dailyCounts({
  input,
  context,
  repository,
  branchScope,
  resolveReferences,
}: BaseRecordCollectionInput): Promise<unknown> {
  const window = countsWindow(input);
  const references: Record<string, unknown> = { doctor_membership_id: input.doctor_membership_id };
  await resolveReferences(references);
  const rows = await repository.groupCounts({
    organizationId: context.organizationId,
    columns: ['appointment_date', 'status'],
    equals: { doctor_membership_id: references.doctor_membership_id },
    ranges: {
      appointment_date: {
        from: window.from,
        to: addDaysToCalendarDate({ date: window.from, days: window.days }),
      },
    },
    branchScope: await branchScope(splitRecordIds(input.branch_ids as string | undefined)),
  });
  const days = new Map<string, { total: number; by_status: Record<string, number> }>();
  for (let offset = 0; offset < window.days; offset += 1) {
    const byStatus = Object.fromEntries(APPOINTMENT_STATUS_VALUES.map((status) => [status, 0]));
    days.set(addDaysToCalendarDate({ date: window.from, days: offset }), {
      total: 0,
      by_status: byStatus,
    });
  }
  for (const row of rows) {
    const day = days.get(String(row.appointment_date));
    if (!day) continue;
    const count = Number(row.count);
    day.total += count;
    day.by_status[String(row.status)] = (day.by_status[String(row.status)] ?? 0) + count;
  }
  return [...days].map(([appointmentDate, day]) => ({ appointment_date: appointmentDate, ...day }));
}

/** Checks a move of a booking (6.9): still movable, bookable, and stamped as rescheduled (A5). */
async function prepareMove(
  values: Record<string, unknown>,
  existing: BaseRecordRow,
  context: BaseRecordWriteContext,
): Promise<void> {
  if (!(APPOINTMENT_MOVABLE_STATUS_VALUES as readonly unknown[]).includes(existing.status)) {
    throw new ConflictError('errors:appointmentNotMovable', {
      status: String(existing.status),
    }).withReason('appointment_not_movable');
  }
  await assertBookable(
    bookingOf({ organizationId: context.organizationId, values, existing }),
    context,
  );
  const moved =
    changed('appointment_date', values.appointment_date, existing) ||
    changed('start_time', values.start_time, existing);
  if (!moved) return;
  const { timeZone } = await organizationNow(context);
  values.rescheduled_from = instantInTimeZone({
    date: String(existing.appointment_date),
    time: String(existing.start_time),
    timeZone,
  });
  values.move_count = Number(existing.move_count) + 1;
  // A confirmed booking moved returns to scheduled (A5), and its messages start over (WC-7)
  values.status = APPOINTMENT_STATUS.SCHEDULED;
  Object.assign(values, APPOINTMENT_BOOKING_MESSAGES_RESET);
}

/** Whether a write moved the booking to another day or time — {@link prepareMove} counted it. */
function wasMoved(row: BaseRecordRow, change: BaseRecordChange): boolean {
  return (
    change.kind === 'update' &&
    change.before !== undefined &&
    Number(row.move_count) > Number(change.before.move_count)
  );
}

/** The lifecycle actions that end what the booking's messages were about (WC-7). */
const BOOKING_MESSAGE_STOPPING_ACTIONS: ReadonlySet<string> = new Set([
  'cancel',
  'no-show',
  'reinstate',
]);

/**
 * WC-5, WC-7 (launch D78): a move, a cancel, a no-show, a reinstate or a delete stops the booking
 * message still waiting in the queue; a booking, a move and a reinstate ask for the rules run that
 * sends the confirm request right after the commit.
 */
async function followBookingMessages(
  repository: AppointmentsRepository,
  row: BaseRecordRow,
  change: BaseRecordChange,
  context: BaseRecordWriteContext,
): Promise<void> {
  const moved = wasMoved(row, change);
  const action = change.kind === 'transition' ? change.action : undefined;
  const stops =
    moved ||
    change.kind === 'delete' ||
    (action !== undefined && BOOKING_MESSAGE_STOPPING_ACTIONS.has(action));
  if (stops) await repository.stopQueuedBookingMessages(Number(row.id));
  if (change.kind === 'create' || moved || action === 'reinstate') {
    const { organizationPublicId } = context.scope;
    await runEnqueueAfterCommit(() => requestTaskRulesRun(organizationPublicId));
  }
}

/** A check-in waits for the booking's day, a no-show for its start (6.9) — 409 `appointment_not_due` before. */
async function assertDue(
  action: 'check-in' | 'no-show',
  existing: BaseRecordRow,
  context: BaseRecordWriteContext,
): Promise<void> {
  const now = await organizationNow(context);
  const date = String(existing.appointment_date);
  const started =
    date < now.today ||
    (date === now.today && minutesOfClockTime(String(existing.start_time)) <= now.nowMinutes);
  if ((action === 'no-show' && !started) || (action === 'check-in' && date > now.today)) {
    throw new ConflictError('errors:appointmentNotDue', { action }).withReason(
      'appointment_not_due',
    );
  }
}

/** The lifecycle's own checks (6.9): due dates, the floor's forward-only stage, pause and resume (A5, A11). */
async function prepareLifecycle(
  action: string,
  values: Record<string, unknown>,
  existing: BaseRecordRow,
  context: BaseRecordWriteContext,
): Promise<void> {
  const status = String(existing.status);
  if (action === 'reinstate') {
    await assertBookable(
      bookingOf({ organizationId: context.organizationId, values: {}, existing }),
      context,
    );
  } else if (action === 'check-in' || action === 'no-show') {
    await assertDue(action, existing, context);
  } else if (
    action === 'undo-check-in' &&
    existing.visit_stage !== APPOINTMENT_VISIT_STAGE_VALUES[0]
  ) {
    throw new ConflictError('errors:visitStarted').withReason('visit_started');
  } else if (action === 'stage') {
    const order = APPOINTMENT_VISIT_STAGE_VALUES as readonly unknown[];
    if (order.indexOf(values.visit_stage) <= order.indexOf(existing.visit_stage)) {
      throw notAllowed(`stage:${String(values.visit_stage)}`, String(existing.visit_stage));
    }
  } else if (action === 'pause' && existing.visit_paused_at !== null) {
    throw notAllowed(action, 'paused');
  } else if (action === 'resume' && existing.visit_paused_at === null) {
    throw notAllowed(action, status);
  }
}

/**
 * The appointments rules (launch ROUTE #132, routes-final 6): the slot rules on every booking
 * (A3, A4), walk-ins (A6), moves (A5), the lifecycle and the floor (A5, A10, A11), the check-in
 * conversion (A14), the team on the contact (CT11), the contact summary, and the calendar's
 * `slots` and `daily-counts` reads.
 *
 * @remarks
 * - **Algorithm:** a create, a move (`PATCH` of a placing field) and a reinstate pass
 *   {@link assertBookable} — past, closed day, branch hours, doctor's days and hours; the database's
 *   exclusion constraints refuse a clash (`slot_taken`). A room or machine of another branch is a
 *   400 (A2); a booking without a label takes its offering's name (A13). A walk-in is placed at now
 *   and checked in at once, outside the slot rules. A move stamps `rescheduled_from`, counts
 *   `move_count` and returns a confirmed booking to `scheduled`. Check-in (or a walk-in) converts
 *   (A14). The stage moves forward only; pause and resume toggle `visit_paused_at`.
 * - **Failure modes:** `ConflictError` `slot_in_past`, `slot_closed`, `slot_outside_hours`,
 *   `appointment_not_movable`, `appointment_not_due`, `visit_started`, `transition_not_allowed`;
 *   `ValidationError` on `branch_room_id`, `branch_machine_id`, `service_label`, `date_to`.
 */
export function createAppointmentsRules(repository: AppointmentsRepository): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      await fillServiceLabel(values);
      await assertPlaceInBranch(values);
      if (values.is_walk_in === true) {
        await placeWalkIn(values, context);
        return;
      }
      await assertBookable(bookingOf({ organizationId: context.organizationId, values }), context);
    },
    prepareUpdate: async (values, existing, context) => {
      const placing = SLOT_FIELDS.some((field) => changed(field, values[field], existing));
      if (!placing) return;
      await assertPlaceInBranch({ ...existing, ...values });
      await prepareMove(values, existing, context);
    },
    prepareTransition: (action, values, existing, context) =>
      prepareLifecycle(action, values, existing, context),
    afterWrite: async (row, change, context) => {
      const checkedIn =
        (change.kind === 'create' && row.is_walk_in === true) ||
        (change.kind === 'transition' && change.action === 'check-in');
      if (checkedIn) await convertAtCheckIn(row, context);
      if (checkedIn || change.kind === 'create' || change.kind === 'update') {
        await addTeamToContact(row, context);
      }
      await followBookingMessages(repository, row, change, context);
    },
    decorate: decorateAppointments,
    collectionViews: {
      slots: (input) => slotsOfDay(input, repository),
      'daily-counts': dailyCounts,
    },
  };
}
