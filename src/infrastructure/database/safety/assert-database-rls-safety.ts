import { sql as drizzleSql } from 'drizzle-orm';
import { sql } from '@/infrastructure/database/connection.js';
import { env } from '@/shared/config/env.config.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  DATABASE_APP_ROLE,
  DATABASE_MAINTENANCE_ROLE,
} from '@/shared/constants/project-identity.constants.js';

/**
 * Row returned by the boot-time `pg_roles` lookup for the current session user.
 * `rolname` is included so the safety log includes the actual login role; `acting_role` is
 * `current_user` — the role the connection's statements run as once a connection-time
 * `role` option has applied, which is what the bypass policy arms compare against.
 */
type SessionRoleSafetyRow = {
  readonly rolname: string;
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
  readonly acting_role: string;
};

/**
 * Verifies that the runtime database role bound to `DATABASE_URL` cannot bypass
 * Row Level Security. PostgreSQL never enforces RLS (even `FORCE`d) for
 * superusers or roles with `BYPASSRLS`, so a misconfigured `DATABASE_URL` (e.g.
 * Railway's default `postgres` superuser) silently collapses tenant isolation
 * on every RLS-only read path with **zero error**.
 *
 * @remarks
 * - **Algorithm**: queries `SELECT rolname, rolsuper, rolbypassrls, current_user FROM
 *   pg_roles WHERE rolname = session_user`. If `rolsuper` or `rolbypassrls` is
 *   true — or the connection acts as `clinozy_be_maintenance`, the one role the bypass
 *   policy arms admit — the boot fails closed in hosted deployments; in local/CI it logs a
 *   loud warning so docker-compose's `postgres` superuser keeps working.
 * - **Failure modes**: throws when the lookup returns no row (defensive — the
 *   session role must be visible in `pg_roles`) or when an RLS-unsafe or maintenance role
 *   is detected on a hosted deployment.
 * - **Side effects**: emits one `database.rls_safety.*` log line; never sets
 *   any session state.
 * - **Notes**: `session_user` (the actual login role) is preferred over
 *   `current_user` so a later `SET ROLE` cannot mask the underlying privilege.
 *   The application's intended runtime role is `clinozy_be_app` (NOLOGIN, granted
 *   to a dedicated login role in production).
 */
export async function assertDatabaseRoleRlsSafety(): Promise<void> {
  const rows = await sql<SessionRoleSafetyRow[]>`
    SELECT rolname, rolsuper, rolbypassrls, current_user AS acting_role
    FROM pg_roles
    WHERE rolname = session_user
  `;

  const row = rows[0];
  if (!row) {
    throw new Error(
      'database.rls_safety.session_role_not_found: pg_roles returned no row for session_user. ' +
        'Verify DATABASE_URL connects with a real role that exists in pg_roles.',
    );
  }

  const { rolname, rolsuper, rolbypassrls, acting_role } = row;
  if (acting_role === DATABASE_MAINTENANCE_ROLE) {
    // The runtime pool must never be the maintenance role: every request connection could
    // then open the bypass policy arms with a GUC.
    const message =
      `database.rls_safety.runtime_is_maintenance_role: DATABASE_URL acts as "${acting_role}", ` +
      'the only role the bypass policy arms admit. Point DATABASE_URL at the RLS-subject ' +
      `\`${DATABASE_APP_ROLE}\` login and keep \`${DATABASE_MAINTENANCE_ROLE}\` on DATABASE_MAINTENANCE_URL.`;
    if (env.DATABASE_RLS_SAFETY_ENFORCED) throw new Error(message);
    logger.warn({ rolname, acting_role }, message);
    return;
  }
  if (!(rolsuper || rolbypassrls)) {
    logger.info({ rolname, rolsuper, rolbypassrls }, 'database.rls_safety.ok');
    return;
  }

  if (env.DATABASE_RLS_SAFETY_ENFORCED) {
    throw new Error(
      `database.rls_safety.unsafe_role: DATABASE_URL connects as "${rolname}" with ` +
        `rolsuper=${rolsuper} rolbypassrls=${rolbypassrls}. PostgreSQL skips Row Level Security ` +
        'for superusers and roles with BYPASSRLS, which silently collapses tenant isolation on ' +
        'every RLS-only read path. Point DATABASE_URL at a dedicated non-superuser login role ' +
        `that has been granted \`${DATABASE_APP_ROLE}\` (or make \`${DATABASE_APP_ROLE}\` LOGIN and connect as it). ` +
        'See docs/deployment/runbooks/resource-limits.md.',
    );
  }

  logger.warn(
    { rolname, rolsuper, rolbypassrls },
    'database.rls_safety.unsafe_role_local: superuser/BYPASSRLS detected on a non-hosted deployment; ' +
      'tenant isolation tests will not exercise FORCE ROW LEVEL SECURITY. Acceptable for local docker-compose ' +
      'where the default user is `postgres`; fail-closed in hosted deployments.',
  );
}

