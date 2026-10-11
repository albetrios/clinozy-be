import { describe, expect, it, vi } from 'vitest';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';

const maintenancePoolHandle = { tag: 'maintenance-pool' };

vi.mock('@/infrastructure/database/connection.js', () => ({
  database: { tag: 'shared-pool' },
  getMaintenanceDatabase: () => maintenancePoolHandle,
}));

describe('maintenance context pool selection', () => {
  it('non-transactional maintenance kinds hand the callback the maintenance pool handle', async () => {
    // Outside worker runtime the system_table_worker kind passes the pool straight
    // through — every maintenance kind runs on getMaintenanceDatabase(), the dedicated
    // clinozy_be_maintenance connection the bypass policy arms are bound to.
    await withMaintenanceDatabaseContext({
      scope: MAINTENANCE_SCOPE.SYSTEM_TABLE_WORKER,
      callback: async (handle) => {
        expect(handle).toBe(maintenancePoolHandle);
      },
    });
  });
});
