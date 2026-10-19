/**
 * Inspect and replay jobs from BullMQ dead-letter queues (`<source-queue>-dlq`).
 *
 * Usage:
 *   pnpm tool:dlq-replay -- --list
 *   pnpm tool:dlq-replay -- --list notification-dlq
 *   pnpm tool:dlq-replay -- --replay notification-dlq --job-id dlq-notification-ntf_x-attempt-3 --actor-user-public-id usr_xxx [--dry-run]
 *   pnpm tool:dlq-replay -- --replay-all webhook-delivery-dlq --actor-user-public-id usr_xxx [--limit 10] [--dry-run]
 */
import '@/shared/config/load-env-files.js';
import { closeDatabase } from '@/infrastructure/database/connection.js';
import { connectRedis, closeRedis } from '@/infrastructure/cache/redis.client.js';
import { closeDeadLetterQueues } from '@/infrastructure/queue/dlq/dead-letter.js';
import {
  listDeadLetterJobIds,
  listDeadLetterJobs,
  replayDeadLetterJob,
  resolveDeadLetterQueueNames,
} from '@/infrastructure/queue/dlq/dlq-replay.util.js';
import { closeNotificationQueue } from '@/domains/notify/sub-domains/notification/queues/notification.queue.js';
import { closeStripeWebhookQueue } from '@/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook.queue.js';
import { closeWebhookDeliveryQueue } from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import { parseCommandLine } from '@tooling/setup/common/script.js';

function parseArguments(): {
  listOnly: boolean;
  deadLetterQueueName: string | undefined;
  replayJobId: string | undefined;
  replayAll: boolean;
  dryRun: boolean;
  limit: number;
  actorUserPublicId: string | undefined;
} {
  // `--list [queue-dlq]` and `--replay-all [queue-dlq]` take the queue as the one positional.
  const { values, positionals } = parseCommandLine({
    args: process.argv.slice(2),
    options: {
      list: { type: 'boolean' },
      replay: { type: 'string' },
      'replay-all': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      limit: { type: 'string' },
      'actor-user-public-id': { type: 'string' },
      'job-id': { type: 'string' },
    },
    maxPositionals: 1,
  });
  const replayAll = values['replay-all'] === true;
  const limit = Number.parseInt(values.limit ?? '50', 10);

  return {
    listOnly: values.list === true && values.replay === undefined && !replayAll,
    deadLetterQueueName: values.replay ?? positionals[0],
    replayJobId: values['job-id'],
    replayAll,
    dryRun: values['dry-run'] === true,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
    actorUserPublicId: values['actor-user-public-id'],
  };
}

async function main(): Promise<void> {
  const parsed = parseArguments();

  if (!(parsed.listOnly || parsed.replayJobId || parsed.replayAll)) {
    console.error(
      'Usage: pnpm tool:dlq-replay -- --list [queue-dlq] | --replay <queue-dlq> --job-id <id> --actor-user-public-id <usr> [--dry-run] | --replay-all <queue-dlq> --actor-user-public-id <usr> [--limit N] [--dry-run]',
    );
    process.exitCode = 1;
    return;
  }

  await connectRedis();

  const queueNames = resolveDeadLetterQueueNames(parsed.deadLetterQueueName);

  if (parsed.listOnly) {
    for (const name of queueNames) {
      await listDeadLetterJobs(name);
    }
    return;
  }

  if (parsed.replayAll) {
    for (const name of queueNames) {
      // Read through the pooled, prefixed DLQ client: the bare Queue this used opened the default
      // key namespace, found nothing, and replayed nothing.
      const jobIds = await listDeadLetterJobIds({ deadLetterQueueName: name, limit: parsed.limit });
      for (const jobId of jobIds) {
        const result = await replayDeadLetterJob(
          omitUndefined({
            deadLetterQueueName: name,
            deadLetterJobId: jobId,
            dryRun: parsed.dryRun,
            actorUserPublicId: parsed.actorUserPublicId,
          }),
        );
        if (result.status === 'replayed') {
          console.log(
            parsed.dryRun
              ? `[dry-run] Would replay ${jobId} → ${result.originalQueue}`
              : `Replayed ${jobId} → ${result.originalQueue}`,
          );
        }
      }
    }
    return;
  }

  if (parsed.replayJobId && queueNames.length === 1) {
    const result = await replayDeadLetterJob(
      omitUndefined({
        deadLetterQueueName: queueNames[0]!,
        deadLetterJobId: parsed.replayJobId,
        dryRun: parsed.dryRun,
        actorUserPublicId: parsed.actorUserPublicId,
      }),
    );
    if (result.status === 'not_found') {
      console.error(`Job not found: ${parsed.replayJobId} in ${queueNames[0]}`);
      process.exitCode = 1;
      return;
    }
    if (result.status === 'payload_not_reconstructable') {
      console.error('Cannot reconstruct replay payload. Re-enqueue manually from Postgres.');
      process.exitCode = 1;
      return;
    }
    console.log(
      parsed.dryRun
        ? `[dry-run] Would replay → ${result.originalQueue}`
        : `Replayed ${parsed.replayJobId} → ${result.originalQueue}`,
    );
    return;
  }

  console.error('--replay requires --job-id, --actor-user-public-id, and a single DLQ queue name');
  process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Replays go through each source queue's own producer, and the DLQ through pooled clients —
    // close them all or their Redis connections keep the process alive.
    await Promise.allSettled([
      closeDeadLetterQueues(),
      closeWebhookDeliveryQueue(),
      closeNotificationQueue(),
      closeStripeWebhookQueue(),
    ]);
    await closeRedis();
    await closeDatabase();
  });
