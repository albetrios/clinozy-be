import { seedRecentStepUpForTestUser } from '@/tests/helpers/test-step-up.helper.js';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { env } from '@/shared/config/env.config.js';
import { sessionExpiresAtFromNow } from '@/domains/auth/sub-domains/auth-session/session-lifetime.js';
import { MFA_AUTHENTICATION_METHOD, signAccessToken } from '@/shared/utils/security/jwt.util.js';
import { AuthSessionRepository } from '@/domains/auth/sub-domains/auth-session/auth-session.repository.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { users } from '@/domains/user/user.schema.js';
import { and, eq, ne } from 'drizzle-orm';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { injectUnauthenticated } from '@/tests/helpers/test-http-inject.helper.js';

async function persistActiveSessionForToken(
  userPublicId: string,
  token: string,
): Promise<string | null> {
  // Fixture lookup on the operator connection: `auth.users` is FORCE RLS and this runs before any
  // request context exists, so under `pnpm test:rls-role` the ordinary pool sees nothing here —
  // which silently yielded no session and turned every authenticated assertion into a 401.
  const [user] = await getOperatorDatabase()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.public_id, userPublicId))
    .limit(1);
  if (!user) {
    return null;
  }
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = sessionExpiresAtFromNow();
  const sessionRepository = new AuthSessionRepository();
  // The session row itself is written through the repository inside the owner's context —
  // the same shape `AuthSessionService` uses in production, so the fixture exercises the real
  // write path rather than out-privileging the policy that guards it.
  const session = await withAppDatabaseContext({
    scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: userPublicId }),
    callback: () =>
      sessionRepository.create({
        user_id: user.id,
        token_hash: tokenHash,
        refresh_token_hash: createHash('sha256').update(`${tokenHash}:refresh`).digest('hex'),
        ip_address: '127.0.0.1',
        user_agent: 'vitest',
        expires_at: expiresAt,
      }),
  });
  return session.public_id;
}

function getConfiguredSuperAdminEmail(): string | undefined {
  return env.GLOBAL_ADMIN_EMAILS?.split(',')
    .map((email) => email.trim().toLowerCase())
    .find((email) => email.length > 0);
}

async function alignUserWithSuperAdminAllowlist(userPublicId: string): Promise<void> {
  const superAdminEmail = getConfiguredSuperAdminEmail();
  if (!superAdminEmail) {
    // The auth middleware's `rederiveSuperAdminRole` consults the live
    // `GLOBAL_ADMIN_EMAILS` allowlist on every request that carries a
    // `super_admin` JWT. With no allowlist, the user is downgraded to USER
    // and admin-gated routes return 403 — the test then fails with a
    // confusing "expected 200 to be 403" message that doesn't point at the
    // missing env config.
    //
    // Surface the misconfiguration here at test-setup time instead. Local dev
    // ships `GLOBAL_ADMIN_EMAILS=ops@example.com` in `.env.development`; CI
    // exports the same value via `.github/actions/test-env/action.yml`. If
    // either is missing we want to fail loudly so the next maintainer
    // doesn't repeat the 4-PR audit-test flake hunt that found this.
    throw new Error(
      'generateSuperAdminToken requires `GLOBAL_ADMIN_EMAILS` to be configured. ' +
        'Set it in `.env.development` locally or in `.github/actions/test-env/action.yml` for CI. ' +
        'Without it, the auth middleware downgrades super_admin JWTs to USER and admin routes 403.',
    );
  }

  // Idempotency vs stale state: an interrupted earlier run (or out-of-band probe) can
  // leave a committed user already holding the allowlist email — the reassignment below
  // would then violate idx_users_email_unique in suites that never truncate (mcp-auth).
  // Hard-delete any OTHER row holding the email first; this is a test-only helper.
  await getOperatorDatabase()
    .delete(users)
    .where(and(eq(users.email, superAdminEmail), ne(users.public_id, userPublicId)));
  await getOperatorDatabase()
    .update(users)
    .set({
      email: superAdminEmail,
      email_hash: createHash('sha256').update(superAdminEmail).digest('hex'),
      is_email_verified: true,
      // A-2: super_admin is granted only to an account with an enrolled MFA factor.
      is_mfa_enabled: true,
      status: 'ACTIVE',
    })
    .where(eq(users.public_id, userPublicId));
}

/**
 * Generate a test JWT access token backed by an active auth session row (required by auth middleware).
 *
 * @remarks Pass `authenticationMethods: [MFA_AUTHENTICATION_METHOD]` for a token whose session has
 * proved a second factor (`amr: ['mfa']`) — required on organization routes once the organization's
 * security policy sets `mfa_required`.
 */
