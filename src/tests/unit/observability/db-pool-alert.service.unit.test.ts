import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluatePoolExhaustionAndAlert,
  resetPoolExhaustionAlertStateForTests,
} from '@/infrastructure/observability/dlq-depth/db-pool-alert.service.js';
import {
  incrementOrganizationRlsCheckoutCount,
  resetOrganizationRlsCheckoutCountForTests,
} from '@/infrastructure/database/pool/organization-rls-checkout-counter.js';

const captureMessage = vi.fn();

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/infrastructure/observability/sentry/sentry.js', () => ({
  captureMessage: (...arguments_: unknown[]) => captureMessage(...arguments_),
}));

vi.mock(
  '@/infrastructure/database/contexts/database-context-runtime.js',
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
      ...actual,
      isWorkerRuntime: () => false,
    };
  },
);

vi.mock('@/infrastructure/queue/worker-runtime/worker-pool-demand-context.js', () => ({
  getWorkerPostgresPoolDemandContext: () => undefined,
}));

vi.mock('@/shared/config/env.config.js', () => ({
  env: {
    DATABASE_POOL_MAX: 10,
    DATABASE_POOL_ACTIVE_WARN_RATIO: 0.8,
    DATABASE_POOL_ACTIVE_CRITICAL_RATIO: 0.95,
    DATABASE_POOL_CLUSTER_WARN_RATIO: 0.8,
    DATABASE_POOL_CLUSTER_CRITICAL_RATIO: 0.95,
    DATABASE_POOL_ALERT_CONSECUTIVE_POLLS: 2,
  },
}));

describe('db-pool-alert.service', () => {
  beforeEach(() => {
    resetPoolExhaustionAlertStateForTests();
    resetOrganizationRlsCheckoutCountForTests();
    captureMessage.mockClear();
  });

  afterEach(() => {
    resetPoolExhaustionAlertStateForTests();
    resetOrganizationRlsCheckoutCountForTests();
  });

  it('emits critical alert after consecutive active checkout pressure polls', () => {
    for (let index = 0; index < 10; index += 1) {
      incrementOrganizationRlsCheckoutCount();
    }

    evaluatePoolExhaustionAndAlert({
      clusterActiveConnections: 0,
      allowedApplicationConnections: 100,
    });
    expect(captureMessage).not.toHaveBeenCalled();

    evaluatePoolExhaustionAndAlert({
      clusterActiveConnections: 0,
      allowedApplicationConnections: 100,
    });
    expect(captureMessage).toHaveBeenCalledWith({
      message: 'database.pool.exhaustion.critical',
      options: expect.objectContaining({ level: 'error' }),
    });
  });

  it("attaches this process's live pool counts to the alert", () => {
    for (let index = 0; index < 10; index += 1) {
      incrementOrganizationRlsCheckoutCount();
    }
    const poolStatistics = [
      { pool: 'primary' as const, maxConnections: 10, inUse: 10, idle: 0, waiting: 4 },
      { pool: 'maintenance' as const, maxConnections: 5, inUse: 1, idle: 2, waiting: 0 },
    ];

    for (let poll = 0; poll < 2; poll += 1) {
      evaluatePoolExhaustionAndAlert({
        clusterActiveConnections: 0,
        allowedApplicationConnections: 100,
        poolStatistics,
      });
    }

    expect(captureMessage).toHaveBeenCalledWith({
      message: 'database.pool.exhaustion.critical',
      options: expect.objectContaining({
        extra: expect.objectContaining({
          primaryPoolInUse: 10,
          primaryPoolIdle: 0,
          primaryPoolWaiting: 4,
          primaryPoolMax: 10,
          maintenancePoolInUse: 1,
          maintenancePoolWaiting: 0,
        }),
      }),
    });
  });

  it('resets consecutive poll counter when pressure drops', () => {
    incrementOrganizationRlsCheckoutCount();
    incrementOrganizationRlsCheckoutCount();
    incrementOrganizationRlsCheckoutCount();
    incrementOrganizationRlsCheckoutCount();
    incrementOrganizationRlsCheckoutCount();
    incrementOrganizationRlsCheckoutCount();
    incrementOrganizationRlsCheckoutCount();
    incrementOrganizationRlsCheckoutCount();

    evaluatePoolExhaustionAndAlert({
      clusterActiveConnections: 0,
      allowedApplicationConnections: 100,
    });

    resetOrganizationRlsCheckoutCountForTests();

    evaluatePoolExhaustionAndAlert({
      clusterActiveConnections: 0,
      allowedApplicationConnections: 100,
    });
    evaluatePoolExhaustionAndAlert({
      clusterActiveConnections: 0,
      allowedApplicationConnections: 100,
    });

    expect(captureMessage).not.toHaveBeenCalled();
  });
});
