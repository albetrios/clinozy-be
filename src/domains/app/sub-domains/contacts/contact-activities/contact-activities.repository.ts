import { and, count, eq, sql, type SQL } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository, columnOf } from '@/domains/app/base-record.repository.js';
import { organization_settings } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.schema.js';
import { contact_activities } from './contact-activities.schema.js';
import {
  CONTACT_ACTIVITY_CLINICAL_LINKS,
  CONTACT_ACTIVITY_DELIVERY_STATUS,
  CONTACT_ACTIVITY_GROUP,
  CONTACT_ACTIVITY_MONEY_LINKS,
  CONTACT_ACTIVITY_TASK_LINK,
  CONTACT_ACTIVITY_TYPE,
  type ContactActivityLinkColumn,
} from './contact-activities.constants.js';

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
  when ${linkedTo(CONTACT_ACTIVITY_CLINICAL_LINKS)} then ${CONTACT_ACTIVITY_GROUP.CLINICAL}
  when ${linkedTo(CONTACT_ACTIVITY_MONEY_LINKS)} then ${CONTACT_ACTIVITY_GROUP.MONEY}
  when ${linkedTo([CONTACT_ACTIVITY_TASK_LINK])} then ${CONTACT_ACTIVITY_GROUP.TASKS}
  else ${CONTACT_ACTIVITY_GROUP.MESSAGES}
end)`;

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

  /** The clinic's messaging accounts on the platform Meta app (launch D77) — null when not connected. */
  async findMessagingAccounts(organizationId: number): Promise<{
    whatsappPhoneNumberId: string | null;
    instagramAccountId: string | null;
  }> {
    const rows = await getRequestDatabase()
      .select({
        whatsappPhoneNumberId: organization_settings.whatsapp_phone_number_id,
        instagramAccountId: organization_settings.instagram_account_id,
      })
      .from(organization_settings)
      .where(eq(organization_settings.organization_id, organizationId))
      .limit(1);
    return {
      whatsappPhoneNumberId: rows[0]?.whatsappPhoneNumberId ?? null,
      instagramAccountId: rows[0]?.instagramAccountId ?? null,
    };
  }

  /** How many messages wait in the delivery queue, by channel (launch D77). */
  async countQueuedByType(organizationId: number): Promise<Map<string, number>> {
    const rows = await getRequestDatabase()
      .select({ type: contact_activities.type, total: count() })
      .from(contact_activities)
      .where(
        and(
          eq(contact_activities.organization_id, organizationId),
          eq(contact_activities.delivery_status, CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED),
        ),
      )
      .groupBy(contact_activities.type);
    return new Map(rows.map((row) => [row.type, Number(row.total)]));
  }

  /**
   * A photo moved into or out of the private album (P23, M10): its entries follow, so they show
   * only to the album's holders while it is private.
   */
  async setPrivatePhoto(options: { patientImageId: number; isPrivate: boolean }): Promise<void> {
    await getRequestDatabase()
      .update(contact_activities)
      .set({ is_private_photo: options.isPrivate })
      .where(eq(contact_activities.patient_image_id, options.patientImageId));
  }
}