/**
 * The RLS-safety check for the maintenance pool (`DATABASE_MAINTENANCE_URL` →
 * `clinozy_be_maintenance`). The pool must stay SUBJECT to RLS — bypass authority comes from
 * the policy arms, which admit only `current_user = 'clinozy_be_maintenance'` with the kind's
 * GUC — so a superuser/BYPASSRLS maintenance URL would reintroduce the exempt pool this role
 * exists to eliminate, and a URL acting as any other role would leave every maintenance
 * context (retention, admin reads, the audit drain) silently matching no rows.
 *
 * @remarks
 * - **Algorithm:** runs the `pg_roles` lookup through {@link getMaintenanceDatabase}'s pool and
 *   applies the same enforce/warn split as the primary check to two conditions: an exempt
 *   (superuser/BYPASSRLS) login, and a connection that does not act as the maintenance role.
 * - **Failure modes:** throws on either condition when `DATABASE_RLS_SAFETY_ENFORCED` is set;
 *   throws when the session role is not visible in `pg_roles`.
 * - **Side effects:** lazily opens the maintenance pool (it would be opened by the first
 *   maintenance context anyway); emits one log line.
 */
export async function assertMaintenanceDatabaseRoleRlsSafety(): Promise<void> {
  const { getMaintenanceDatabase } = await import('@/infrastructure/database/connection.js');
  const result = await getMaintenanceDatabase().execute<SessionRoleSafetyRow>(
    drizzleSql`SELECT rolname, rolsuper, rolbypassrls, current_user AS acting_role FROM pg_roles WHERE rolname = session_user`,
  );
  const rows = Array.isArray(result)
    ? (result as SessionRoleSafetyRow[])
    : ((result as { rows?: SessionRoleSafetyRow[] }).rows ?? []);
  const row = rows[0];
  if (!row) {
    throw new Error(
      'database.rls_safety.maintenance_session_role_not_found: pg_roles returned no row for the ' +
        'DATABASE_MAINTENANCE_URL session_user.',
    );
  }
  const { rolname, rolsuper, rolbypassrls, acting_role } = row;
  const exempt = rolsuper || rolbypassrls;
  if (!exempt && acting_role === DATABASE_MAINTENANCE_ROLE) {
    logger.info({ rolname, rolsuper, rolbypassrls }, 'database.rls_safety.maintenance_ok');
    return;
  }
  const problem = exempt
    ? `database.rls_safety.maintenance_unsafe_role: DATABASE_MAINTENANCE_URL connects as "${rolname}" ` +
      `with rolsuper=${rolsuper} rolbypassrls=${rolbypassrls}. The maintenance pool must stay ` +
      'SUBJECT to RLS'
    : `database.rls_safety.maintenance_wrong_role: DATABASE_MAINTENANCE_URL acts as "${acting_role}", ` +
      `but the bypass policy arms admit only "${DATABASE_MAINTENANCE_ROLE}" — every maintenance ` +
      'context would match no rows';
  const fix = ` — point it at the dedicated ${DATABASE_MAINTENANCE_ROLE} login role (docs/deployment/runbooks/maintenance-database-role.md).`;
  if (env.DATABASE_RLS_SAFETY_ENFORCED) {
    throw new Error(problem + fix);
  }
  logger.warn(
    { rolname, rolsuper, rolbypassrls, acting_role },
    'database.rls_safety.maintenance_unsafe_role_local: the maintenance pool is exempt from RLS or ' +
      'does not act as the maintenance role on a non-hosted deployment; maintenance contexts will ' +
      'not exercise the production bypass posture.',
  );
}
