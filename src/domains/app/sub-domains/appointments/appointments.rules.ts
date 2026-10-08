import {
  type BaseRecordRow,
  findBranchBookingHours,
  findMembershipWorkingDays,
} from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { BranchHolidaysRepository } from '@/domains/app/sub-domains/branches/branch-holidays/branch-holidays.repository.js';
import { LeadsRepository } from '@/domains/app/sub-domains/leads/leads.repository.js';
import { VisitsRepository } from '@/domains/app/sub-domains/visits/visits.repository.js';
import {
  acquireResourceQuotaLock,
  RESOURCE_QUOTA_LOCK_NAMESPACE,
} from '@/infrastructure/database/resource-quota-lock.util.js';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/index.js';
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
import { APPOINTMENT_STATUS_VALUES } from './appointments.constants.js';
import { AppointmentsRepository } from './appointments.repository.js';

/** Statuses that hold their slot — cancelled and no-show ones free it. */
const SLOT_HOLDING_STATUSES = ['scheduled', 'confirmed', 'checked_in', 'completed'];
/** Statuses whose date, time, length or people may still change. */
const MOVABLE_STATUSES = ['scheduled', 'confirmed'];
/** Where `POST …/status` may move an appointment from each status (D30). */
const STATUS_MOVES: Readonly<Record<string, readonly string[]>> = {
  scheduled: ['confirmed', 'checked_in', 'no_show'],
  confirmed: ['checked_in', 'no_show'],
  checked_in: ['completed'],
};
/** Lead statuses a clinic visit moves on to `clinic_visited` (later ones stay). */
const LEAD_STATUSES_BEFORE_VISIT = ['new', 'contacted', 'follow_up', 'no_response'];
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
/** The resources a slot must be clear for, with the name a `slot_taken` answer gives. */
const SLOT_RESOURCES = [
  { column: 'doctor_membership_id', resource: 'doctor' },
  { column: 'branch_room_id', resource: 'room' },
  { column: 'branch_machine_id', resource: 'machine' },
] as const;
/** The grid walk-ins snap to and slots start on by default (minutes). */
const WALK_IN_GRID_MINUTES = 5;
const DEFAULT_SLOT_STEP_MINUTES = 15;
/** One resource's appointments on one day — far below any clinic's real load. */
const DAY_BOOKINGS_LIMIT = 500;
/** The longest range `daily-counts` answers (two months of a calendar). */
const DAILY_COUNTS_MAX_DAYS = 62;

const appointmentsRepository = new AppointmentsRepository();
const branchHolidaysRepository = new BranchHolidaysRepository();
const leadsRepository = new LeadsRepository();
const visitsRepository = new VisitsRepository();

/** Where and when one booking sits, in internal ids and minutes since midnight. */
interface Booking {
  organizationId: number;
  branchId: number;
  date: string;
  startMinutes: number;
  durationMinutes: number;
  /** Each slot resource's id (`doctor_membership_id` → 12), null when not named. */
  resources: Readonly<Record<string, number | null>>;
  /** The appointment being moved — its own slot is not a clash. */
  excludeId?: number;
}

/** Why a day takes no bookings, with the holiday's label. */
interface DayClosure {
  reason: 'branch_inactive' | 'not_working_day' | 'holiday' | 'doctor_off';
  label: string | null;
}

/** The organization's "now": its date and its `HH:mm`. */
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
  const resources: Record<string, number | null> = {};
  for (const { column } of SLOT_RESOURCES) resources[column] = idOf(merged[column]);
  return {
    organizationId: options.organizationId,
    branchId: Number(merged.branch_id),
    date: String(merged.appointment_date),
    startMinutes: minutesOfClockTime(String(merged.start_time)),
    durationMinutes: Number(merged.duration_minutes ?? DEFAULT_SLOT_STEP_MINUTES * 2),
    resources,
    ...(options.existing ? { excludeId: options.existing.id } : {}),
  };
}