export async function generateTestToken(options: {
  userId: string;
  role?: string;
  organizationPublicId?: string;
  authenticationMethods?: string[];
  /**
   * Also record a recent step-up on the token's session — for the routes behind
   * `requireRecentStepUpPreHandler` (account deletion, data export, ownership transfer,
   * organization deletion, credential changes).
   */
  stepUp?: boolean;
}): Promise<string> {
  const token = await signAccessToken({
    userId: options.userId,
    role: options.role ?? 'user',
    ...(options.organizationPublicId ? { organizationPublicId: options.organizationPublicId } : {}),
    ...(options.authenticationMethods
      ? { authenticationMethods: options.authenticationMethods }
      : {}),
  });
  const sessionPublicId = await persistActiveSessionForToken(options.userId, token);
  if (options.stepUp) {
    if (!sessionPublicId) {
      throw new Error(`generateTestToken could not persist a session for user ${options.userId}`);
    }
    await seedRecentStepUpForTestUser(options.userId, sessionPublicId);
  }
  return token;
}

/**
 * Variant of {@link generateTestToken} that also returns the resulting session's `public_id`.
 *
 * @remarks Use this when a test needs to call `seedRecentStepUpForTestUser(userId, sessionId)`
 * because the step-up sentinel is per-(user, session) after sec-A2. Tests that only need the
 * bearer can keep using `generateTestToken`.
 */
export async function generateTestTokenAndSession(options: {
  userId: string;
  role?: string;
  organizationPublicId?: string;
  authenticationMethods?: string[];
}): Promise<{ token: string; sessionPublicId: string }> {
  const token = await signAccessToken({
    userId: options.userId,
    role: options.role ?? 'user',
    ...(options.organizationPublicId ? { organizationPublicId: options.organizationPublicId } : {}),
    ...(options.authenticationMethods
      ? { authenticationMethods: options.authenticationMethods }
      : {}),
  });
  const sessionPublicId = await persistActiveSessionForToken(options.userId, token);
  if (!sessionPublicId) {
    throw new Error(
      `generateTestTokenAndSession could not persist a session for user ${options.userId}`,
    );
  }
  return { token, sessionPublicId };
}

/**
 * Generate a test token for a super admin user.
 *
 * @remarks A-2: the account gets an enrolled MFA factor, the token's session has proved it
 * (`amr: ['mfa']`, which `requireRole` demands of a super_admin) and holds a recent password
 * step-up (the admin delete / suspend routes demand a strong one). A test of either refusal mints
 * its own token with {@link generateTestToken}.
 */
export async function generateSuperAdminToken(userId = 'test-super-admin'): Promise<string> {
  await alignUserWithSuperAdminAllowlist(userId);
  return generateTestToken({
    userId,
    role: 'super_admin',
    authenticationMethods: [MFA_AUTHENTICATION_METHOD],
    stepUp: true,
  });
}

/**
 * Makes `userPublicId` the allowlisted platform admin (verified, ACTIVE, MFA enrolled) without
 * minting a token — for a test that needs a super_admin token of a particular shape.
 */
export async function makeTestUserSuperAdmin(userPublicId: string): Promise<void> {
  await alignUserWithSuperAdminAllowlist(userPublicId);
}

/**
 * Generate a test token for a regular user.
 */
export async function generateUserToken(userId = 'test-user'): Promise<string> {
  return generateTestToken({ userId, role: 'user' });
}

/**
 * Issue a JWT and persist a matching active session row (required by auth middleware).
 *
 * @remarks Returns both the bearer token and the resulting session `public_id`. Tests that
 * need to seed a recent step-up must pass the session id to `seedRecentStepUpForTestUser`
 * because the sentinel is per-(user, session) after sec-A2.
 */
export async function generateTestTokenWithActiveSession(
  application: FastifyInstance,
  userPublicId: string,
  options?: { role?: string; organizationPublicId?: string },
): Promise<{ token: string; sessionPublicId: string }> {
  const token = await signAccessToken({
    userId: userPublicId,
    role: options?.role ?? 'user',
    ...(options?.organizationPublicId
      ? { organizationPublicId: options.organizationPublicId }
      : {}),
  });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = sessionExpiresAtFromNow();
  const session = await application.authDomain.authSessionService.createSessionForUser({
    userPublicId,
    data: {
      token_hash: tokenHash,
      ip_address: '127.0.0.1',
      expires_at: expiresAt,
    },
  });
  return { token, sessionPublicId: session.public_id };
}

/**
 * Log in via the API and return a bearer token backed by an active auth session row.
 */
export async function loginAndGetAccessToken(
  application: FastifyInstance,
  credentials: { email: string; password: string },
): Promise<string> {
  const response = await injectUnauthenticated(application, {
    method: 'POST',
    url: testApiPath('/auth/login'),
    payload: credentials,
  });
  if (response.statusCode !== 200) {
    throw new Error(`login failed with status ${response.statusCode}: ${response.body}`);
  }
  const body = response.json() as { data: { access_token: string } };
  return body.data.access_token;
}
