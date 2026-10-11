import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import {
  getActiveOrganizationRlsCheckoutCount,
  resetOrganizationRlsCheckoutCountForTests,
} from '@/infrastructure/database/pool/organization-rls-checkout-counter.js';
import { ConfigurationError } from '@/shared/errors/index.js';

const mockExecute = vi.fn().mockResolvedValue(undefined);
const mockTransactionHandle = { execute: mockExecute, tag: 'transaction-handle' };

vi.mock('@/infrastructure/database/connection.js', () => ({
  database: {
    transaction: vi.fn(
      async (callback: (transaction: typeof mockTransactionHandle) => Promise<unknown>) =>
        callback(mockTransactionHandle),
    ),
  },
}));

/** Renders the SQL text of every set_config statement executed so far. */
function executedSqlTexts(): string[] {
  return mockExecute.mock.calls.map((call) => {
    const statement = call[0] as { queryChunks?: unknown[] } | string;
    if (typeof statement === 'string') return statement;
    return JSON.stringify(statement.queryChunks ?? statement);
  });
}

describe('withAppDatabaseContext', () => {
  beforeEach(() => {
    mockExecute.mockClear();
    resetOrganizationRlsCheckoutCountForTests();
  });

  it('sets BOTH identity GUCs in one statement for a user+organization scope', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({
      userPublicId: 'usr_a',
      organizationPublicId: 'org_x',
    });

    await withAppDatabaseContext({ scope, callback: async () => undefined });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sqlText] = executedSqlTexts();
    expect(sqlText).toContain('app.current_user_public_id');
    expect(sqlText).toContain('app.current_organization_public_id');
  });

  it('sets only the organization GUC for an organization-only (API-key) scope', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({
      organizationPublicId: 'org_x',
    });

    await withAppDatabaseContext({ scope, callback: async () => undefined });

    const [sqlText] = executedSqlTexts();
    expect(sqlText).toContain('app.current_organization_public_id');
    expect(sqlText).not.toContain('app.current_user_public_id');
  });

  it('sets only the user GUC for a user-only scope', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({ userPublicId: 'usr_a' });

    await withAppDatabaseContext({ scope, callback: async () => undefined });

    const [sqlText] = executedSqlTexts();
    expect(sqlText).toContain('app.current_user_public_id');
    expect(sqlText).not.toContain('app.current_organization_public_id');
  });

  it('never emits any GUC key beyond the two identity keys (bypass ceiling)', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({
      userPublicId: 'usr_a',
      organizationPublicId: 'org_x',
    });

    await withAppDatabaseContext({
      scope,
      callback: async (handle) => {
        // Only the wrapper's own set_config is inspected — the callback issues none.
        void handle;
      },
    });

    for (const sqlText of executedSqlTexts()) {
      expect(sqlText).not.toMatch(
        /global_admin|global_retention_cleanup|session_retention_cleanup|audit_outbox_drain|system_audit_insert/,
      );
    }
  });

  it('does not lift statement/lock timeouts outside worker runtime (HTTP caps stay)', async () => {
    delete process.env.CLINOZY_BE_RUNTIME;
    const scope = PRINCIPAL_SCOPE.REQUEST({
      organizationPublicId: 'org_x',
    });

    await withAppDatabaseContext({ scope, callback: async () => undefined });

    for (const sqlText of executedSqlTexts()) {
      expect(sqlText).not.toMatch(/statement_timeout|lock_timeout/);
    }
  });

  it('lifts statement/lock timeouts to the worker budget in worker runtime (job scopes)', async () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    try {
      const scope = PRINCIPAL_SCOPE.JOB({ organizationPublicId: 'org_x' });
      await withAppDatabaseContext({ scope, callback: async () => undefined });
      const combined = executedSqlTexts().join(' ');
      expect(combined).toMatch(/statement_timeout/);
      expect(combined).toMatch(/lock_timeout/);
    } finally {
      delete process.env.CLINOZY_BE_RUNTIME;
    }
  });

  it('pins ALS so getRequestDatabase resolves to the same handle inside the callback', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({
      organizationPublicId: 'org_x',
    });

    await withAppDatabaseContext({
      scope,
      callback: async (databaseHandle) => {
        expect(getRequestDatabase()).toBe(databaseHandle);
      },
    });
  });

  it('reuses an already-pinned organization transaction and layers the user GUC onto it', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({
      userPublicId: 'usr_a',
      organizationPublicId: 'org_x',
    });

    const outerScope = PRINCIPAL_SCOPE.REQUEST({
      organizationPublicId: 'org_x',
    });
    await withAppDatabaseContext({
      scope: outerScope,
      callback: async (outerHandle) => {
        mockExecute.mockClear();
        expect(getActiveOrganizationRlsCheckoutCount()).toBe(1);

        await withAppDatabaseContext({
          scope,
          callback: async (innerHandle) => {
            expect(innerHandle).toBe(outerHandle);
            // no second checkout — the pinned transaction is shared
            expect(getActiveOrganizationRlsCheckoutCount()).toBe(1);
          },
        });

        // two extra statements: layering app.current_user_public_id onto the outer handle, and
        // restoring the outer identity when the nested unit ends
        const sqlTexts = executedSqlTexts();
        expect(sqlTexts).toHaveLength(2);
        expect(sqlTexts[0]).toContain('app.current_user_public_id');
        expect(sqlTexts[0]).toContain('usr_a');
        expect(sqlTexts[1]).toContain('app.current_user_public_id');
        expect(sqlTexts[1]).not.toContain('usr_a');
      },
    });
  });

  it('user-only scopes reuse ANY pinned handle and layer only the user GUC (FK atomicity)', async () => {
    const organizationScope = PRINCIPAL_SCOPE.REQUEST({
      organizationPublicId: 'org_x',
    });
    const userOnly = PRINCIPAL_SCOPE.VERIFIED({
      userPublicId: 'usr_a',
    });

    await withAppDatabaseContext({
      scope: organizationScope,
      callback: async (outerHandle) => {
        mockExecute.mockClear();
        await withAppDatabaseContext({
          scope: userOnly,
          callback: async (innerHandle) => {
            // Same transaction handle — no second pool checkout, atomic with the outer trx.
            expect(innerHandle).toBe(outerHandle);
          },
        });
        // Layer, then restore — both touch only the user GUC.
        const sqlTexts = executedSqlTexts();
        expect(sqlTexts).toHaveLength(2);
        for (const sqlText of sqlTexts) {
          expect(sqlText).toContain('app.current_user_public_id');
          // The pinned session's organization GUC is never rewritten by a user-only scope.
          expect(sqlText).not.toContain('app.current_organization_public_id');
        }
      },
    });
  });

  it('does not re-arm the unchanged original user in nested principal scopes', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({ userPublicId: 'usr_a', organizationPublicId: 'org_x' });
    await withAppDatabaseContext({
      scope,
      callback: async (outerHandle) => {
        await withAppDatabaseContext({
          scope,
          callback: async (innerHandle) => {
            expect(innerHandle).toBe(outerHandle);
          },
        });
        await withAppDatabaseContext({
          scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: 'usr_a' }),
          callback: async () => undefined,
        });
      },
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('always re-arms identities after any different user has been requested', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({ userPublicId: 'usr_a', organizationPublicId: 'org_x' });
    await withAppDatabaseContext({
      scope,
      callback: async () => {
        await withAppDatabaseContext({
          scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: 'usr_b' }),
          callback: async () => undefined,
        });
        await withAppDatabaseContext({ scope, callback: async () => undefined });
        await withAppDatabaseContext({ scope, callback: async () => undefined });
      },
    });
    // Arm usr_a; layer usr_b + restore; then usr_a is layered (+ restored) each time — the mock
    // never reports the current value, so no layering is skipped.
    expect(mockExecute).toHaveBeenCalledTimes(7);
    expect(executedSqlTexts()[1]).toContain('usr_b');
    expect(executedSqlTexts()[3]).toContain('usr_a');
    expect(executedSqlTexts()[5]).toContain('usr_a');
  });

  it('invalidates original-user reuse before a concurrent identity write completes', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({ userPublicId: 'usr_a', organizationPublicId: 'org_x' });
    await withAppDatabaseContext({
      scope,
      callback: async () => {
        let release!: () => void;
        const pending = new Promise<void>((resolve) => {
          release = resolve;
        });
        mockExecute.mockImplementationOnce(() => pending);
        const other = withAppDatabaseContext({
          scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: 'usr_b' }),
          callback: async () => undefined,
        });
        await withAppDatabaseContext({ scope, callback: async () => undefined });
        release();
        await other;
      },
    });
    // Arm; usr_b's pending layer; usr_a re-layered + restored; usr_b's restore.
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('does not reuse original-user knowledge after a failed identity write', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({ userPublicId: 'usr_a', organizationPublicId: 'org_x' });
    await withAppDatabaseContext({
      scope,
      callback: async () => {
        mockExecute.mockRejectedValueOnce(new Error('identity write failed'));
        await expect(
          withAppDatabaseContext({
            scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: 'usr_b' }),
            callback: async () => undefined,
          }),
        ).rejects.toThrow('identity write failed');
        await withAppDatabaseContext({ scope, callback: async () => undefined });
      },
    });
    // Arm; the failed usr_b layer (nothing to restore); usr_a re-layered + restored.
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('arms a new transaction even if a previous callback failed on the same mock handle', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({ userPublicId: 'usr_a', organizationPublicId: 'org_x' });
    await expect(
      withAppDatabaseContext({
        scope,
        callback: async () => {
          throw new Error('rollback');
        },
      }),
    ).rejects.toThrow('rollback');
    await withAppDatabaseContext({ scope, callback: async () => undefined });
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('an organization-bearing scope for a DIFFERENT organization opens its own transaction (second checkout)', async () => {
    const organizationScope = PRINCIPAL_SCOPE.REQUEST({
      organizationPublicId: 'org_x',
    });
    const otherOrg = PRINCIPAL_SCOPE.REQUEST({
      organizationPublicId: 'org_y',
    });

    await withAppDatabaseContext({
      scope: organizationScope,
      callback: async () => {
        expect(getActiveOrganizationRlsCheckoutCount()).toBe(1);
        await withAppDatabaseContext({
          scope: otherOrg,
          callback: async () => {
            // Cross-organization nesting must NOT reuse — a fresh transaction takes a second checkout.
            expect(getActiveOrganizationRlsCheckoutCount()).toBe(2);
          },
        });
        expect(getActiveOrganizationRlsCheckoutCount()).toBe(1);
      },
    });
  });

  it('counts one organization checkout for a fresh organization-bearing scope and releases it', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({
      organizationPublicId: 'org_x',
    });

    await withAppDatabaseContext({
      scope,
      callback: async () => {
        expect(getActiveOrganizationRlsCheckoutCount()).toBe(1);
      },
    });
    expect(getActiveOrganizationRlsCheckoutCount()).toBe(0);
  });

  it('propagates callback errors (transaction rollback path) and still releases the checkout', async () => {
    const scope = PRINCIPAL_SCOPE.REQUEST({
      organizationPublicId: 'org_x',
    });

    await expect(
      withAppDatabaseContext({
        scope,
        callback: async () => {
          throw new Error('unit-of-work failed');
        },
      }),
    ).rejects.toThrow('unit-of-work failed');
    expect(getActiveOrganizationRlsCheckoutCount()).toBe(0);
  });
});

describe('createPrincipalDatabaseScope', () => {
  it('throws ConfigurationError for an empty scope', () => {
    expect(() => PRINCIPAL_SCOPE.REQUEST({})).toThrow(ConfigurationError);
  });
});