/** Why the branch (or the doctor) takes no bookings on the date, or null when it is open. */
async function dayClosure(options: {
  organizationId: number;
  branchId: number;
  date: string;
  doctorMembershipId: number | null;
}): Promise<{ closure: DayClosure | null; opensAt: number; closesAt: number }> {
  const hours = await findBranchBookingHours({
    organizationId: options.organizationId,
    branchId: options.branchId,
  });
  if (!hours) throw new NotFoundError('Branch');
  const window = {
    opensAt: minutesOfClockTime(hours.opens_at),
    closesAt: minutesOfClockTime(hours.closes_at),
  };
  const weekday = weekdayOfCalendarDate(options.date);
  if (!hours.is_active) return { ...window, closure: { reason: 'branch_inactive', label: null } };
  if (!hours.working_days.includes(weekday)) {
    return { ...window, closure: { reason: 'not_working_day', label: null } };
  }
  const holidays = await branchHolidaysRepository.list(options.organizationId, {
    limit: 1,
    equals: { branch_id: options.branchId, holiday_date: options.date },
    withTotal: false,
  });
  const holiday = holidays.items[0];
  if (holiday) {
    return { ...window, closure: { reason: 'holiday', label: String(holiday.label) } };
  }
  if (options.doctorMembershipId !== null) {
    const doctorDays = await findMembershipWorkingDays({
      organizationId: options.organizationId,
      membershipId: options.doctorMembershipId,
    });
    if (doctorDays && !doctorDays.includes(weekday)) {
      return { ...window, closure: { reason: 'doctor_off', label: null } };
    }
  }
  return { ...window, closure: null };
}

/** The slot-holding appointments of each named resource on the date, as minute intervals. */
async function busyIntervals(
  booking: Booking,
): Promise<{ resource: string; start: number; end: number }[]> {
  const busy: { resource: string; start: number; end: number }[] = [];
  for (const { column, resource } of SLOT_RESOURCES) {
    const id = booking.resources[column];
    if (id === null || id === undefined) continue;
    const page = await appointmentsRepository.list(booking.organizationId, {
      limit: DAY_BOOKINGS_LIMIT,
      equals: {
        appointment_date: booking.date,
        status: SLOT_HOLDING_STATUSES,
        [column]: id,
      },
      withTotal: false,
    });
    for (const row of page.items) {
      if (row.id === booking.excludeId) continue;
      const start = minutesOfClockTime(String(row.start_time));
      busy.push({ resource, start, end: start + Number(row.duration_minutes) });
    }
  }
  return busy;
}

/**
 * Refuses a booking the slot rules forbid (D28, appointments.4): a past start, a closed day, a
 * time outside the branch hours, or a clash with the doctor's, room's or machine's other
 * appointments.
 *
 * @remarks
 * - **Algorithm:** takes the day's booking lock first, so the free-slot check and the write that
 *   follows it in the same transaction cannot interleave with another booking of the day.
 * - **Failure modes:** `ConflictError` `slot_in_past`, `slot_closed`, `slot_outside_hours`,
 *   `slot_taken`.
 */
async function assertBookable(booking: Booking, context: BaseRecordWriteContext): Promise<void> {
  const now = await organizationNow(context);
  const startsInPast =
    booking.date < now.today ||
    (booking.date === now.today && booking.startMinutes < now.nowMinutes);
  if (startsInPast) {
    throw new ConflictError('errors:slotInPast').withReason('slot_in_past');
  }
  const { closure, opensAt, closesAt } = await dayClosure({
    organizationId: booking.organizationId,
    branchId: booking.branchId,
    date: booking.date,
    doctorMembershipId: booking.resources.doctor_membership_id ?? null,
  });
  if (closure) {
    throw new ConflictError('errors:slotClosed', { reason: closure.reason }).withReason(
      'slot_closed',
    );
  }
  const end = booking.startMinutes + booking.durationMinutes;
  if (booking.startMinutes < opensAt || end > closesAt) {
    throw new ConflictError('errors:slotOutsideHours', {
      opens_at: clockTimeOfMinutes(opensAt),
      closes_at: clockTimeOfMinutes(closesAt),
    }).withReason('slot_outside_hours');
  }
  await acquireResourceQuotaLock(
    RESOURCE_QUOTA_LOCK_NAMESPACE.APPOINTMENT_SLOT,
    `${booking.organizationId}:${booking.date}`,
  );
  const clash = (await busyIntervals(booking)).find(
    (interval) => interval.start < end && booking.startMinutes < interval.end,
  );
  if (clash) {
    throw new ConflictError('errors:slotTaken', {
      resource: clash.resource,
      start_time: clockTimeOfMinutes(clash.start),
    }).withReason('slot_taken');
  }
}

/** Whether a write's value differs from the stored one (times compared as `HH:mm`). */
function changed(field: string, value: unknown, existing: BaseRecordRow): boolean {
  if (value === undefined) return false;
  if (field === 'start_time') return value !== toHourMinute(String(existing.start_time));
  return value !== existing[field];
}

/** The live visit of an appointment, or null. */
async function liveVisitOf(organizationId: number, appointmentId: number) {
  const page = await visitsRepository.list(organizationId, {
    limit: 1,
    equals: { appointment_id: appointmentId },
    withTotal: false,
  });
  return page.items[0] ?? null;
}

