/**
 * Ensure the dashboards demo super_admin exists — the user the local dashboards auth proxy
 * (`tooling/dev/dashboards/proxy.mjs`) logs in as to mint the Bull Board super_admin JWT.
 *
 * Without this user, `GET /admin/queues` 401s and the control-room Queues tile shows
 * "Queue data unavailable" (a 502 through the proxy). `pnpm dashboards:up` runs this after
 * `db:migrate` so a fresh DB — or one left with only faker users by `db:seed:bulk` — still
 * lets Bull Board authenticate.
 *
 * Credentials come from `DEMO_EMAIL` / `DEMO_PASSWORD` — the SAME env vars and defaults the
 * proxy reads (`demo@example.com` / `DemoPassword123!`) — so the seeded password always
 * matches what the proxy submits. Keep the defaults here in sync with `proxy.mjs`. The email
 * must also be in `GLOBAL_ADMIN_EMAILS` for the minted token to be super_admin.
 *
 * Idempotent and safe to re-run: every seed primitive upserts, and `seedDemoUser` resets the
 * password on conflict, so this repairs a demo user that was seeded with a stale/random one.
 * Creates the demo organization + Admin role + membership too, because login resolves an active
 * organization for the token (a bare user row cannot sign in). Mirrors the demo-admin core of
 * `full.ts`; `db:seed:sync-demo` assumes exactly the rows this script guarantees.
 *
 * A platform admin needs an enrolled MFA factor and an MFA-verified session (A-2), so when
 * `DEMO_EMAIL` is on `GLOBAL_ADMIN_EMAILS` this also enrolls a TOTP factor with the secret the
 * operator tools compute their codes from — `DEMO_TOTP_SECRET`, else the local default in
 * `tooling/dev/demo-admin-totp.ts`. An address that is not a platform admin (the plain
 * `demo@example.com` clinozy-fe signs in with) keeps a password-only sign-in.
 *
 * Usage: pnpm db:seed:demo-admin   (or DEMO_EMAIL=… DEMO_PASSWORD=… DEMO_TOTP_SECRET=… pnpm db:seed:demo-admin)
 */
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import '@/shared/config/load-env-files.js';
import '@/scripts/seed/seed-runtime-url.js';
import { closeDatabase } from './helpers.js';
import {
  seedPermissions,
  SYSTEM_PERMISSIONS,
} from '@/domains/tenancy/sub-domains/permission/seed/permission.reference.seed.js';
import { markSeededUserMfaEnabled, seedDemoUser } from '@/domains/user/seed/user.seed.js';
import { seedTotpFactor } from '@/domains/auth/sub-domains/auth-mfa/seed/auth-mfa.seed.js';
import {
  seedOrganization,
  seedRole,
  seedRolePermissions,
  seedMembership,
} from '@/domains/tenancy/seed/tenancy.seed.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { resolveGlobalRoleForEmail } from '@/shared/utils/auth/global-admin-role.util.js';
import { GLOBAL_ROLES } from '@/shared/constants/roles.constants.js';
import { resolveDemoAdminTotpSecret } from '@tooling/dev/demo-admin-totp.js';
import { isMain, parseCommandLine } from '@tooling/setup/common/script.js';
import { assertBulkSeedAllowed } from './production-guard.js';

/** The demo admin's credentials, read when the seed runs (the env the caller has then). */
function demoAdminCredentials(): { email: string; password: string } {
  return {
    email: process.env.DEMO_EMAIL || 'demo@example.com',
    password: process.env.DEMO_PASSWORD || 'DemoPassword123!',
  };
}

/**
 * Create-or-repair the demo super_admin plus the demo organization, Admin role, system
 * permissions, and an active membership so the user can complete a password login. All calls
 * are idempotent upserts; running twice changes nothing beyond resetting the demo password.
 *
 * @remarks
 * Refuses a non-local `DATABASE_URL` before any write ({@link assertBulkSeedAllowed}, H-11): the
 * account has a known default password, a known TOTP secret and every system permission. When the
 * email is on `GLOBAL_ADMIN_EMAILS` it enrolls the TOTP factor (`seedTotpFactor`) and marks the
 * account MFA-enrolled, so sign-in grants `super_admin` after `POST /auth/mfa/login` (A-2).
 */
export async function ensureDemoAdmin(): Promise<void> {
  assertBulkSeedAllowed(process.env);
  await seedPermissions();

  const { email: demoEmail, password: demoPassword } = demoAdminCredentials();
  const demoUser = await seedDemoUser({ email: demoEmail, password: demoPassword });
  if (!demoUser) throw new Error('ensure-demo-admin: failed to upsert demo user');

  const demoOrganization = await seedOrganization({
    name: 'Demo Organization',
    slug: 'demo-org',
    owner_user_id: demoUser.id,
  });
  if (!demoOrganization) throw new Error('ensure-demo-admin: failed to upsert demo organization');

  const adminRole = await seedRole({
    organization_id: demoOrganization.id,
    name: 'Admin',
    is_system: true,
    created_by_user_id: demoUser.id,
  });
  if (!adminRole) throw new Error('ensure-demo-admin: failed to upsert admin role');

  await seedRolePermissions({
    roleId: adminRole.id,
    permissionCodes: SYSTEM_PERMISSIONS.map((permission) => permission.code),
    createdByUserId: demoUser.id,
  });

  await seedMembership({
    user_id: demoUser.id,
    organization_id: demoOrganization.id,
    role_id: adminRole.id,
    status: MEMBERSHIP_STATUS.ACTIVE,
    created_by_user_id: demoUser.id,
  });

  // A-2: super_admin needs an enrolled MFA factor; only a platform-admin address gets one.
  const isPlatformAdmin = resolveGlobalRoleForEmail(demoEmail) === GLOBAL_ROLES.SUPER_ADMIN;
  if (isPlatformAdmin) {
    await seedTotpFactor({
      userId: demoUser.id,
      secret: resolveDemoAdminTotpSecret(process.env),
    });
    await markSeededUserMfaEnabled(demoUser.id);
  }

  logger.info(
    { email: demoEmail, user_public_id: demoUser.public_id, totp_enrolled: isPlatformAdmin },
    'ensure-demo-admin: demo super_admin ready',
  );
}

/**
 * `closeDatabase` always runs (success or failure). Without it, a thrown error here
 * would `process.exit(1)` before the database pool finishes draining and leave
 * aborted connections behind in Postgres.
 */
if (isMain(import.meta.url)) {
  parseCommandLine({ args: process.argv.slice(2) });
  ensureDemoAdmin()
    .catch((error) => {
      logger.error({ error }, 'ensure-demo-admin: failed');
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabase();
    });
}
