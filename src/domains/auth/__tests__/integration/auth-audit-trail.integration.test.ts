import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { generate as generateTotp } from 'otplib';
import { logs } from '@/domains/audit/audit.schema.js';
import { audit_outbox } from '@/domains/audit/audit-outbox.schema.js';
import { runAuditOutboxDrainJob } from '@/domains/audit/workers/audit-outbox-drain.processor.js';
import { verification_tokens } from '@/domains/auth/sub-domains/auth-method/verification-token/verification-token.schema.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedAllPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { api_keys } from '@/domains/tenancy/sub-domains/organization/organization-api-key/organization-api-key.schema.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestUser, createTestUserWithPassword } from '@/tests/factories/user.factory.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { generateTestToken, generateTestTokenAndSession } from '@/tests/helpers/test-auth.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  injectAuthenticated,
  injectUnauthenticated,
} from '@/tests/helpers/test-http-inject.helper.js';
import { seedRecentStepUpForTestUser } from '@/tests/helpers/test-step-up.helper.js';

/**
 * The security events an investigator reads from `audit.logs` must actually get there. Each event
 * below was lost before it reached the outbox — the audit service discards a row that names no
 * actor, and these were recorded without one — while every unit test passed against mocks. So each
 * is driven end to end here: the real route, the real outbox INSERT under its row-level security
 * policy (as the RLS-subject application role under `pnpm test:rls-role`), the outbox CHECK, and
 * the real drain into the ledger.
 */