/** A check-in's effects: the patient's visit opens on the floor, a lead becomes a clinic visit. */
async function onCheckIn(row: BaseRecordRow, context: BaseRecordWriteContext): Promise<void> {
  if (typeof row.lead_id === 'number') {
    await leadsRepository.updateMany({
      organizationId: context.organizationId,
      equals: { id: row.lead_id, status: LEAD_STATUSES_BEFORE_VISIT },
      values: { status: 'clinic_visited' },
      userId: context.userId,
    });
  }
  if (typeof row.patient_id === 'number' && !(await liveVisitOf(context.organizationId, row.id))) {
    await visitsRepository.insert({
      organization_id: context.organizationId,
      appointment_id: row.id,
      patient_id: row.patient_id,
      created_by_user_id: context.userId,
      updated_by_user_id: context.userId,
    });
  }
}

/** The ids of a `daily-counts` window, after checking it is at most two months. */
function countsWindow(input: Record<string, unknown>): { from: string; to: string; days: number } {
  const from = String(input.date_from);
  const to = String(input.date_to);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  if (days < 1 || days > DAILY_COUNTS_MAX_DAYS) {
    throw new ValidationError(
      'errors:validation.recordFieldRule',
      { field: 'date_to' },
      { date_to: [`Ask for 1 to ${DAILY_COUNTS_MAX_DAYS} days from date_from`] },
    );
  }
  return { from, to, days };
}

/**
 * The appointments rules (launch ROUTE #66): the slot rules on every booking (D28,
 * appointments.4), walk-ins (appointments.6), the status moves (D30) and their stamps, the
 * check-in effects, copying a booking, and the calendar's `slots` and `daily-counts` reads.
 *
 * @remarks
 * - **Algorithm:** a create, a move (`PATCH` of a placing field), a reinstate and a copy each pass
 *   {@link assertBookable} under the day's booking lock. A walk-in is placed at the organization's
 *   now (5-minute grid) and checked in at once, outside the slot rules — the patient is at the
 *   desk. A move records `rescheduled_from` and counts `move_count`. A check-in opens the
 *   patient's visit (stage `waiting`) and moves a lead to `clinic_visited`; undoing it removes a
 *   visit that has not started.
 * - **Failure modes:** `ConflictError` `slot_*`, `appointment_not_movable`,
 *   `appointment_not_due`, `visit_started`, `transition_not_allowed`.
 */
