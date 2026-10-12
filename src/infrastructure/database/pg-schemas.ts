import { type SQL, sql } from 'drizzle-orm';
import { pgSchema } from 'drizzle-orm/pg-core';
import { DATABASE_MAINTENANCE_ROLE } from '@/shared/constants/project-identity.constants.js';

/**
 * Shared Postgres schema definitions.
 * All domain schema files import their pgSchema from here to prevent circular imports
 * when schemas reference tables across domains.
 */

/** Drizzle handle for the Postgres `auth` schema — verification tokens, sessions, MFA, mail outbox. */
export const authSchema = pgSchema('auth');
/** Drizzle handle for the Postgres `tenancy` schema — organizations, memberships, roles, API keys. */
export const tenancySchema = pgSchema('tenancy');
/** Drizzle handle for the Postgres `billing` schema — plans, subscriptions, Stripe webhook ledger. */
export const billingSchema = pgSchema('billing');
/** Drizzle handle for the Postgres `notify` schema — notifications, webhooks, delivery attempts. */
export const notifySchema = pgSchema('notify');
/** Drizzle handle for the Postgres `audit` schema — append-only audit log with row-level retention. */
export const auditSchema = pgSchema('audit');
/** Drizzle handle for the Postgres `upload` schema — S3 upload metadata + tombstone retention. */
export const uploadSchema = pgSchema('upload');
/** Drizzle handle for the Postgres `app` schema — the app's own record tables (branches, and the launch's records). */
export const appSchema = pgSchema('app');

/** The `app.*` GUC each GUC-backed maintenance kind arms — the selector of one RLS bypass arm. */
export type MaintenanceBypassGuc =
  | 'app.global_retention_cleanup'
  | 'app.session_retention_cleanup'
  | 'app.global_admin'
  | 'app.system_audit_insert'
  | 'app.audit_outbox_drain';

/**
 * An RLS bypass arm for a `pgPolicy` predicate: open only while `guc` is `'true'` AND the
 * connection acts as the maintenance role ({@link DATABASE_MAINTENANCE_ROLE}). Both reads are
 * `SELECT`-wrapped so each is an initplan, evaluated once per statement.
 *
 * @remarks
 * The role condition makes bypass authority a property of the maintenance CONNECTION
 * (`DATABASE_MAINTENANCE_URL`): any other role that sets the GUC opens nothing. Mirrors
 * migration `20261005170000_bind_bypass_arms_to_maintenance_role.sql`, which the
 * rls-table-scope-map suite pins against `pg_policies`.
 */
export function maintenanceBypassArm(guc: MaintenanceBypassGuc): SQL {
  return sql.raw(
    `((SELECT current_setting('${guc}', true)) = 'true' AND (SELECT current_user) = '${DATABASE_MAINTENANCE_ROLE}')`,
  );
}
