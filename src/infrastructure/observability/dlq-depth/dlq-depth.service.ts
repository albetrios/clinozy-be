import {
  getDeadLetterQueueClient,
  listDeadLetterQueueNames,
} from '@/infrastructure/queue/dlq/dead-letter.js';
import { captureMessage } from '@/infrastructure/observability/sentry/sentry.js';
import { WORKER_QUEUE_NAMES } from '@/infrastructure/queue/queue-catalog.js';
import { env } from '@/shared/config/env.config.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * One-pass dead-letter queue depth snapshot returned by
 * {@link sampleDeadLetterQueueDepths} — `waiting + failed` counts per DLQ.
 *
 * @remarks
 * - **Algorithm:** the inner `depths` array preserves the order of
 *   `WORKER_QUEUE_NAMES` so consumers can join by index.
 * - **Failure modes:** queues that fail to connect raise inside the sampler and
 *   abort the call; partial results are not returned.
 * - **Side effects:** none from the type itself.
 * - **Notes:** consumed by the DLQ depth worker and `getTotalDeadLetterJobCount`.
 */
export interface DlqDepthSampleResult {
  readonly depths: ReadonlyArray<{
    readonly deadLetterQueueName: string;
    readonly waiting: number;
    readonly failed: number;
    readonly total: number;
  }>;
}

/**
 * Samples waiting + failed counts on every per-source DLQ and raises a Sentry
 * warning whenever a single queue crosses `DLQ_DEPTH_WARN_THRESHOLD`.
 *
 * @remarks
 * - **Algorithm:** maps `WORKER_QUEUE_NAMES` to `<source>-dlq`, reads
 *   `getJobCounts('waiting','failed')` on every queue **concurrently** through the pooled
 *   dead-letter clients ({@link getDeadLetterQueueClient}), and aggregates totals in list order.
 * - **Failure modes:** a Redis error on any queue rejects the whole sample (`Promise.all`);
 *   partial results are not returned. Nothing is closed here — the pooled clients live until
 *   `closeDeadLetterQueues()` at shutdown.
 * - **Side effects:** Sentry `captureMessage('queue.dlq.depth.high', ...)` and structured log
 *   when `total >= warnThreshold`; the first call opens one Redis connection per DLQ.
 * - **Notes:** driven by `createDlqDepthWorker`'s repeatable schedule and by every `/metrics`
 *   scrape and verbose `/readyz`. It used to open, query and close a fresh `Queue` per DLQ
 *   **sequentially** — on a hosted Redis with ~200 ms RTT that is 26 × (connect + script load +
 *   count + close) ≈ 30 s+, which tripped the platform edge timeout and turned every scrape
 *   into a 502 (sec-DLQ-scrape). One pass now costs a single round trip.
 */
export async function sampleDeadLetterQueueDepths(): Promise<DlqDepthSampleResult> {
  const warnThreshold = env.DLQ_DEPTH_WARN_THRESHOLD;
  const deadLetterQueueNames = listDeadLetterQueueNames(WORKER_QUEUE_NAMES);

  const depths = await Promise.all(
    deadLetterQueueNames.map(async (deadLetterQueueName) => {
      const counts = await getDeadLetterQueueClient(deadLetterQueueName).getJobCounts(
        'waiting',
        'failed',
      );
      const waiting = counts.waiting ?? 0;
      const failed = counts.failed ?? 0;
      const total = waiting + failed;

      if (total >= warnThreshold) {
        logger.warn(
          { deadLetterQueueName, waiting, failed, total, warnThreshold },
          'queue.dlq.depth.high',
        );
        captureMessage('queue.dlq.depth.high', {
          level: 'warning',
          extra: { deadLetterQueueName, waiting, failed, total, warnThreshold },
        });
      }

      return { deadLetterQueueName, waiting, failed, total };
    }),
  );

  return { depths };
}

/**
 * Convenience aggregator that returns the cluster-wide DLQ backlog.
 *
 * @remarks
 * - **Algorithm:** runs {@link sampleDeadLetterQueueDepths} and sums each entry's
 *   `total` (waiting + failed).
 * - **Failure modes:** propagates any error from the sampler.
 * - **Side effects:** same as the sampler — Sentry alerts may fire as a side
 *   effect of reading per-queue counts.
 * - **Notes:** used by health-check probes that just need a single scalar.
 */
export async function getTotalDeadLetterJobCount(): Promise<number> {
  const sample = await sampleDeadLetterQueueDepths();
  return sample.depths.reduce((total, entry) => total + entry.total, 0);
}