export const appointmentsRules: BaseRecordRules = {
  prepareCreate: async (values, context) => {
    if (values.is_walk_in === true) {
      const now = await organizationNow(context);
      values.appointment_date = now.today;
      values.start_time = clockTimeOfMinutes(
        now.nowMinutes - (now.nowMinutes % WALK_IN_GRID_MINUTES),
      );
      values.status = 'checked_in';
      values.checked_in_at = new Date();
      return;
    }
    await assertBookable(bookingOf({ organizationId: context.organizationId, values }), context);
  },
  prepareUpdate: async (values, existing, context) => {
    if (!SLOT_FIELDS.some((field) => changed(field, values[field], existing))) return;
    if (!MOVABLE_STATUSES.includes(String(existing.status))) {
      throw new ConflictError('errors:appointmentNotMovable', {
        status: String(existing.status),
      }).withReason('appointment_not_movable');
    }
    await assertBookable(
      bookingOf({ organizationId: context.organizationId, values, existing }),
      context,
    );
    if (
      changed('appointment_date', values.appointment_date, existing) ||
      changed('start_time', values.start_time, existing)
    ) {
      const { timeZone } = await organizationNow(context);
      values.rescheduled_from = instantInTimeZone({
        date: String(existing.appointment_date),
        time: String(existing.start_time),
        timeZone,
      });
      values.move_count = Number(existing.move_count) + 1;
    }
  },
  prepareTransition: async (action, values, existing, context) => {
    if (action === 'reinstate') {
      await assertBookable(
        bookingOf({ organizationId: context.organizationId, values: {}, existing }),
        context,
      );
      return;
    }
    if (action === 'undo-check-in') {
      const visit = await liveVisitOf(context.organizationId, existing.id);
      if (visit && visit.stage !== 'waiting') {
        throw new ConflictError('errors:visitStarted').withReason('visit_started');
      }
      return;
    }
    if (action !== 'status') return;
    const from = String(existing.status);
    const to = String(values.status);
    if (!STATUS_MOVES[from]?.includes(to)) {
      throw new ConflictError('errors:recordTransitionNotAllowed', {
        action: `status:${to}`,
        status: from,
      }).withReason('transition_not_allowed');
    }
    const now = await organizationNow(context);
    const date = String(existing.appointment_date);
    const started =
      date < now.today ||
      (date === now.today && minutesOfClockTime(String(existing.start_time)) <= now.nowMinutes);
    if ((to === 'no_show' && !started) || (to === 'checked_in' && date > now.today)) {
      throw new ConflictError('errors:appointmentNotDue', { status: to }).withReason(
        'appointment_not_due',
      );
    }
    if (to === 'checked_in') values.checked_in_at = new Date();
    if (to === 'completed') values.completed_at = new Date();
  },
  afterWrite: async (row, change, context) => {
    const checkedIn =
      row.status === 'checked_in' &&
      (change.kind === 'create' || (change.kind === 'transition' && change.action === 'status'));
    if (checkedIn) {
      await onCheckIn(row, context);
      return;
    }
    if (change.kind === 'transition' && change.action === 'undo-check-in') {
      const visit = await liveVisitOf(context.organizationId, row.id);
      if (visit) {
        await visitsRepository.softDelete(
          visit.id,
          { delete_reason: 'mistake', delete_note: null },
          context.userId,
        );
      }
    }
  },
  actions: {
    copy: async ({ existing, input, context, repository }) => {
      const values: Record<string, unknown> = {
        patient_id: existing.patient_id,
        lead_id: existing.lead_id,
        branch_id: existing.branch_id,
        type: existing.type,
        offering_id: existing.offering_id,
        service_label: existing.service_label,
        doctor_membership_id: existing.doctor_membership_id,
        therapist_membership_id: existing.therapist_membership_id,
        branch_room_id: existing.branch_room_id,
        branch_machine_id: existing.branch_machine_id,
        duration_minutes: existing.duration_minutes,
        reason: existing.reason,
        appointment_date: input.appointment_date,
        start_time: input.start_time,
        copied_from_appointment_id: existing.id,
      };
      await assertBookable(bookingOf({ organizationId: context.organizationId, values }), context);
      return repository.insert({
        ...values,
        organization_id: context.organizationId,
        created_by_user_id: context.userId,
        updated_by_user_id: context.userId,
      });
    },
  },
  collectionViews: {
    slots: async ({ input, context, branchScope, resolveReferences }) => {
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
      const answer = {
        appointment_date: date,
        is_open: false,
        closed_reason: null as string | null,
      };
      if (date < now.today) {
        return { ...answer, closed_reason: 'past', closed_label: null, slots: [] };
      }
      const { closure, opensAt, closesAt } = await dayClosure({
        organizationId: context.organizationId,
        branchId,
        date,
        doctorMembershipId: idOf(references.doctor_membership_id),
      });
      if (closure) {
        return { ...answer, closed_reason: closure.reason, closed_label: closure.label, slots: [] };
      }
      const busy = await busyIntervals({
        organizationId: context.organizationId,
        branchId,
        date,
        startMinutes: opensAt,
        durationMinutes: duration,
        resources: {
          doctor_membership_id: idOf(references.doctor_membership_id),
          branch_room_id: idOf(references.branch_room_id),
          branch_machine_id: idOf(references.branch_machine_id),
        },
      });
      const slots: { start_time: string; end_time: string }[] = [];
      for (let start = opensAt; start + duration <= closesAt; start += step) {
        if (date === now.today && start < now.nowMinutes) continue;
        const end = start + duration;
        if (busy.some((interval) => interval.start < end && start < interval.end)) continue;
        slots.push({ start_time: clockTimeOfMinutes(start), end_time: clockTimeOfMinutes(end) });
      }
      return { ...answer, is_open: true, closed_label: null, slots };
    },
    'daily-counts': async ({ input, context, repository, branchScope, resolveReferences }) => {
      const window = countsWindow(input);
      const references: Record<string, unknown> = {
        doctor_membership_id: input.doctor_membership_id,
      };
      await resolveReferences(references);
      const rows = await repository.groupCounts({
        organizationId: context.organizationId,
        columns: ['appointment_date', 'status'],
        equals: { doctor_membership_id: references.doctor_membership_id },
        ranges: {
          appointment_date: {
            from: window.from,
            to: addDaysToCalendarDate({ date: window.to, days: 1 }),
          },
        },
        branchScope: await branchScope(splitRecordIds(input.branch_ids as string | undefined)),
      });
      const days = new Map<string, { total: number; by_status: Record<string, number> }>();
      for (let offset = 0; offset < window.days; offset += 1) {
        const byStatus: Record<string, number> = {};
        for (const status of APPOINTMENT_STATUS_VALUES) byStatus[status] = 0;
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
      return [...days].map(([appointmentDate, day]) => ({
        appointment_date: appointmentDate,
        ...day,
      }));
    },
  },
};