describe('auth audit trail — security events reach audit.logs', () => {
  let application: FastifyInstance;

  beforeAll(async () => {
    const { app } = await createTestApp();
    application = app;
  });

  afterAll(async () => {
    await application.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function drainAuditOutbox() {
    return withMaintenanceDatabaseContext(MAINTENANCE_SCOPE.AUDIT_OUTBOX_DRAIN, (databaseHandle) =>
      runAuditOutboxDrainJob(databaseHandle),
    );
  }

  async function auditLogRows(action: string) {
    return getOperatorDatabase().select().from(logs).where(eq(logs.action, action));
  }

  /** Enrolls TOTP for the user through the real routes and returns one of the recovery codes it issues. */
  async function enrollTotpAndTakeRecoveryCode(userPublicId: string): Promise<string> {
    const { token, sessionPublicId } = await generateTestTokenAndSession({ userId: userPublicId });
    await seedRecentStepUpForTestUser(userPublicId, sessionPublicId);
    const enroll = await injectAuthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/me/mfa/enroll'),
      token,
      payload: { method_type: 'MFA_TOTP' },
    });
    expect(enroll.statusCode).toBe(200);
    const { secret } = (enroll.json() as { data: { secret: string } }).data;
    const confirm = await injectAuthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/me/mfa/enroll/confirm'),
      token,
      payload: { code: await generateTotp({ secret }) },
    });
    expect(confirm.statusCode).toBe(200);
    const { recovery_codes: recoveryCodes } = (
      confirm.json() as { data: { recovery_codes: string[] } }
    ).data;
    expect(recoveryCodes.length).toBeGreaterThan(0);
    return recoveryCodes[0]!;
  }

  it('a failed password login is recorded as an anonymous auth.login_failure', async () => {
    const { user } = await createTestUserWithPassword({ isEmailVerified: true });

    const response = await injectUnauthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/login'),
      payload: { email: user.email, password: 'NotTheRightPassword1!' },
    });
    expect(response.statusCode).toBe(401);

    // Staged with no actor and declared anonymous — the outbox CHECK admits exactly that shape.
    const staged = await getOperatorDatabase()
      .select()
      .from(audit_outbox)
      .where(eq(audit_outbox.action, 'auth.login_failure'));
    expect(staged).toHaveLength(1);
    expect(staged[0]).toMatchObject({
      actor_user_public_id: null,
      actor_api_key_public_id: null,
      metadata: { source: 'password', actor_kind: 'anonymous' },
    });

    expect((await drainAuditOutbox()).permanentlyFailed).toBe(0);

    const rows = await auditLogRows('auth.login_failure');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: null,
      actor_api_key_id: null,
      resource_type: 'session',
      metadata: {
        source: 'password',
        error_code: 'errors:invalidEmailOrPassword',
        actor_kind: 'anonymous',
      },
    });
    // The account the caller tried is deliberately not named anywhere on the row.
    const serializedRow = JSON.stringify(rows[0]);
    expect(serializedRow).not.toContain(user.email);
    expect(serializedRow).not.toContain(user.public_id);
  });

  it('a completed password reset is recorded as auth.password.reset, attributed to the user', async () => {
    const { user } = await createTestUserWithPassword({ isEmailVerified: true });
    const rawToken = randomBytes(32).toString('hex');
    await getOperatorDatabase()
      .insert(verification_tokens)
      .values({
        token_type: 'PASSWORD_RESET',
        token_hash: createHash('sha256').update(rawToken).digest('hex'),
        user_id: user.id,
        email: user.email,
        expires_at: new Date(Date.now() + 3_600_000),
      });

    const response = await injectUnauthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/password/reset'),
      payload: { token: rawToken, password: 'BrandNewPassword456!' },
    });
    expect(response.statusCode).toBe(200);

    expect((await drainAuditOutbox()).permanentlyFailed).toBe(0);

    const rows = await auditLogRows('auth.password.reset');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: user.id,
      resource_type: 'user',
      severity: 'WARNING',
    });
  });

  it('an MFA login with a recovery code is recorded as auth.mfa.recovery_code_used, attributed to the user', async () => {
    const { user, password } = await createTestUserWithPassword({ isEmailVerified: true });
    const recoveryCode = await enrollTotpAndTakeRecoveryCode(user.public_id);

    const passwordStep = await injectUnauthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/login'),
      payload: { email: user.email, password },
    });
    expect(passwordStep.statusCode).toBe(200);
    const { mfa_session_token: mfaSessionToken } = (
      passwordStep.json() as { data: { mfa_session_token: string } }
    ).data;
    expect(mfaSessionToken).toBeTruthy();

    const recoveryStep = await injectUnauthenticated(application, {
      method: 'POST',
      url: testApiPath('/auth/mfa/login'),
      payload: { mfa_session_token: mfaSessionToken, recovery_code: recoveryCode },
    });
    expect(recoveryStep.statusCode).toBe(200);

    expect((await drainAuditOutbox()).permanentlyFailed).toBe(0);

    const rows = await auditLogRows('auth.mfa.recovery_code_used');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: user.id,
      resource_type: 'mfa_method',
      severity: 'WARNING',
    });
    // ...next to the login it completed, which names the factor.
    const logins = await auditLogRows('auth.login');
    expect(logins).toHaveLength(1);
    expect(logins[0]).toMatchObject({
      actor_user_id: user.id,
      metadata: { source: 'mfa_recovery_code' },
    });
  });

  it('an API key denied a scope is recorded as auth.permission.denied, attributed to the key', async () => {
    await seedAllPermissions();
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const keyManager = await createTestUser();
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [
        TENANCY_PERMISSIONS.API_KEY_MANAGE,
        TENANCY_PERMISSIONS.API_KEY_READ,
        TENANCY_PERMISSIONS.MEMBERSHIP_READ,
      ],
    });
    await createMembership({
      userId: keyManager.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    const token = await generateTestToken({
      userId: keyManager.public_id,
      organizationPublicId: organization.public_id,
    });

    const minted = await injectAuthenticated(application, {
      method: 'POST',
      url: testApiPath('/tenancy/organization/api-keys'),
      token,
      payload: { name: 'members-read-only', scopes: [TENANCY_PERMISSIONS.MEMBERSHIP_READ] },
    });
    expect(minted.statusCode).toBe(200);
    const { api_key: mintedKey, raw_key: rawKey } = (
      minted.json() as { data: { api_key: { id: string }; raw_key: string } }
    ).data;

    // Control: the key works for the scope it holds, so the 403 below is the scope check.
    const allowed = await application.inject({
      method: 'GET',
      url: testApiPath('/tenancy/organization/memberships'),
      headers: { 'x-api-key': rawKey },
    });
    expect(allowed.statusCode).toBe(200);

    const denied = await application.inject({
      method: 'GET',
      url: testApiPath('/tenancy/organization/api-keys'),
      headers: { 'x-api-key': rawKey },
    });
    expect(denied.statusCode).toBe(403);

    expect((await drainAuditOutbox()).permanentlyFailed).toBe(0);

    const [keyRow] = await getOperatorDatabase()
      .select({ id: api_keys.id })
      .from(api_keys)
      .where(eq(api_keys.public_id, mintedKey.id));
    const rows = await auditLogRows('auth.permission.denied');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: null,
      actor_api_key_id: keyRow!.id,
      resource_type: 'route',
      severity: 'WARNING',
      metadata: {
        deny_reason: 'api_key_scope_missing',
        permission_code: TENANCY_PERMISSIONS.API_KEY_READ,
      },
    });
  });
});
