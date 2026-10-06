import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { dead_letter_jobs } from '@/infrastructure/queue/dlq/dead-letter.schema.js';
import { runDlqAutoRetryJob } from '@/infrastructure/queue/dlq/dlq-auto-retry.processor.js';
import { closeDeadLetterQueues } from '@/infrastructure/queue/dlq/dead-letter.js';
import {
  closeWebhookDeliveryQueue,
  getWebhookDeliveryQueue,
  WEBHOOK_DELIVERY_JOB_ATTEMPTS,
  WEBHOOK_DELIVERY_QUEUE_NAME,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';

const DELIVERY_ATTEMPT_PUBLIC_ID = 'wda_dlqautoretry000000001';
const ORGANIZATION_PUBLIC_ID = 'org_dlqautoretry000000001';

async function seedLedgerRow(options: { replayDepth: number }) {
  const [row] = await getOperatorDatabase()
    .insert(dead_letter_jobs)
    .values({
      source_queue: WEBHOOK_DELIVERY_QUEUE_NAME,
      dead_letter_queue: `${WEBHOOK_DELIVERY_QUEUE_NAME}-dlq`,
      job_id: DELIVERY_ATTEMPT_PUBLIC_ID,
      job_name: 'deliver-webhook',
      payload_summary: {
        delivery_attempt_public_id: DELIVERY_ATTEMPT_PUBLIC_ID,
        organization_public_id: ORGANIZATION_PUBLIC_ID,
      },
      failed_reason: 'Webhook delivery failed with HTTP 500',
      attempts_made: WEBHOOK_DELIVERY_JOB_ATTEMPTS,
      max_attempts: WEBHOOK_DELIVERY_JOB_ATTEMPTS,
      // Past the default 30-minute cooldown.
      failed_at: new Date(Date.now() - 2 * 60 * 60_000),
      replay_depth: options.replayDepth,
    })
    .returning({ id: dead_letter_jobs.id });
  return row!;
}

async function readResolvedAt(ledgerRowId: number) {
  const [row] = await getOperatorDatabase()
    .select({ resolvedAt: dead_letter_jobs.auto_retry_resolved_at })
    .from(dead_letter_jobs)
    .where(eq(dead_letter_jobs.id, ledgerRowId));
  return row?.resolvedAt ?? null;
}

async function waitingReplays() {
  const jobs = await getWebhookDeliveryQueue().getJobs(['waiting', 'delayed'], 0, 50);
  return jobs.filter(
    (job) =>
      (job.data as { deliveryAttemptPublicId?: string }).deliveryAttemptPublicId ===
      DELIVERY_ATTEMPT_PUBLIC_ID,
  );
}

/**
 * The sweeper end to end against Postgres and Redis: the replay lineage lives in the ledger row
 * (no Redis counter), each row is replayed at most once, and the replay goes through the source
 * queue's own producer so its attempts and retention apply.
 */
describe('Integration: DLQ auto-retry sweeper', () => {
  beforeEach(async () => {
    await cleanupDatabase();
    for (const job of await waitingReplays()) {
      await job.remove();
    }
  });

  afterAll(async () => {
    for (const job of await waitingReplays()) {
      await job.remove();
    }
    await closeWebhookDeliveryQueue();
    await closeDeadLetterQueues();
  });

  it('replays a row once, one level deeper, with the source queue job options', async () => {
    const ledgerRow = await seedLedgerRow({ replayDepth: 0 });

    const firstPass = await runDlqAutoRetryJob();
    const secondPass = await runDlqAutoRetryJob();

    expect(firstPass.replayedCount).toBe(1);
    // Handled rows leave the scan: a second tick does not replay it again.
    expect(secondPass.scannedCount).toBe(0);
    expect(await readResolvedAt(ledgerRow.id)).toBeInstanceOf(Date);

    const replays = await waitingReplays();
    expect(replays).toHaveLength(1);
    expect(replays[0]!.data).toMatchObject({
      deliveryAttemptPublicId: DELIVERY_ATTEMPT_PUBLIC_ID,
      organizationPublicId: ORGANIZATION_PUBLIC_ID,
      replayFromDlq: true,
      dlqReplayAttempt: 1,
    });
    // The queue's own job options — a bare Queue gave the replay a single attempt.
    expect(replays[0]!.opts.attempts).toBe(WEBHOOK_DELIVERY_JOB_ATTEMPTS);
    // A fresh job id: re-using the original would collide with the retained failed job.
    expect(replays[0]!.id).not.toBe(DELIVERY_ATTEMPT_PUBLIC_ID);
  });

  it('stops a lineage at the replay-depth limit and marks the row handled', async () => {
    const ledgerRow = await seedLedgerRow({ replayDepth: 3 });

    const result = await runDlqAutoRetryJob();

    expect(result.replayLimitCount).toBe(1);
    expect(await waitingReplays()).toHaveLength(0);
    expect(await readResolvedAt(ledgerRow.id)).toBeInstanceOf(Date);
  });
});
