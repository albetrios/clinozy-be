import { describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';

const ORGANIZATION_PUBLIC_ID = 'org_identityrestore000001';
const OUTER_USER_PUBLIC_ID = 'usr_outeridentity00000001';
const INNER_USER_PUBLIC_ID = 'usr_inneridentity00000001';

async function currentUserPublicId(databaseHandle: {
  execute: (query: ReturnType<typeof drizzleSql>) => PromiseLike<unknown>;
}): Promise<string | null> {
  const result = await databaseHandle.execute(
    drizzleSql`SELECT current_setting('app.current_user_public_id', true) AS value`,
  );
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as {
    value: string | null;
  }[];
  return rows[0]?.value ?? null;
}

/**
 * A nested unit of work that reuses the outer transaction layers its own user identity, and a
 * `SET LOCAL` lasts for the whole transaction — so the outer unit must get its identity back when
 * the nested one ends, or it carries on as the inner user.
 */
describe('a nested database context restores the outer user identity', () => {
  it('after an organization scope reused for another user', async () => {
    await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({
        organizationPublicId: ORGANIZATION_PUBLIC_ID,
        userPublicId: OUTER_USER_PUBLIC_ID,
      }),
      callback: async (outerHandle) => {
        await withAppDatabaseContext({
          scope: PRINCIPAL_SCOPE.VERIFIED({
            organizationPublicId: ORGANIZATION_PUBLIC_ID,
            userPublicId: INNER_USER_PUBLIC_ID,
          }),
          callback: async (innerHandle) => {
            expect(await currentUserPublicId(innerHandle)).toBe(INNER_USER_PUBLIC_ID);
          },
        });
        expect(await currentUserPublicId(outerHandle)).toBe(OUTER_USER_PUBLIC_ID);
      },
    });
  });

  it('after a user-only scope layered on the pinned transaction', async () => {
    await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({
        organizationPublicId: ORGANIZATION_PUBLIC_ID,
        userPublicId: OUTER_USER_PUBLIC_ID,
      }),
      callback: async (outerHandle) => {
        await withAppDatabaseContext({
          scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: INNER_USER_PUBLIC_ID }),
          callback: async (innerHandle) => {
            expect(await currentUserPublicId(innerHandle)).toBe(INNER_USER_PUBLIC_ID);
          },
        });
        expect(await currentUserPublicId(outerHandle)).toBe(OUTER_USER_PUBLIC_ID);
      },
    });
  });

  it('also when the nested unit throws and the outer one carries on', async () => {
    await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({
        organizationPublicId: ORGANIZATION_PUBLIC_ID,
        userPublicId: OUTER_USER_PUBLIC_ID,
      }),
      callback: async (outerHandle) => {
        await expect(
          withAppDatabaseContext({
            scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: INNER_USER_PUBLIC_ID }),
            callback: async () => {
              throw new Error('nested failure');
            },
          }),
        ).rejects.toThrow('nested failure');
        expect(await currentUserPublicId(outerHandle)).toBe(OUTER_USER_PUBLIC_ID);
      },
    });
  });
});
