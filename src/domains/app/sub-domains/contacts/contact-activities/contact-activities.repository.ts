import { sql, type SQL } from 'drizzle-orm';
import { BaseRecordRepository, columnOf } from '@/domains/app/base-record.repository.js';
import { contact_activities } from './contact-activities.schema.js';
import {
  CONTACT_ACTIVITY_GROUP,
  CONTACT_ACTIVITY_TYPE,
  type ContactActivityLinkColumn,
} from './contact-activities.constants.js';

/** The links a system entry's group follows (D63) — the rest of the twelve are `clinical`. */
const MONEY_LINKS: readonly ContactActivityLinkColumn[] = [
  'invoice_id',
  'payment_id',
  'patient_offering_id',
];
/** The link that makes a system entry a `tasks` one. */
const TASK_LINK: ContactActivityLinkColumn = 'task_id';
/** The links that make a system entry `clinical`. */
const CLINICAL_LINKS: readonly ContactActivityLinkColumn[] = [
  'appointment_id',
  'patient_prescription_id',
  'patient_review_id',
  'patient_check_in_id',
  'patient_treatment_id',
  'patient_clinical_note_id',
  'patient_image_id',
  'patient_report_id',
];

/** `coalesce(<links>) IS NOT NULL` — the entry carries one of these links. */
function linkedTo(columns: readonly ContactActivityLinkColumn[]): SQL {
  return sql`coalesce(${sql.join(
    columns.map((column) => sql`${columnOf(contact_activities, column)}`),
    sql`, `,
  )}) IS NOT NULL`;
}

/**
 * An entry's group (M10, D63) as SQL: a message, call or note is `messages`; a system entry goes
 * by its link — `clinical`, `money`, `tasks`, or `messages` when it has none.
 */
const GROUP_EXPRESSION = sql`(case
  when ${contact_activities.type} <> ${CONTACT_ACTIVITY_TYPE.SYSTEM} then ${CONTACT_ACTIVITY_GROUP.MESSAGES}
  when ${linkedTo(CLINICAL_LINKS)} then ${CONTACT_ACTIVITY_GROUP.CLINICAL}
  when ${linkedTo(MONEY_LINKS)} then ${CONTACT_ACTIVITY_GROUP.MONEY}
  when ${linkedTo([TASK_LINK])} then ${CONTACT_ACTIVITY_GROUP.TASKS}
  else ${CONTACT_ACTIVITY_GROUP.MESSAGES}
end)`;

/**
 * An entry's group (M10, D63) from its row — the serializer's twin of the list's `group` filter.
 */
export function contactActivityGroupOf(row: Record<string, unknown>): string {
  if (row.type !== CONTACT_ACTIVITY_TYPE.SYSTEM) return CONTACT_ACTIVITY_GROUP.MESSAGES;
  const has = (columns: readonly ContactActivityLinkColumn[]) =>
    columns.some((column) => row[column] !== null && row[column] !== undefined);
  if (has(CLINICAL_LINKS)) return CONTACT_ACTIVITY_GROUP.CLINICAL;
  if (has(MONEY_LINKS)) return CONTACT_ACTIVITY_GROUP.MONEY;
  if (has([TASK_LINK])) return CONTACT_ACTIVITY_GROUP.TASKS;
  return CONTACT_ACTIVITY_GROUP.MESSAGES;
}

/**
 * Persistence for `app.contact_activities` (launch ROUTE #130, routes-final 4.C) — the shared app
 * record reads and writes on an append-only table (no `deleted_at`): a contact's stream, oldest
 * first by default, `q` on the text, the derived `group` filter (several — any of).
 */
export class ContactActivitiesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: contact_activities,
      entity: 'contactActivity',
      searchColumns: ['body'],
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        occurred_at: { keys: [{ value: 'occurred_at' }], defaultOrder: 'asc' },
        created_at: { keys: [{ value: 'created_at' }], defaultOrder: 'asc' },
      },
      derivedFilters: {
        group: (value) =>
          sql`${GROUP_EXPRESSION} in (${sql.join(
            (value as string[]).map((group) => sql`${group}`),
            sql`, `,
          )})`,
      },
      defaultSort: 'occurred_at',
      defaultOrder: 'asc',
    });
  }
}
