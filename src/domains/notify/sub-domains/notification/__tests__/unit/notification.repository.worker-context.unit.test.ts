import { afterEach, describe, expect, it } from 'vitest';
import { runWithWorkerDatabaseContext } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { WorkerDatabaseContextError } from '@/infrastructure/database/contexts/database-context-runtime.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { createWorkerNotificationRepository } from '@/domains/notify/sub-domains/notification/notification.repository.js';

const handle = {} as WorkerDatabaseHandle;

describe('createWorkerNotificationRepository worker-context allowlist', () => {
  const originalRuntime = process.env.CLINOZY_BE_RUNTIME;

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.CLINOZY_BE_RUNTIME;
    } else {
      process.env.CLINOZY_BE_RUNTIME = originalRuntime;
    }
  });

  for (const kind of ['organization', 'user'] as const) {
    it(`accepts the ${kind} worker context`, async () => {
      process.env.CLINOZY_BE_RUNTIME = 'worker';
      await runWithWorkerDatabaseContext({ kind }, async () => {
        expect(() => createWorkerNotificationRepository(handle)).not.toThrow();
      });
    });
  }

  it('rejects the global_admin context — the recipient public id travels in the job, so no cross-user lookup needs it', async () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    await runWithWorkerDatabaseContext({ kind: 'global_admin' }, async () => {
      expect(() => createWorkerNotificationRepository(handle)).toThrow(WorkerDatabaseContextError);
    });
  });

  it('rejects the removed global_retention_cleanup context (greenfield cleanup — retention uses a raw batch-delete, not this factory)', async () => {
    process.env.CLINOZY_BE_RUNTIME = 'worker';
    await runWithWorkerDatabaseContext({ kind: 'global_retention_cleanup' }, async () => {
      expect(() => createWorkerNotificationRepository(handle)).toThrow(WorkerDatabaseContextError);
    });
  });
});
