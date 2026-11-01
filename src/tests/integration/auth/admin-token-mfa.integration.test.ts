import type { AddressInfo } from 'node:net';
import { generateSecret } from 'otplib';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { auth_methods } from '@/domains/auth/sub-domains/auth-method/auth-method.schema.js';
import { users } from '@/domains/user/user.schema.js';
import { signInOverApi } from '@/scripts/admin/api-sign-in.util.js';
import { ensureDemoAdmin } from '@/scripts/seed/ensure-demo-admin.js';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';

/**
 * A-2 follow-up: a platform admin needs an enrolled MFA factor and an MFA-verified session, so the
 * password-only `pnpm tool:admin-token` (and the nightly k6 admin scenarios it feeds) could no
 * longer mint a super_admin token. Against the real API: `pnpm db:seed:demo-admin` enrolls a TOTP
 * factor for a platform-admin address, and the tool's sign-in completes `POST /auth/mfa/login`
 * with a code computed from the same secret.
 */
// Skipped under `pnpm test:rls-role`, like the full-seed suite: the seeders are an operator activity
// by design (`seed-runtime-url.ts`), so running them as the RLS-subject role would assert nothing.
const runAsApplicationBehaviour = !process.env.TEST_DATABASE_ROLE;

describe.runIf(runAsApplicationBehaviour)(
  'Integration: the demo admin seed and tool:admin-token sign in with TOTP (A-2)',
  () => {
    const adminEmail = (process.env.GLOBAL_ADMIN_EMAILS ?? '').split(',')[0]?.trim() ?? '';
    const password = 'AdminTokenFixture123!';
    // A fresh secret per run: a test-database fixture, never a real factor.
    const totpSecret = generateSecret();
    let application: FastifyInstance;
    let apiPrefix: string;

    beforeAll(async () => {
      expect(adminEmail, 'the harness sets GLOBAL_ADMIN_EMAILS').not.toBe('');
      await cleanupDatabase();
      vi.stubEnv('DEMO_EMAIL', adminEmail);
      vi.stubEnv('DEMO_PASSWORD', password);
      vi.stubEnv('DEMO_TOTP_SECRET', totpSecret);
      await ensureDemoAdmin();
      // The seed is idempotent: a second run keeps the one factor it enrolled.
      await ensureDemoAdmin();

      ({ app: application } = await createTestApp());
      await application.listen({ port: 0, host: '127.0.0.1' });
      apiPrefix = `http://127.0.0.1:${(application.server.address() as AddressInfo).port}/api/v1`;
    }, 60_000);

    afterAll(async () => {
      await application?.close();
      vi.unstubAllEnvs();
    });

    it('enrolls exactly one active TOTP factor and marks the admin MFA-enrolled', async () => {
      const [admin] = await getRequestDatabase()
        .select({ id: users.id, is_mfa_enabled: users.is_mfa_enabled })
        .from(users)
        .where(and(eq(users.email, adminEmail), isNull(users.deleted_at)));
      expect(admin?.is_mfa_enabled).toBe(true);

      const factors = await getRequestDatabase()
        .select({ id: auth_methods.id })
        .from(auth_methods)
        .where(
          and(
            eq(auth_methods.user_id, admin?.id ?? -1),
            eq(auth_methods.method_type, 'MFA_TOTP'),
            isNull(auth_methods.revoked_at),
          ),
        );
      expect(factors).toHaveLength(1);
    });

    it('stops with a message, instead of a user token, when the TOTP secret is missing', async () => {
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit');
      }) as never);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await expect(signInOverApi({ apiPrefix, email: adminEmail, password })).rejects.toThrow(
          'process.exit',
        );
        expect(exit).toHaveBeenCalledWith(1);
        expect(String(error.mock.calls[0]?.[0])).toContain('has MFA enrolled');
        expect(error.mock.calls[0]?.[1]).toBe(adminEmail);
      } finally {
        exit.mockRestore();
        error.mockRestore();
      }
    });

    it('completes POST /auth/mfa/login and returns an MFA-verified super_admin token', async () => {
      const token = await signInOverApi({ apiPrefix, email: adminEmail, password, totpSecret });

      const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
        role?: string;
        amr?: string[];
      };
      expect(claims.role).toBe('super_admin');
      expect(claims.amr).toContain('mfa');

      const adminList = await fetch(`${apiPrefix}/users/`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(adminList.status).toBe(200);
    });
  },
);
