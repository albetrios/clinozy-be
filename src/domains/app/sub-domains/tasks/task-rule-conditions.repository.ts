import { type SQL, sql } from 'drizzle-orm';
import { type AnyPgColumn, alias } from 'drizzle-orm/pg-core';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import { membershipHoldsRole } from '@/domains/tenancy/sub-domains/membership/membership-additional-roles/membership-additional-roles.schema.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { role_permissions } from '@/domains/tenancy/sub-domains/member-roles/member-role-permission/member-role-permission.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { contact_activities } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.schema.js';
import { CONTACT_ACTIVITY_REMINDER_STOPPED_REASON } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import { lead_involved_memberships, leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import {
  LEAD_OPEN_STATUS_VALUES,
  LEAD_STATUS,
} from '@/domains/app/sub-domains/leads/leads.constants.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import { patient_reviews } from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.schema.js';
import { patient_feedback_actions } from '@/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.schema.js';
import { patient_offerings } from '@/domains/app/sub-domains/patients/patient-offerings/patient-offerings.schema.js';
import {
  invoice_members,
  invoices,
} from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { pending_credits } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.schema.js';
import { medical_reps } from '@/domains/app/sub-domains/medical/medical-reps/medical-reps.schema.js';
import { TASK_OWNER_ROLE, TASK_RULE, type TaskRule } from './tasks.constants.js';
import type { TaskRecordLink } from './tasks.rule-tasks.js';
import { tasks } from './tasks.schema.js';

/** What a rule's SQL is built for: one organization, in its time zone (due times are clinic-local). */
export interface TaskRuleScope {
  organizationId: number;
  timeZone: string;
}

/** The columns a rule's new task takes from its record. */
export interface TaskRuleColumns {
  contactId: SQL;
  branchId: SQL;
  /** The record's member when they are active and see tasks (TK6), else null — the queue then. */
  ownerMembershipId: SQL;
  title: SQL;
  why: SQL;
  /** When the condition last began — a task a person resolved after it keeps the rule quiet. */
  anchorAt: SQL;
}

/**
 * One task rule as SQL (routes-final 10.A.10, TK4): which records open a task, while when it stays
 * open, and when it is due.
 *
 * @remarks
 * - **Algorithm:** `from` and `recordId` name the record; `qualifies` holds while the task stays
 *   open (its record changed otherwise — the worker closes it as done by the app); `opens` narrows
 *   when a new one opens (a window such as "within 48 h"). `due(reference)` is the due time, for
 *   rules timed off the record's own moment independent of `reference`; a rule with `tracksDue`
 *   closes a task whose record moved (its due no longer matches) so a fresh one opens.
 * - **Notes:** `canOpen` false — `call_back` — is opened at write time only (8 TR4, 10.10).
 */
export interface TaskRuleSource {
  rule: TaskRule;
  /** The record column the task points at; null — a rule about the person (`contact:` key, TK5). */
  link: TaskRecordLink | null;
  /** The queue a task waits in when the record names nobody (TK6) — none once it has an owner. */
  ownerRole: string;
  priority: 'normal' | 'high';
  canOpen: boolean;
  from: SQL;
  organizationColumn: AnyPgColumn;
  recordId: SQL;
  qualifies: SQL;
  opens: SQL;
  due: (reference: SQL) => SQL;
  tracksDue: boolean;
  columns: TaskRuleColumns;
}

/** The record prefix of `tasks.source_key` per link column (the generated column's CASE). */
export const TASK_SOURCE_KEY_PREFIX: Readonly<Record<TaskRecordLink | 'contact_id', string>> = {
  lead_id: 'lead',
  appointment_id: 'appointment',
  patient_treatment_id: 'patient_treatment',
  patient_check_in_id: 'patient_check_in',
  patient_review_id: 'patient_review',
  invoice_id: 'invoice',
  pending_credit_id: 'pending_credit',
  medical_rep_id: 'medical_rep',
  contact_id: 'contact',
};

/** An appointment that is still coming — counts as "something booked". */
const BOOKED_STATUS_VALUES = ['scheduled', 'confirmed', 'checked_in'] as const;

/** A later appointment for the same person (`nothingBooked`, `rebook`) — `from ${appointments} as booked`. */
const booked = alias(appointments, 'booked');

/** A completed visit of the person (`next_visit`, `gone_quiet`) — `from ${appointments} as visit`. */
const visit = alias(appointments, 'visit');

/** `a, b, c` of literal parameters, for an `IN (…)`. */
function valueList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/** The organization's today (its time zone). */
function today(scope: TaskRuleScope): SQL {
  return sql`(now() at time zone ${scope.timeZone})::date`;
}

/** An instant's local date (the organization's time zone). */
function localDate(scope: TaskRuleScope, instant: SQL | AnyPgColumn): SQL {
  return sql`(${instant} at time zone ${scope.timeZone})::date`;
}

/** HH:MM on a local date, as an instant ("11:00 that day"). */
function localAt(scope: TaskRuleScope, date: SQL, time: string): SQL {
  return sql`(((${date}) + ${time}::time) at time zone ${scope.timeZone})`;
}

/** An appointment's start, as an instant. */
function startOf(scope: TaskRuleScope): SQL {
  return sql`((${appointments.appointment_date} + ${appointments.start_time}) at time zone ${scope.timeZone})`;
}

/**
 * TK6 for the rules: the member, when they are active here and one of their roles holds
 * `task:read` — else null, and the task waits in its queue.
 */
function taskMember(membership: SQL | AnyPgColumn): SQL {
  return sql`(select ${memberships.id} from ${memberships}
    join ${roles} on ${membershipHoldsRole(roles.id)}
    join ${role_permissions} on ${role_permissions.role_id} = ${roles.id}
    where ${memberships.id} = ${membership}
      and ${memberships.status} = ${MEMBERSHIP_STATUS.ACTIVE}
      and ${memberships.deleted_at} is null
      and ${roles.deleted_at} is null
      and ${role_permissions.permission_code} = ${APP_PERMISSIONS.TASK_READ}
    limit 1)`;
}

/** A lead that is still being worked (L6). */
const OPEN_LEAD = sql`${leads.deleted_at} is null and ${leads.status} in (${valueList(LEAD_OPEN_STATUS_VALUES)})`;

/** Nothing booked for the person from today on. */
function nothingBooked(scope: TaskRuleScope, contactId: SQL | AnyPgColumn): SQL {
  return sql`not exists (select 1 from ${appointments} as booked
    where ${booked.contact_id} = ${contactId}
      and ${booked.deleted_at} is null
      and ${booked.status} in (${valueList(BOOKED_STATUS_VALUES)})
      and ${booked.appointment_date} >= ${today(scope)})`;
}

/** The person's last completed visit, joined as `last_visit` (`completed_at`). */
const LAST_VISIT = sql`cross join lateral (
  select max(${visit.completed_at}) as completed_at from ${appointments} as visit
  where ${visit.contact_id} = ${patients.contact_id}
    and ${visit.status} = 'completed'
    and ${visit.deleted_at} is null
) as last_visit`;

/** `reply`: their last message came in, nothing was sent since, and their lead is open. */
function replyRule(): TaskRuleSource {
  const awaiting = sql`${contacts.last_received_at} is not null and (${contacts.last_sent_at} is null or ${contacts.last_received_at} > ${contacts.last_sent_at})`;
  return {
    rule: TASK_RULE.REPLY,
    link: 'lead_id',
    ownerRole: TASK_OWNER_ROLE.FRONT_DESK,
    priority: 'high',
    canOpen: true,
    from: sql`${leads} join ${contacts} on ${contacts.id} = ${leads.contact_id}`,
    organizationColumn: leads.organization_id,
    recordId: sql`${leads.id}`,
    qualifies: sql`${OPEN_LEAD} and ${awaiting}`,
    opens: sql`true`,
    due: () => sql`${contacts.last_received_at} + interval '30 minutes'`,
    tracksDue: false,
    columns: {
      contactId: sql`${leads.contact_id}`,
      branchId: sql`${leads.branch_id}`,
      ownerMembershipId: taskMember(leads.owner_membership_id),
      title: sql`'Reply to ' || ${contacts.first_name}`,
      why: sql`'Their message is waiting for a reply'`,
      anchorAt: sql`${contacts.last_received_at}`,
    },
  };
}

/** `failed_message`: the last message sent to a person failed. */
function failedMessageRule(): TaskRuleSource {
  const openLeadOwner = sql`(select ${leads.owner_membership_id} from ${leads} where ${leads.contact_id} = ${contacts.id} and ${OPEN_LEAD} limit 1)`;
  const lastSentAuthor = sql`last_sent.author_membership_id`;
  return {
    rule: TASK_RULE.FAILED_MESSAGE,
    link: null,
    ownerRole: TASK_OWNER_ROLE.FRONT_DESK,
    priority: 'high',
    canOpen: true,
    from: sql`${contacts} cross join lateral (
      select ${contact_activities.delivery_status} as delivery_status,
        ${contact_activities.author_membership_id} as author_membership_id,
        coalesce(${contact_activities.failed_at}, ${contact_activities.occurred_at}) as failed_at,
        ${contact_activities.failure_reason} as failure_reason,
        ${contact_activities.occurred_at} as occurred_at
      from ${contact_activities}
      where ${contact_activities.contact_id} = ${contacts.id}
        and ${contact_activities.direction} = 'sent'
        and ${contact_activities.type} in ('whatsapp', 'instagram')
      order by ${contact_activities.occurred_at} desc, ${contact_activities.id} desc
      limit 1
    ) as last_sent`,
    organizationColumn: contacts.organization_id,
    recordId: sql`${contacts.id}`,
    // A booking message stopped before it went (WC-7, D78) is no failure to chase
    qualifies: sql`${contacts.deleted_at} is null and last_sent.delivery_status = 'failed'
      and last_sent.failure_reason is distinct from ${CONTACT_ACTIVITY_REMINDER_STOPPED_REASON}`,
    opens: sql`last_sent.occurred_at >= now() - interval '30 days'`,
    due: () => sql`last_sent.failed_at`,
    tracksDue: false,
    columns: {
      contactId: sql`${contacts.id}`,
      branchId: sql`null::bigint`,
      ownerMembershipId: sql`coalesce(${taskMember(lastSentAuthor)}, ${taskMember(openLeadOwner)})`,
      title: sql`'Message to ' || ${contacts.first_name} || ' failed'`,
      why: sql`'Send it again or call them'`,
      anchorAt: sql`last_sent.occurred_at`,
    },
  };
}

/**
 * `follow_up`: an open lead's follow-up date is today or past — due at its follow-up time, the one
 * staff set in the lead drawer. A lead whose person has a booking still to happen
 * (`appointment_scheduled`, L11) waits for the visit — the booking's own tasks follow it up; a
 * cancel puts it back in `follow_up`, dated now.
 */
function followUpRule(scope: TaskRuleScope): TaskRuleSource {
  const followUpDate = localDate(scope, leads.follow_up_at);
  const awaitingVisit = sql`${leads.status} = ${LEAD_STATUS.APPOINTMENT_SCHEDULED}`;
  return {
    rule: TASK_RULE.FOLLOW_UP,
    link: 'lead_id',
    ownerRole: TASK_OWNER_ROLE.COUNSELLOR,
    priority: 'normal',
    canOpen: true,
    from: sql`${leads} join ${contacts} on ${contacts.id} = ${leads.contact_id}`,
    organizationColumn: leads.organization_id,
    recordId: sql`${leads.id}`,
    qualifies: sql`${OPEN_LEAD} and not ${awaitingVisit} and ${leads.follow_up_at} is not null and ${followUpDate} <= ${today(scope)}`,
    opens: sql`true`,
    due: () => sql`${leads.follow_up_at}`,
    tracksDue: true,
    columns: {
      contactId: sql`${leads.contact_id}`,
      branchId: sql`${leads.branch_id}`,
      ownerMembershipId: taskMember(leads.owner_membership_id),
      title: sql`'Follow up with ' || ${contacts.first_name}`,
      why: sql`'The follow-up date has come'`,
      anchorAt: sql`${leads.follow_up_at}`,
    },
  };
}

/** `claim`: a lead's hold ended, or its owner left (K4) — open to the team, due 3 h later. */
function claimRule(): TaskRuleSource {
  const notHeld = sql`(${leads.held_until} is null or ${leads.held_until} <= now())`;
  const ownerLeft = sql`exists (select 1 from ${lead_involved_memberships}
    join ${memberships} on ${memberships.id} = ${lead_involved_memberships.membership_id}
    where ${lead_involved_memberships.lead_id} = ${leads.id}
      and (${memberships.deleted_at} is not null or ${memberships.status} <> ${MEMBERSHIP_STATUS.ACTIVE}))`;
  return {
    rule: TASK_RULE.CLAIM,
    link: 'lead_id',
    ownerRole: TASK_OWNER_ROLE.COUNSELLOR,
    priority: 'normal',
    canOpen: true,
    from: sql`${leads} join ${contacts} on ${contacts.id} = ${leads.contact_id}`,
    organizationColumn: leads.organization_id,
    recordId: sql`${leads.id}`,
    qualifies: sql`${OPEN_LEAD} and ${notHeld}`,
    opens: sql`(${leads.held_until} is not null or ${ownerLeft})`,
    due: () => sql`coalesce(${leads.held_until}, ${leads.updated_at}) + interval '3 hours'`,
    tracksDue: false,
    columns: {
      contactId: sql`${leads.contact_id}`,
      branchId: sql`${leads.branch_id}`,
      ownerMembershipId: sql`null::bigint`,
      title: sql`'Claim ' || ${contacts.first_name} || '''s lead'`,
      why: sql`'Nobody is holding this lead'`,
      anchorAt: sql`coalesce(${leads.held_until}, ${leads.updated_at})`,
    },
  };
}

/**
 * `confirm`: a scheduled booking starts within 48 h — due 2 h before when under 20 h away (from
 * when the task opened), else 18:00 the day before.
 */
function confirmRule(scope: TaskRuleScope): TaskRuleSource {
  const start = startOf(scope);
  const dayBefore = sql`${appointments.appointment_date} - 1`;
  return {
    rule: TASK_RULE.CONFIRM,
    link: 'appointment_id',
    ownerRole: TASK_OWNER_ROLE.FRONT_DESK,
    priority: 'normal',
    canOpen: true,
    from: sql`${appointments} join ${contacts} on ${contacts.id} = ${appointments.contact_id}
      join ${branches} on ${branches.id} = ${appointments.branch_id}`,
    organizationColumn: appointments.organization_id,
    recordId: sql`${appointments.id}`,
    qualifies: sql`${appointments.deleted_at} is null and ${appointments.status} = 'scheduled' and ${start} > now()`,
    opens: sql`${start} <= now() + interval '48 hours'`,
    due: (reference) =>
      sql`case when ${start} - ${reference} < interval '20 hours' then ${start} - interval '2 hours'
        else ${localAt(scope, dayBefore, '18:00')} end`,
    tracksDue: true,
    columns: {
      contactId: sql`${appointments.contact_id}`,
      branchId: sql`${appointments.branch_id}`,
      ownerMembershipId: taskMember(branches.default_front_desk_membership_id),
      title: sql`'Confirm ' || ${contacts.first_name} || '''s visit'`,
      why: sql`'Visit on ' || to_char(${appointments.appointment_date}, 'DD Mon') || ' at ' || to_char(${appointments.start_time}, 'HH24:MI')`,
      anchorAt: sql`${appointments.updated_at}`,
    },
  };
}

/** `arrive`: 15 min past today's booking's start and not checked in. */
function arriveRule(scope: TaskRuleScope): TaskRuleSource {
  const start = startOf(scope);
  return {
    rule: TASK_RULE.ARRIVE,
    link: 'appointment_id',
    ownerRole: TASK_OWNER_ROLE.FRONT_DESK,
    priority: 'high',
    canOpen: true,
    from: sql`${appointments} join ${contacts} on ${contacts.id} = ${appointments.contact_id}`,
    organizationColumn: appointments.organization_id,
    recordId: sql`${appointments.id}`,
    qualifies: sql`${appointments.deleted_at} is null and ${appointments.status} in ('scheduled', 'confirmed')`,
    opens: sql`${appointments.appointment_date} = ${today(scope)} and ${start} + interval '15 minutes' <= now()`,
    due: () => sql`${start} + interval '15 minutes'`,
    tracksDue: true,
    columns: {
      contactId: sql`${appointments.contact_id}`,
      branchId: sql`${appointments.branch_id}`,
      ownerMembershipId: sql`null::bigint`,
      title: sql`'Has ' || ${contacts.first_name} || ' arrived?'`,
      why: sql`'Booked for ' || to_char(${appointments.start_time}, 'HH24:MI')`,
      anchorAt: sql`${appointments.updated_at}`,
    },
  };
}

/**
 * `rebook`: a booking became a no-show (last 30 days), nothing newer is booked and the person has
 * no open lead — next day 11:00. A person with an open lead is followed up by its `follow_up` task
 * instead (the missed visit puts the lead back in `follow_up`, dated now — L11), so one person gets
 * one task.
 */
function rebookRule(scope: TaskRuleScope): TaskRuleSource {
  const newerBooking = sql`exists (select 1 from ${appointments} as booked
    where ${booked.contact_id} = ${appointments.contact_id}
      and ${booked.deleted_at} is null
      and ${booked.status} not in ('cancelled', 'no_show')
      and (${booked.appointment_date} + ${booked.start_time}) > (${appointments.appointment_date} + ${appointments.start_time}))`;
  return {
    rule: TASK_RULE.REBOOK,
    link: 'appointment_id',
    ownerRole: TASK_OWNER_ROLE.FRONT_DESK,
    priority: 'normal',
    canOpen: true,
    from: sql`${appointments} join ${contacts} on ${contacts.id} = ${appointments.contact_id}`,
    organizationColumn: appointments.organization_id,
    recordId: sql`${appointments.id}`,
    qualifies: sql`${appointments.deleted_at} is null and ${appointments.status} = 'no_show' and not ${newerBooking} and not exists (select 1 from ${leads} where ${leads.contact_id} = ${appointments.contact_id} and ${OPEN_LEAD})`,
    opens: sql`${appointments.appointment_date} >= ${today(scope)} - 30`,
    due: () => localAt(scope, sql`${appointments.appointment_date} + 1`, '11:00'),
    tracksDue: false,
    columns: {
      contactId: sql`${appointments.contact_id}`,
      branchId: sql`${appointments.branch_id}`,
      ownerMembershipId: sql`null::bigint`,
      title: sql`'Rebook ' || ${contacts.first_name}`,
      why: sql`'Missed the visit on ' || to_char(${appointments.appointment_date}, 'DD Mon')`,
      anchorAt: sql`${appointments.updated_at}`,
    },
  };
}

/** `feedback`: a visit completed 1–3 days ago with no check-in or review since — 12:00 the next day. */
function feedbackRule(scope: TaskRuleScope): TaskRuleSource {
  const completedDate = localDate(scope, appointments.completed_at);
  const loggedSince = (table: typeof patient_check_ins | typeof patient_reviews) =>
    sql`exists (select 1 from ${table} join ${patients} on ${patients.id} = ${table.patient_id}
      where ${patients.contact_id} = ${appointments.contact_id}
        and ${table.deleted_at} is null
        and ${table.created_at} >= ${appointments.completed_at})`;
  return {
    rule: TASK_RULE.FEEDBACK,
    link: 'appointment_id',
    ownerRole: TASK_OWNER_ROLE.COUNSELLOR,
    priority: 'normal',
    canOpen: true,
    from: sql`${appointments} join ${contacts} on ${contacts.id} = ${appointments.contact_id}`,
    organizationColumn: appointments.organization_id,
    recordId: sql`${appointments.id}`,
    qualifies: sql`${appointments.deleted_at} is null and ${appointments.status} = 'completed'
      and not ${loggedSince(patient_check_ins)} and not ${loggedSince(patient_reviews)}`,
    opens: sql`${completedDate} between ${today(scope)} - 3 and ${today(scope)} - 1`,
    due: () => localAt(scope, sql`${completedDate} + 1`, '12:00'),
    tracksDue: false,
    columns: {
      contactId: sql`${appointments.contact_id}`,
      branchId: sql`${appointments.branch_id}`,
      ownerMembershipId: sql`null::bigint`,
      title: sql`'Ask ' || ${contacts.first_name} || ' how the visit went'`,
      why: sql`'Visit on ' || to_char(${appointments.appointment_date}, 'DD Mon')`,
      anchorAt: sql`${appointments.completed_at}`,
    },
  };
}

/** `aftercare`: a treatment's call is due with no check-in for it — shown from 2 days before, 11:00. */
function aftercareRule(scope: TaskRuleScope): TaskRuleSource {
  const callDate = sql`(${localDate(scope, patient_treatments.performed_at)} + case ${patient_treatments.aftercare_call}
    when 'next_day' then 1 when 'in_two_days' then 2 when 'in_week' then 7 end)`;
  return {
    rule: TASK_RULE.AFTERCARE,
    link: 'patient_treatment_id',
    ownerRole: TASK_OWNER_ROLE.THERAPIST,
    priority: 'normal',
    canOpen: true,
    from: sql`${patient_treatments} join ${patients} on ${patients.id} = ${patient_treatments.patient_id}
      join ${contacts} on ${contacts.id} = ${patients.contact_id}
      left join ${appointments} on ${appointments.id} = ${patient_treatments.appointment_id}`,
    organizationColumn: patient_treatments.organization_id,
    recordId: sql`${patient_treatments.id}`,
    qualifies: sql`${patients.deleted_at} is null and ${patient_treatments.status} = 'done'
      and ${patient_treatments.aftercare_call} <> 'none'
      and not exists (select 1 from ${patient_check_ins}
        where ${patient_check_ins.patient_treatment_id} = ${patient_treatments.id} and ${patient_check_ins.deleted_at} is null)`,
    opens: sql`${callDate} - 2 <= ${today(scope)} and ${callDate} >= ${today(scope)} - 14`,
    due: () => localAt(scope, callDate, '11:00'),
    tracksDue: true,
    columns: {
      contactId: sql`${patients.contact_id}`,
      branchId: sql`coalesce(${appointments.branch_id}, ${patients.home_branch_id})`,
      ownerMembershipId: sql`coalesce(${taskMember(patient_treatments.therapist_membership_id)}, ${taskMember(patient_treatments.doctor_membership_id)})`,
      title: sql`'Aftercare call: ' || ${contacts.first_name}`,
      why: sql`${patient_treatments.name} || ' on ' || to_char(${localDate(scope, patient_treatments.performed_at)}, 'DD Mon')`,
      anchorAt: sql`${patient_treatments.updated_at}`,
    },
  };
}

/** `call_back` (8 TR4, 10.10): opened at write time; closes when a feedback action is logged. */
function callBackRule(): TaskRuleSource {
  return {
    rule: TASK_RULE.CALL_BACK,
    link: null,
    ownerRole: TASK_OWNER_ROLE.DOCTOR,
    priority: 'high',
    canOpen: false,
    from: sql`(select 1) as call_back`,
    organizationColumn: tasks.organization_id,
    recordId: sql`${tasks.contact_id}`,
    qualifies: sql`not exists (select 1 from ${patient_feedback_actions}
      where ${patient_feedback_actions.patient_check_in_id} = ${tasks.patient_check_in_id}
         or ${patient_feedback_actions.patient_review_id} = ${tasks.patient_review_id})`,
    opens: sql`false`,
    due: () => sql`now()`,
    tracksDue: false,
    columns: {
      contactId: sql`null::bigint`,
      branchId: sql`null::bigint`,
      ownerMembershipId: sql`null::bigint`,
      title: sql`''`,
      why: sql`null::text`,
      anchorAt: sql`now()`,
    },
  };
}

/** `next_visit`: last visit 1–45 days ago, nothing booked, no follow-up date — 17:00 the next day. */
function nextVisitRule(scope: TaskRuleScope): TaskRuleSource {
  const lastVisitDate = localDate(scope, sql`last_visit.completed_at`);
  return {
    rule: TASK_RULE.NEXT_VISIT,
    link: null,
    ownerRole: TASK_OWNER_ROLE.FRONT_DESK,
    priority: 'normal',
    canOpen: true,
    from: sql`${patients} join ${contacts} on ${contacts.id} = ${patients.contact_id} ${LAST_VISIT}`,
    organizationColumn: patients.organization_id,
    recordId: sql`${patients.contact_id}`,
    qualifies: sql`${patients.deleted_at} is null and ${nothingBooked(scope, patients.contact_id)}`,
    opens: sql`${patients.follow_up_at} is null
      and ${lastVisitDate} between ${today(scope)} - 45 and ${today(scope)} - 1`,
    due: () => localAt(scope, sql`${lastVisitDate} + 1`, '17:00'),
    tracksDue: false,
    columns: {
      contactId: sql`${patients.contact_id}`,
      branchId: sql`${patients.home_branch_id}`,
      ownerMembershipId: sql`null::bigint`,
      title: sql`'Book ' || ${contacts.first_name} || '''s next visit'`,
      why: sql`'Last visit on ' || to_char(${lastVisitDate}, 'DD Mon')`,
      anchorAt: sql`last_visit.completed_at`,
    },
  };
}

/** `gone_quiet`: paid sessions left (7), last visit 30+ days ago, nothing booked — 12:00. */
function goneQuietRule(scope: TaskRuleScope): TaskRuleSource {
  const lastVisitDate = localDate(scope, sql`last_visit.completed_at`);
  const sessionsLeft = sql`exists (select 1 from ${patient_offerings}
    where ${patient_offerings.patient_id} = ${patients.id}
      and ${patient_offerings.deleted_at} is null
      and ${patient_offerings.sessions_used} < ${patient_offerings.sessions_total}
      and (${patient_offerings.valid_until} is null or ${patient_offerings.valid_until} >= ${today(scope)}))`;
  return {
    rule: TASK_RULE.GONE_QUIET,
    link: null,
    ownerRole: TASK_OWNER_ROLE.COUNSELLOR,
    priority: 'normal',
    canOpen: true,
    from: sql`${patients} join ${contacts} on ${contacts.id} = ${patients.contact_id} ${LAST_VISIT}`,
    organizationColumn: patients.organization_id,
    recordId: sql`${patients.contact_id}`,
    qualifies: sql`${patients.deleted_at} is null and ${sessionsLeft} and ${nothingBooked(scope, patients.contact_id)}`,
    opens: sql`${lastVisitDate} <= ${today(scope)} - 30`,
    due: () => localAt(scope, sql`${lastVisitDate} + 30`, '12:00'),
    tracksDue: false,
    columns: {
      contactId: sql`${patients.contact_id}`,
      branchId: sql`${patients.home_branch_id}`,
      ownerMembershipId: sql`null::bigint`,
      title: sql`'Bring ' || ${contacts.first_name} || ' back'`,
      why: sql`'Sessions left; last visit on ' || to_char(${lastVisitDate}, 'DD Mon')`,
      anchorAt: sql`last_visit.completed_at`,
    },
  };
}

/** `payment_due`: an invoice still has a due the day after its date — that day 11:00. */
function paymentDueRule(scope: TaskRuleScope): TaskRuleSource {
  const firstMember = sql`(select ${invoice_members.membership_id} from ${invoice_members}
    where ${invoice_members.invoice_id} = ${invoices.id}
    order by ${invoice_members.created_at}, ${invoice_members.membership_id} limit 1)`;
  return {
    rule: TASK_RULE.PAYMENT_DUE,
    link: 'invoice_id',
    ownerRole: TASK_OWNER_ROLE.FRONT_DESK,
    priority: 'normal',
    canOpen: true,
    from: sql`${invoices} left join ${contacts} on ${contacts.id} = ${invoices.contact_id}`,
    organizationColumn: invoices.organization_id,
    recordId: sql`${invoices.id}`,
    qualifies: sql`${invoices.deleted_at} is null and ${invoices.due_amount} > 0`,
    opens: sql`${invoices.invoice_date} < ${today(scope)}`,
    due: () => localAt(scope, sql`${invoices.invoice_date} + 1`, '11:00'),
    tracksDue: false,
    columns: {
      contactId: sql`${invoices.contact_id}`,
      branchId: sql`${invoices.branch_id}`,
      ownerMembershipId: taskMember(firstMember),
      title: sql`'Collect the due on ' || ${invoices.invoice_number}`,
      why: sql`'₹' || ${invoices.due_amount}::text || ' due' || coalesce(' from ' || ${contacts.first_name}, '')`,
      anchorAt: sql`${invoices.updated_at}`,
    },
  };
}

/** `settle_by`: an open pending credit reaches its settle-by date — that day 11:00. */
function settleByRule(scope: TaskRuleScope): TaskRuleSource {
  const creator = sql`(select ${memberships.id} from ${memberships}
    where ${memberships.user_id} = ${pending_credits.created_by_user_id}
      and ${memberships.organization_id} = ${pending_credits.organization_id} limit 1)`;
  const left = sql`(${pending_credits.amount} - ${pending_credits.settled_amount})::text`;
  const party = sql`coalesce(${contacts.first_name}, ${pending_credits.party_name}, 'the party')`;
  return {
    rule: TASK_RULE.SETTLE_BY,
    link: 'pending_credit_id',
    ownerRole: TASK_OWNER_ROLE.FRONT_DESK,
    priority: 'normal',
    canOpen: true,
    from: sql`${pending_credits} left join ${contacts} on ${contacts.id} = ${pending_credits.contact_id}`,
    organizationColumn: pending_credits.organization_id,
    recordId: sql`${pending_credits.id}`,
    qualifies: sql`${pending_credits.deleted_at} is null and ${pending_credits.status} = 'open'
      and ${pending_credits.settle_by} is not null and ${pending_credits.settle_by} <= ${today(scope)}`,
    opens: sql`true`,
    due: () => localAt(scope, sql`${pending_credits.settle_by}`, '11:00'),
    tracksDue: true,
    columns: {
      contactId: sql`${pending_credits.contact_id}`,
      branchId: sql`null::bigint`,
      ownerMembershipId: taskMember(creator),
      title: sql`case ${pending_credits.direction} when 'give' then 'Give back ₹' || ${left} || ' to ' || ${party}
        else 'Get back ₹' || ${left} || ' from ' || ${party} end`,
      why: sql`${pending_credits.reason}`,
      anchorAt: sql`${pending_credits.updated_at}`,
    },
  };
}

/** `medical_rep_visit` (11, MD8): an MR's next visit date is today or past — 11:00 that day, the pharmacist queue. */
function medicalRepVisitRule(scope: TaskRuleScope): TaskRuleSource {
  return {
    rule: TASK_RULE.MEDICAL_REP_VISIT,
    link: 'medical_rep_id',
    ownerRole: TASK_OWNER_ROLE.PHARMACIST,
    priority: 'normal',
    canOpen: true,
    from: sql`${medical_reps}`,
    organizationColumn: medical_reps.organization_id,
    recordId: sql`${medical_reps.id}`,
    qualifies: sql`${medical_reps.deleted_at} is null and ${medical_reps.next_visit_on} is not null
      and ${medical_reps.next_visit_on} <= ${today(scope)}`,
    opens: sql`true`,
    due: () => localAt(scope, sql`${medical_reps.next_visit_on}`, '11:00'),
    tracksDue: true,
    columns: {
      contactId: sql`null::bigint`,
      branchId: sql`null::bigint`,
      ownerMembershipId: sql`null::bigint`,
      title: sql`'Meet ' || ${medical_reps.name}`,
      why: sql`'Their visit is due — log it once they have been'`,
      anchorAt: sql`${medical_reps.updated_at}`,
    },
  };
}

/** The 15 rules (10.A.10 and 11's `medical_rep_visit`), in the Rules popover's order. */
export function taskRuleSources(scope: TaskRuleScope): TaskRuleSource[] {
  return [
    replyRule(),
    failedMessageRule(),
    followUpRule(scope),
    claimRule(),
    confirmRule(scope),
    arriveRule(scope),
    rebookRule(scope),
    feedbackRule(scope),
    aftercareRule(scope),
    callBackRule(),
    nextVisitRule(scope),
    goneQuietRule(scope),
    paymentDueRule(scope),
    settleByRule(scope),
    medicalRepVisitRule(scope),
  ];
}

/** The task's own column a rule's record id is matched on (`contact_id` for a rule about the person). */
export function taskLinkColumn(source: TaskRuleSource): AnyPgColumn {
  return source.link === null ? tasks.contact_id : tasks[source.link];
}

/**
 * While true an open task of the rule stays open (its record still qualifies) — over the outer
 * `app.tasks` row. `call_back`'s condition reads the task's own links.
 */
export function ruleStillHolds(source: TaskRuleSource): SQL {
  if (!source.canOpen) return source.qualifies;
  const createdAt = sql`${tasks.created_at}`;
  const dueMatch = source.tracksDue ? sql` and ${tasks.due_at} = ${source.due(createdAt)}` : sql``;
  return sql`exists (select 1 from ${source.from}
    where ${source.recordId} = ${taskLinkColumn(source)} and ${source.qualifies}${dueMatch})`;
}
