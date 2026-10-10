import { Worker } from 'bullmq';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import {
  getRetentionWorkerOptions,
  RETENTION_WORKER_CONCURRENCY,
} from '@/infrastructure/queue/worker-runtime/worker-options.js';
import { buildWorkerHandle } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  runMembershipInvitationExpiryJob,
  type MembershipInvitationExpiryService,
} from './membership-invitation-expiry.processor.js';
import { MEMBERSHIP_INVITATION_EXPIRY_QUEUE_NAME } from './membership-invitation-expiry.constants.js';

/**
 * Constructs the BullMQ worker that ends invited memberships whose invitation expired more than
 * 7 days ago (launch D84 (4), ROUTE #175).
 *
 * @remarks
 * - **Algorithm:** each scheduled tick runs {@link runMembershipInvitationExpiryJob}, which scans
 *   for due memberships and calls `endExpiredInvitation` for each.
 * - **Failure modes:** per-membership failures are counted inside the job; scan errors propagate
 *   to BullMQ retry / DLQ; `stalled` events are warn-logged.
 * - **Side effects:** revokes invitations, ends memberships and syncs seat counts.
 * - **Notes:** retention concurrency; the daily schedule is registered in
 *   `infrastructure/queue/scheduler.ts`.
 */
export function createMembershipInvitationExpiryWorker(
  service: MembershipInvitationExpiryService,
): WorkerHandle {
  const worker = new Worker(
    MEMBERSHIP_INVITATION_EXPIRY_QUEUE_NAME,
    async () => runMembershipInvitationExpiryJob(service),
    {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      concurrency: RETENTION_WORKER_CONCURRENCY,
      ...getRetentionWorkerOptions(),
    },
  );

  worker.on('stalled', (jobId) => {
    logger.warn(
      { jobId, queue: MEMBERSHIP_INVITATION_EXPIRY_QUEUE_NAME },
      'membership-invitation-expiry.stalled',
    );
  });

  return buildWorkerHandle(worker, MEMBERSHIP_INVITATION_EXPIRY_QUEUE_NAME);
}
