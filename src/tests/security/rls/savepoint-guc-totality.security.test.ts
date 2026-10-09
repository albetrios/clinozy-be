import { describe, it, expect, beforeAll } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import {
  setLocalApplicationRole,
  getRequestDatabase,
  runWithPinnedDatabaseHandle,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { database } from '@/infrastructure/database/connection.js';
import { grantClinozyBeAppRoleForTests } from '@/tests/helpers/rls-matrix.helper.js';

/**
 * Pins the savepoint-settings semantics that the audit-outbox drain depends on.
 *
 * `RELEASE SAVEPOINT` **keeps** whatever the savepoint set — only `ROLLBACK TO SAVEPOINT` restores
 * it. A per-row loop that sets only the GUC its own row needs therefore inherits the other
 * branch's value from the previous row, silently widening the RLS policy for the remainder of the
 * outer batch transaction. `audit-outbox-drain.processor.ts` writes BOTH identity GUCs on every
 * iteration for exactly this reason; this test documents the Postgres behaviour that makes that
 * necessary, so a future "simplification" back to one-GUC-per-branch has something to fail against.
 */
function scalar(result: unknown): string | null {
  const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as {
    value: string | null;
  }[];
  return rows[0]?.value ?? null;
}

describe('Security: savepoints do not restore session settings', () => {
  beforeAll(async () => {
    await grantClinozyBeAppRoleForTests();
  });

  it('RELEASE SAVEPOINT keeps a GUC set inside the savepoint (the trap)', async () => {
    const leaked = await database.transaction(async (transaction) => {
      await transaction.execute(
        drizzleSql`SELECT set_config('app.current_organization_public_id', 'org_outer', true)`,
      );
      await transaction.execute(drizzleSql`SAVEPOINT s`);
      await transaction.execute(
        drizzleSql`SELECT set_config('app.current_organization_public_id', 'org_inner', true)`,
      );
      await transaction.execute(drizzleSql`RELEASE SAVEPOINT s`);
      return scalar(
        await transaction.execute(
          drizzleSql`SELECT current_setting('app.current_organization_public_id', true) AS value`,
        ),
      );
    });

    // Not 'org_outer' — this is the behaviour the drain's both-GUCs-every-row rule defends against.
    expect(leaked).toBe('org_inner');
  });

  it('ROLLBACK TO SAVEPOINT does restore it', async () => {
    const restored = await database.transaction(async (transaction) => {
      await transaction.execute(
        drizzleSql`SELECT set_config('app.current_organization_public_id', 'org_outer', true)`,
      );
      await transaction.execute(drizzleSql`SAVEPOINT s`);
      await transaction.execute(
        drizzleSql`SELECT set_config('app.current_organization_public_id', 'org_inner', true)`,
      );
      await transaction.execute(drizzleSql`ROLLBACK TO SAVEPOINT s`);
      return scalar(
        await transaction.execute(
          drizzleSql`SELECT current_setting('app.current_organization_public_id', true) AS value`,
        ),
      );
    });

    expect(restored).toBe('org_outer');
  });

  it('writing both GUCs every iteration leaves no inherited value', async () => {
    // Mirrors the drain loop: row 1 tenantless, row 2 tenanted. Each iteration writes BOTH.
    const observed = await database.transaction(async (transaction) => {
      const seen: { organization: string | null; systemArm: string | null }[] = [];
      for (const organizationPublicId of [null, 'org_B'] as const) {
        await transaction.execute(drizzleSql`SAVEPOINT row_scope`);
        await transaction.execute(
          drizzleSql`SELECT set_config('app.current_organization_public_id', ${organizationPublicId ?? ''}, true)`,
        );
        await transaction.execute(
          drizzleSql`SELECT set_config('app.system_audit_insert', ${organizationPublicId === null ? 'true' : 'false'}, true)`,
        );
        seen.push({
          organization: scalar(
            await transaction.execute(
              drizzleSql`SELECT current_setting('app.current_organization_public_id', true) AS value`,
            ),
          ),
          systemArm: scalar(
            await transaction.execute(
              drizzleSql`SELECT current_setting('app.system_audit_insert', true) AS value`,
            ),
          ),
        });
        await transaction.execute(drizzleSql`RELEASE SAVEPOINT row_scope`);
      }
      return seen;
    });

    // Row 2 must NOT inherit row 1's system arm — that is the regression this guards.
    expect(observed).toEqual([
      { organization: '', systemArm: 'true' },
      { organization: 'org_B', systemArm: 'false' },
    ]);
  });
});

describe('Security: original principal identity reuse', () => {
  beforeAll(async () => {
    await grantClinozyBeAppRoleForTests();
  });

  async function visibleUserPublicIds(): Promise<string[]> {
    const result = await getRequestDatabase().execute(
      drizzleSql`SELECT public_id FROM auth.users WHERE deleted_at IS NULL`,
    );
    const rows = (
      Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    ) as { public_id: string }[];
    return rows.map((row) => row.public_id);
  }

  it('unchanged nested user scopes expose only the original user under FORCE RLS', async () => {
    const user = await createTestUser();
    const foreign = await createTestUser();
    const scope = PRINCIPAL_SCOPE.VERIFIED({ userPublicId: user.public_id });
    await withAppDatabaseContext(scope, async (handle) => {
      await setLocalApplicationRole(handle);
      await withAppDatabaseContext(scope, async () => {
        expect(await visibleUserPublicIds()).toEqual([user.public_id]);
        expect(await visibleUserPublicIds()).not.toContain(foreign.public_id);
      });
    });
  });

  it('re-arms a changed user after savepoint rollback and then restores the requested original identity', async () => {
    const user = await createTestUser();
    const foreign = await createTestUser();
    const original = PRINCIPAL_SCOPE.VERIFIED({ userPublicId: user.public_id });
    const changed = PRINCIPAL_SCOPE.VERIFIED({ userPublicId: foreign.public_id });
    await withAppDatabaseContext(original, async (handle) => {
      await setLocalApplicationRole(handle);
      await handle.execute(drizzleSql`SAVEPOINT principal_identity`);
      await withAppDatabaseContext(changed, async () => {
        expect(await visibleUserPublicIds()).toEqual([foreign.public_id]);
      });
      await handle.execute(drizzleSql`ROLLBACK TO SAVEPOINT principal_identity`);
      expect(await visibleUserPublicIds()).toEqual([user.public_id]);
      await withAppDatabaseContext(changed, async () => {
        expect(await visibleUserPublicIds()).toEqual([foreign.public_id]);
      });
      await withAppDatabaseContext(original, async () => {
        expect(await visibleUserPublicIds()).toEqual([user.public_id]);
      });
      await handle.execute(drizzleSql`RELEASE SAVEPOINT principal_identity`);
    });
  });

  it('a released Drizzle savepoint invalidates the outer original-user shortcut', async () => {
    const user = await createTestUser();
    const foreign = await createTestUser();
    const original = PRINCIPAL_SCOPE.VERIFIED({ userPublicId: user.public_id });
    await withAppDatabaseContext(original, async (handle) => {
      await setLocalApplicationRole(handle);
      await handle.transaction((savepoint) =>
        runWithPinnedDatabaseHandle(savepoint, async () => {
          await withAppDatabaseContext(
            PRINCIPAL_SCOPE.VERIFIED({ userPublicId: foreign.public_id }),
            async () => {
              expect(await visibleUserPublicIds()).toEqual([foreign.public_id]);
            },
          );
        }),
      );
      expect(await visibleUserPublicIds()).toEqual([foreign.public_id]);
      await withAppDatabaseContext(original, async () => {
        expect(await visibleUserPublicIds()).toEqual([user.public_id]);
      });
    });
  });

  it('a later pooled transaction exposes its own user after the earlier transaction rolls back', async () => {
    const user = await createTestUser();
    const foreign = await createTestUser();
    await expect(
      withAppDatabaseContext(
        PRINCIPAL_SCOPE.VERIFIED({ userPublicId: user.public_id }),
        async (handle) => {
          await setLocalApplicationRole(handle);
          expect(await visibleUserPublicIds()).toEqual([user.public_id]);
          throw new Error('rollback principal transaction');
        },
      ),
    ).rejects.toThrow('rollback principal transaction');
    await withAppDatabaseContext(
      PRINCIPAL_SCOPE.VERIFIED({ userPublicId: foreign.public_id }),
      async (handle) => {
        await setLocalApplicationRole(handle);
        expect(await visibleUserPublicIds()).toEqual([foreign.public_id]);
      },
    );
  });
});
