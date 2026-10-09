import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteral, sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import {
  MESSAGING_WEBHOOK_CHANNEL_VALUES,
  MESSAGING_WEBHOOK_EVENT_STATUS,
  MESSAGING_WEBHOOK_EVENT_STATUS_VALUES,
} from './contact-messaging-webhook.constants.js';

/**
 * Drizzle table for `app.messaging_webhook_events` — one update from a Meta callback (a WhatsApp
 * `messages` change, an Instagram `messaging` event), stored for its organization before the
 * webhook answers 200 and applied by the messaging worker (launch D77, WC-1 statuses, WC-3 replies).
 *
 * @remarks
 * - **Notes:** the inbox of the Stripe webhook's pattern, split by organization at ingress (a
 *   callback names the clinic's WhatsApp number or Instagram account, resolved through
 *   `tenancy.resolve_organization_public_id_for_messaging_account`). Deduplicated by the update's
 *   SHA-256 (`payload_hash`) — Meta retries the same body. `pending` until applied; a claim
 *   (`claimed_at`) older than five minutes is a crashed job's. After five failed tries the row is
 *   `failed` and kept. Processed and failed rows are purged after 30 days. RLS is the
 *   organization policy with the global-retention arm (the reclaim sweep and the purge read across
 *   organizations).
 */
export const messaging_webhook_events = appSchema
  .table(
    'messaging_webhook_events',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      channel: varchar('channel', { length: 9 }).notNull(),
      // The update as Meta sent it, with the account it came to
      payload: jsonb('payload').notNull(),
      payload_hash: varchar('payload_hash', { length: 64 }).notNull(),
      status: varchar('status', { length: 9 })
        .notNull()
        .default(MESSAGING_WEBHOOK_EVENT_STATUS.PENDING),
      claimed_at: timestamp('claimed_at', { withTimezone: true }),
      attempt_count: integer('attempt_count').notNull().default(0),
      failure_reason: varchar('failure_reason', { length: 280 }),
      received_at: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
      processed_at: timestamp('processed_at', { withTimezone: true }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      // Meta's retry of an update it already sent is the same row
      uniqueIndex('idx_messaging_webhook_events_organization_payload_hash').on(
        table.organization_id,
        table.payload_hash,
      ),
      // The worker's queue, oldest first, and the reclaim sweep
      index('idx_messaging_webhook_events_organization_pending')
        .on(table.organization_id, table.received_at, table.id)
        .where(sql`${table.status} = ${sqlLiteral(MESSAGING_WEBHOOK_EVENT_STATUS.PENDING)}`),
      // The purge, oldest first
      index('idx_messaging_webhook_events_received_at').on(table.received_at),
      check(
        'chk_messaging_webhook_events_channel',
        sql`${table.channel} IN (${sqlLiteralList(MESSAGING_WEBHOOK_CHANNEL_VALUES)})`,
      ),
      check(
        'chk_messaging_webhook_events_status',
        sql`${table.status} IN (${sqlLiteralList(MESSAGING_WEBHOOK_EVENT_STATUS_VALUES)})`,
      ),
      check(
        'chk_messaging_webhook_events_payload_hash',
        sql`${table.payload_hash} ~ '^[0-9a-f]{64}$'`,
      ),
      check('chk_messaging_webhook_events_attempt_count', sql`${table.attempt_count} >= 0`),
      check(
        'chk_messaging_webhook_events_claim',
        sql`${table.claimed_at} IS NULL OR ${table.status} = ${sqlLiteral(MESSAGING_WEBHOOK_EVENT_STATUS.PENDING)}`,
      ),
      check(
        'chk_messaging_webhook_events_failure',
        sql`${table.status} <> ${sqlLiteral(MESSAGING_WEBHOOK_EVENT_STATUS.FAILED)} OR ${table.failure_reason} IS NOT NULL`,
      ),
      check(
        'chk_messaging_webhook_events_updated',
        sql`${table.updated_at} >= ${table.created_at}`,
      ),
      pgPolicy('messaging_webhook_events_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR ${maintenanceBypassArm('app.global_retention_cleanup')}`,
        withCheck: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
      }),
    ],
  )
  .enableRLS();
