import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetJobCounts = vi.fn();
const mockClose = vi.fn();
const mockQueueConstructor = vi.fn();

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    getJobCounts = mockGetJobCounts;
    close = mockClose;
    constructor(name: string) {
      mockQueueConstructor(name);
    }
  },
}));

vi.mock('@/infrastructure/observability/sentry/sentry.js', () => ({
  captureMessage: vi.fn(),
}));

describe('sampleDeadLetterQueueDepths', () => {
  beforeEach(() => {
    mockGetJobCounts.mockReset();
    mockClose.mockReset();
    mockQueueConstructor.mockClear();
    mockGetJobCounts.mockResolvedValue({ waiting: 0, failed: 0 });
  });

  it('returns depth samples for each dead-letter queue', async () => {
    const { sampleDeadLetterQueueDepths } = await import(
      '@/infrastructure/observability/dlq-depth/dlq-depth.service.js'
    );
    const { WORKER_QUEUE_NAMES } = await import('@/infrastructure/queue/queue-catalog.js');

    const result = await sampleDeadLetterQueueDepths();

    expect(result.depths.length).toBe(WORKER_QUEUE_NAMES.length);
    expect(result.depths.map((entry) => entry.deadLetterQueueName)).toEqual(
      WORKER_QUEUE_NAMES.map((name) => `${name}-dlq`),
    );
    expect(mockGetJobCounts).toHaveBeenCalledTimes(WORKER_QUEUE_NAMES.length);
  });

  // sec-DLQ-scrape: a fresh connect + close per DLQ, run sequentially, took 30 s+ on a hosted
  // Redis and turned every /metrics scrape into an edge 502. The sampler must reuse the pooled
  // dead-letter clients (no per-call close) so repeated passes cost one round trip.
  it('reuses the pooled dead-letter clients across passes and never closes them', async () => {
    const { sampleDeadLetterQueueDepths } = await import(
      '@/infrastructure/observability/dlq-depth/dlq-depth.service.js'
    );
    const { WORKER_QUEUE_NAMES } = await import('@/infrastructure/queue/queue-catalog.js');
    const constructionsBefore = mockQueueConstructor.mock.calls.length;

    await sampleDeadLetterQueueDepths();
    const constructionsAfterFirstPass = mockQueueConstructor.mock.calls.length;
    await sampleDeadLetterQueueDepths();

    expect(constructionsAfterFirstPass - constructionsBefore).toBeLessThanOrEqual(
      WORKER_QUEUE_NAMES.length,
    );
    expect(mockQueueConstructor.mock.calls.length).toBe(constructionsAfterFirstPass);
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('queries every dead-letter queue concurrently rather than one after another', async () => {
    const { sampleDeadLetterQueueDepths } = await import(
      '@/infrastructure/observability/dlq-depth/dlq-depth.service.js'
    );
    const { WORKER_QUEUE_NAMES } = await import('@/infrastructure/queue/queue-catalog.js');
    let inFlight = 0;
    let peakInFlight = 0;
    mockGetJobCounts.mockImplementation(async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { waiting: 1, failed: 2 };
    });

    const result = await sampleDeadLetterQueueDepths();

    expect(peakInFlight).toBe(WORKER_QUEUE_NAMES.length);
    expect(result.depths.every((entry) => entry.total === 3)).toBe(true);
  });
});
