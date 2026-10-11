import {
  findDeadLetterJobsForAutoRetry,
  markDeadLetterJobAutoRetryResolved,
} from '@/infrastructure/queue/dlq/dead-letter.repository.js';
import { isDeadLetterSourceQueueCircuitClosed } from '@/infrastructure/queue/dlq/dlq-auto-retry-circuit.util.js';
import {
  autoReplayDeadLetterFromLedger,
  DLQ_REPLAY_SOURCE_QUEUE_NAMES,
} from '@/infrastructure/queue/dlq/dlq-replay.util.js';
import { env } from '@/shared/config/env.config.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';

/**
 * Outcome counters for one DLQ auto-retry sweeper pass.
 *
 * @remarks
 * - **Algorithm:** populated by {@link runDlqAutoRetryJob}; every scanned row lands in exactly one
 *   of `replayedCount`, `replayLimitCount`, `notReplayableCount` or `failedCount`.
 * - **Failure modes:** none from the type itself.
 * - **Side effects:** none from this type alone.
 * - **Notes:** `circuitOpenQueueCount` counts source queues left out of the scan because their
 *   outbound circuit is not closed; their rows wait for a later tick.
 */
export type DlqAutoRetryJobResult = {
  scannedCount: number;
  replayedCount: number;
  replayLimitCount: number;
  notReplayableCount: number;
  failedCount: number;
  circuitOpenQueueCount: number;
};

/**
 * Scans `audit.dead_letter_jobs` and replays each waiting row at most once, through its source
 * queue, once the cooldown has passed and the queue's outbound circuit is closed.
 *
 * @remarks
 * - **Algorithm:** keep the replayable source queues whose circuit is CLOSED (a queue that cannot
 *   replay yet must not hold the head of the scan), read their unhandled rows older than the
 *   cooldown, oldest first, and per row: a lineage at `DLQ_AUTO_RETRY_MAX_COUNT` replays is
 *   marked handled without a replay; otherwise it is replayed (`dlqReplayAttempt` = its
 *   `replay_depth` + 1) and marked handled; a payload that cannot be rebuilt is marked handled.
 * - **Failure modes:** a replay that throws leaves the row waiting for the next tick (warn log);
 *   Postgres scan errors propagate to BullMQ.
 * - **Side effects:** BullMQ re-enqueue, DLQ mirror removal, audit log, ledger marker writes.
 * - **Notes:** the replay lineage lives in the ledger (`replay_depth`), never in a Redis counter
 *   keyed by the row's bigserial. A replay that fails for good writes a new row one level
 *   deeper, which waits its own cooldown. No-op when `DLQ_AUTO_RETRY_ENABLED` is false; bounded
 *   by `DLQ_AUTO_RETRY_BATCH_SIZE`.
 */
export async function runDlqAutoRetryJob(): Promise<DlqAutoRetryJobResult> {
  if (!env.DLQ_AUTO_RETRY_ENABLED) {
    return {
      scannedCount: 0,
      replayedCount: 0,
      replayLimitCount: 0,
      notReplayableCount: 0,
      failedCount: 0,
      circuitOpenQueueCount: 0,
    };
  }

  return withMaintenanceDatabaseContext({
    scope: MAINTENANCE_SCOPE.SYSTEM_TABLE_WORKER,
    callback: () => runDlqAutoRetryJobInner(),
  });
}

async function listSourceQueuesWithClosedCircuit(): Promise<string[]> {
  const circuitClosedByQueue = await Promise.all(
    DLQ_REPLAY_SOURCE_QUEUE_NAMES.map(async (sourceQueue) => ({
      sourceQueue,
      closed: await isDeadLetterSourceQueueCircuitClosed(sourceQueue),
    })),
  );
  return circuitClosedByQueue.filter((entry) => entry.closed).map((entry) => entry.sourceQueue);
}

async function runDlqAutoRetryJobInner(): Promise<DlqAutoRetryJobResult> {
  const cooldownMs = env.DLQ_AUTO_RETRY_COOLDOWN_MINUTES * 60_000;
  const replayableSourceQueues = await listSourceQueuesWithClosedCircuit();

  const ledgerRows = await findDeadLetterJobsForAutoRetry({
    sourceQueues: replayableSourceQueues,
    failedBefore: new Date(Date.now() - cooldownMs),
    limit: env.DLQ_AUTO_RETRY_BATCH_SIZE,
  });

  const result: DlqAutoRetryJobResult = {
    scannedCount: ledgerRows.length,
    replayedCount: 0,
    replayLimitCount: 0,
    notReplayableCount: 0,
    failedCount: 0,
    circuitOpenQueueCount: DLQ_REPLAY_SOURCE_QUEUE_NAMES.length - replayableSourceQueues.length,
  };

  for (const ledgerRow of ledgerRows) {
    if (ledgerRow.replay_depth >= env.DLQ_AUTO_RETRY_MAX_COUNT) {
      // The lineage has been replayed as often as allowed: leave this failure to an operator.
      await markDeadLetterJobAutoRetryResolved(ledgerRow.id);
      result.replayLimitCount += 1;
      continue;
    }

    try {
      const replayResult = await autoReplayDeadLetterFromLedger({ ledgerRow });
      await markDeadLetterJobAutoRetryResolved(ledgerRow.id);
      if (replayResult.status === 'payload_not_reconstructable') {
        result.notReplayableCount += 1;
      } else {
        result.replayedCount += 1;
      }
    } catch (error) {
      result.failedCount += 1;
      logger.warn({ error, deadLetterJobId: ledgerRow.id }, 'dlq-auto-retry.replay.failed');
    }
  }

  if (result.scannedCount > 0 || result.circuitOpenQueueCount > 0) {
    logger.info(result, 'dlq-auto-retry.completed');
  }

  return result;
}
