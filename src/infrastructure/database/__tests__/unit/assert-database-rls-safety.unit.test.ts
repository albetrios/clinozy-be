import {
  DATABASE_MAINTENANCE_ROLE,
  LOCAL_DATABASE_NAME,
} from '@/shared/constants/project-identity.constants.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.fn();
const maintenanceExecuteMock = vi.fn();
const getEnvMock = vi.fn();

vi.mock('@/infrastructure/database/connection.js', () => ({
  database: {
    execute: (...arguments_: unknown[]) => executeMock(...arguments_),
  },
  getMaintenanceDatabase: () => ({
    execute: (...arguments_: unknown[]) => maintenanceExecuteMock(...arguments_),
  }),
}));

vi.mock('@/shared/config/env.config.js', () => ({
  env: new Proxy(
    {},
    {
      get(_target, property) {
        return getEnvMock()[property as string];
      },
    },
  ),
  getEnv: () => getEnvMock(),
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('assertDatabaseRoleRlsSafety', () => {
  beforeEach(() => {
    executeMock.mockReset();
    getEnvMock.mockReset();
    vi.resetModules();
    getEnvMock.mockReturnValue({
      LOG_LEVEL: 'silent',
      NODE_ENV: 'development',
    });
  });

  it('resolves and logs info when the session role is non-superuser without BYPASSRLS', async () => {
    executeMock.mockResolvedValue([
      { rolname: 'clinozy_be_app_login', rolsuper: false, rolbypassrls: false },
    ]);
    getEnvMock.mockReturnValue({ DATABASE_RLS_SAFETY_ENFORCED: true });

    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    const { assertDatabaseRoleRlsSafety } = await import(
      '@/infrastructure/database/safety/assert-database-rls-safety.js'
    );

    await expect(assertDatabaseRoleRlsSafety()).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        rolname: 'clinozy_be_app_login',
        rolsuper: false,
        rolbypassrls: false,
      }),
      'database.rls_safety.ok',
    );
  });

  it('throws when DATABASE_RLS_SAFETY_ENFORCED and the session role is a superuser', async () => {
    executeMock.mockResolvedValue([{ rolname: 'postgres', rolsuper: true, rolbypassrls: false }]);
    getEnvMock.mockReturnValue({ DATABASE_RLS_SAFETY_ENFORCED: true });

    const { assertDatabaseRoleRlsSafety } = await import(
      '@/infrastructure/database/safety/assert-database-rls-safety.js'
    );

    await expect(assertDatabaseRoleRlsSafety()).rejects.toThrow(
      /database\.rls_safety\.unsafe_role/i,
    );
  });

  it('throws when DATABASE_RLS_SAFETY_ENFORCED and the session role has BYPASSRLS', async () => {
    executeMock.mockResolvedValue([
      { rolname: 'replication_role', rolsuper: false, rolbypassrls: true },
    ]);
    getEnvMock.mockReturnValue({ DATABASE_RLS_SAFETY_ENFORCED: true });

    const { assertDatabaseRoleRlsSafety } = await import(
      '@/infrastructure/database/safety/assert-database-rls-safety.js'
    );

    await expect(assertDatabaseRoleRlsSafety()).rejects.toThrow(/rolbypassrls=true/);
  });

  it('warns (without throwing) for superuser when DATABASE_RLS_SAFETY_ENFORCED is false', async () => {
    executeMock.mockResolvedValue([{ rolname: 'postgres', rolsuper: true, rolbypassrls: false }]);
    getEnvMock.mockReturnValue({ DATABASE_RLS_SAFETY_ENFORCED: false });

    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    const { assertDatabaseRoleRlsSafety } = await import(
      '@/infrastructure/database/safety/assert-database-rls-safety.js'
    );

    await expect(assertDatabaseRoleRlsSafety()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ rolname: 'postgres', rolsuper: true }),
      expect.stringContaining('database.rls_safety.unsafe_role_local'),
    );
  });

  it('warns (without throwing) for BYPASSRLS when the flag is unset (relaxed)', async () => {
    executeMock.mockResolvedValue([
      { rolname: LOCAL_DATABASE_NAME, rolsuper: false, rolbypassrls: true },
    ]);
    getEnvMock.mockReturnValue({ NODE_ENV: 'development' });

    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    const { assertDatabaseRoleRlsSafety } = await import(
      '@/infrastructure/database/safety/assert-database-rls-safety.js'
    );

    await expect(assertDatabaseRoleRlsSafety()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('throws when pg_roles returns no row for session_user', async () => {
    executeMock.mockResolvedValue([]);
    getEnvMock.mockReturnValue({ NODE_ENV: 'development' });

    const { assertDatabaseRoleRlsSafety } = await import(
      '@/infrastructure/database/safety/assert-database-rls-safety.js'
    );

    await expect(assertDatabaseRoleRlsSafety()).rejects.toThrow(
      /database\.rls_safety\.session_role_not_found/,
    );
  });

  it('throws when DATABASE_URL acts as the maintenance role (the bypass arms would open)', async () => {
    executeMock.mockResolvedValue([
      {
        rolname: DATABASE_MAINTENANCE_ROLE,
        rolsuper: false,
        rolbypassrls: false,
        acting_role: DATABASE_MAINTENANCE_ROLE,
      },
    ]);
    getEnvMock.mockReturnValue({ DATABASE_RLS_SAFETY_ENFORCED: true });

    const { assertDatabaseRoleRlsSafety } = await import(
      '@/infrastructure/database/safety/assert-database-rls-safety.js'
    );

    await expect(assertDatabaseRoleRlsSafety()).rejects.toThrow(
      /database\.rls_safety\.runtime_is_maintenance_role/,
    );
  });
});

describe('assertMaintenanceDatabaseRoleRlsSafety', () => {
  beforeEach(() => {
    maintenanceExecuteMock.mockReset();
    getEnvMock.mockReset();
    vi.resetModules();
  });

  async function loadAssertion() {
    const { assertMaintenanceDatabaseRoleRlsSafety } = await import(
      '@/infrastructure/database/safety/assert-database-rls-safety.js'
    );
    return assertMaintenanceDatabaseRoleRlsSafety;
  }

  it('resolves when the pool acts as the RLS-subject maintenance role', async () => {
    maintenanceExecuteMock.mockResolvedValue([
      {
        rolname: DATABASE_MAINTENANCE_ROLE,
        rolsuper: false,
        rolbypassrls: false,
        acting_role: DATABASE_MAINTENANCE_ROLE,
      },
    ]);
    getEnvMock.mockReturnValue({ DATABASE_RLS_SAFETY_ENFORCED: true });

    await expect((await loadAssertion())()).resolves.toBeUndefined();
  });

  it('throws when the pool acts as another role — every maintenance context would match no rows', async () => {
    maintenanceExecuteMock.mockResolvedValue([
      { rolname: 'app_login', rolsuper: false, rolbypassrls: false, acting_role: 'app_login' },
    ]);
    getEnvMock.mockReturnValue({ DATABASE_RLS_SAFETY_ENFORCED: true });

    await expect((await loadAssertion())()).rejects.toThrow(
      /database\.rls_safety\.maintenance_wrong_role/,
    );
  });

  it('throws when the maintenance login is exempt from RLS', async () => {
    maintenanceExecuteMock.mockResolvedValue([
      { rolname: 'postgres', rolsuper: true, rolbypassrls: false, acting_role: 'postgres' },
    ]);
    getEnvMock.mockReturnValue({ DATABASE_RLS_SAFETY_ENFORCED: true });

    await expect((await loadAssertion())()).rejects.toThrow(
      /database\.rls_safety\.maintenance_unsafe_role/,
    );
  });

  it('warns (without throwing) on a superuser maintenance pool when enforcement is off', async () => {
    maintenanceExecuteMock.mockResolvedValue([
      { rolname: 'postgres', rolsuper: true, rolbypassrls: false, acting_role: 'postgres' },
    ]);
    getEnvMock.mockReturnValue({ DATABASE_RLS_SAFETY_ENFORCED: false });

    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    await expect((await loadAssertion())()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ rolname: 'postgres', acting_role: 'postgres' }),
      expect.stringContaining('database.rls_safety.maintenance_unsafe_role_local'),
    );
  });
});
