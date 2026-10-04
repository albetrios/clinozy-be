import { beforeEach, describe, expect, it, vi } from 'vitest';

const addMock = vi.fn().mockResolvedValue(undefined);
const closeMock = vi.fn().mockResolvedValue(undefined);
const queueConstructorMock = vi.fn();

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string, options: unknown) {
      queueConstructorMock(name, options);
    }
    add = addMock;
    waitUntilReady = vi.fn().mockResolvedValue(undefined);
    getJobCounts = vi.fn().mockResolvedValue({});
    close = closeMock;
  },
}));

vi.mock('@/infrastructure/queue/connection.js', () => ({
  getBullMQKeyPrefix: () => 'test:bull',
  getBullMQProducerConnectionOptions: () => ({}),
}));

vi.mock('@/infrastructure/observability/tracing/trace-context.util.js', () => ({
  captureTraceContextForPropagation: () => ({}),
}));

import {
  closeWebhookDeliveryQueue,
  enqueueWebhookDeliveryByAttemptId,
  WEBHOOK_DELIVERY_JOB_ATTEMPTS,
  WEBHOOK_DELIVERY_QUEUE_NAME,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';

const ORGANIZATION_PUBLIC_ID = 'org_abcdefghijklmnopqrstu';
const DELIVERY_ATTEMPT_PUBLIC_ID = 'wda_9z3rura5kqvcv8zggriym';
const SECOND_DELIVERY_ATTEMPT_PUBLIC_ID = 'wda_bchnclznbnkn5db2qocfh';

/**
 * Mirrors `notification.queue.unit.test.ts` for the delivery queue, which had no dedicated test
 * despite owning the retry budget and the dedup job id for every outbound webhook.
 *
 * `WEBHOOK_DELIVERY_JOB_ATTEMPTS` is asserted as a literal on purpose: the worker derives its
 * final-attempt give-up guard from this number, so a silent bump here changes retry behaviour in
 * a file that does not mention retries.
 */
describe('webhook-delivery queue', () => {
  beforeEach(async () => {
    // The queue handle is module-level and lazily created, so it survives between cases.
    // Close it first, then clear the spies, so every case starts from "not yet constructed"
    // and the constructor-call counts below mean what they say.
    await closeWebhookDeliveryQueue();
    addMock.mockClear();
    closeMock.mockClear();
    queueConstructorMock.mockClear();
  });

  it('declares a stable queue name', () => {
    // The name is the DLQ prefix (`webhook-delivery-dlq`), the bulkhead key, and the metrics
    // label — renaming it orphans in-flight jobs.
    expect(WEBHOOK_DELIVERY_QUEUE_NAME).toBe('webhook-delivery');
  });

  it('declares the retry budget the worker derives its give-up guard from', () => {
    expect(WEBHOOK_DELIVERY_JOB_ATTEMPTS).toBe(5);
  });

  it('enqueues with the attempt public id as jobId so a redelivery cannot double-send', async () => {
    await enqueueWebhookDeliveryByAttemptId({
      deliveryAttemptId: 123,
      deliveryAttemptPublicId: DELIVERY_ATTEMPT_PUBLIC_ID,
      organizationPublicId: ORGANIZATION_PUBLIC_ID,
      requestId: 'request-1',
    });

    expect(addMock).toHaveBeenCalledTimes(1);
    const [jobName, jobData, options] = addMock.mock.calls[0] ?? [];
    expect(jobName).toBe('deliver-webhook');
    expect(jobData).toMatchObject({
      deliveryAttemptId: 123,
      organizationPublicId: ORGANIZATION_PUBLIC_ID,
      requestId: 'request-1',
    });
    // Not `wh-attempt-123`: the bigserial restarts at 1 after TRUNCATE ... RESTART IDENTITY or a
    // restore while BullMQ keeps the old job for 7 days, and an add whose id exists is dropped.
    expect(options).toEqual({ jobId: DELIVERY_ATTEMPT_PUBLIC_ID });
  });

  it('omits requestId entirely rather than sending undefined when it is absent', async () => {
    // omitUndefined runs before the schema parse; an explicit `requestId: undefined` would fail
    // the min(1) check on some producers and pollute the Redis payload on others.
    await enqueueWebhookDeliveryByAttemptId({
      deliveryAttemptId: 456,
      deliveryAttemptPublicId: DELIVERY_ATTEMPT_PUBLIC_ID,
      organizationPublicId: ORGANIZATION_PUBLIC_ID,
    });

    const [, jobData, options] = addMock.mock.calls[0] ?? [];
    expect(jobData).not.toHaveProperty('requestId');
    expect(options).toEqual({ jobId: DELIVERY_ATTEMPT_PUBLIC_ID });
  });

  it('rejects an invalid attempt id at the producer boundary', async () => {
    // parseBullMQJobData throws before queue.add, so a bad payload never reaches Redis.
    await expect(
      enqueueWebhookDeliveryByAttemptId({
        deliveryAttemptId: 0,
        deliveryAttemptPublicId: DELIVERY_ATTEMPT_PUBLIC_ID,
        organizationPublicId: ORGANIZATION_PUBLIC_ID,
      }),
    ).rejects.toThrow(/bullmq\.invalid_job_payload:webhook-delivery/);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('configures the queue with the declared attempts and a custom backoff', async () => {
    await enqueueWebhookDeliveryByAttemptId({
      deliveryAttemptId: 1,
      deliveryAttemptPublicId: DELIVERY_ATTEMPT_PUBLIC_ID,
      organizationPublicId: ORGANIZATION_PUBLIC_ID,
    });

    const [name, options] = queueConstructorMock.mock.calls[0] ?? [];
    expect(name).toBe(WEBHOOK_DELIVERY_QUEUE_NAME);
    expect(options).toMatchObject({
      defaultJobOptions: {
        attempts: WEBHOOK_DELIVERY_JOB_ATTEMPTS,
        // 'custom' routes to the worker's jittered backoff strategy rather than BullMQ's
        // fixed/exponential defaults.
        backoff: { type: 'custom' },
      },
    });
  });

  it('reuses one lazily-created queue instance across enqueues', async () => {
    await enqueueWebhookDeliveryByAttemptId({
      deliveryAttemptId: 1,
      deliveryAttemptPublicId: DELIVERY_ATTEMPT_PUBLIC_ID,
      organizationPublicId: ORGANIZATION_PUBLIC_ID,
    });
    await enqueueWebhookDeliveryByAttemptId({
      deliveryAttemptId: 2,
      deliveryAttemptPublicId: SECOND_DELIVERY_ATTEMPT_PUBLIC_ID,
      organizationPublicId: ORGANIZATION_PUBLIC_ID,
    });

    expect(queueConstructorMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledTimes(2);
  });

  it('closes the queue and allows a fresh one to be created afterwards', async () => {
    await enqueueWebhookDeliveryByAttemptId({
      deliveryAttemptId: 1,
      deliveryAttemptPublicId: DELIVERY_ATTEMPT_PUBLIC_ID,
      organizationPublicId: ORGANIZATION_PUBLIC_ID,
    });
    await closeWebhookDeliveryQueue();

    expect(closeMock).toHaveBeenCalledTimes(1);

    // The module-level handle must be nulled, or a post-shutdown enqueue would use a closed
    // connection instead of reconnecting.
    await enqueueWebhookDeliveryByAttemptId({
      deliveryAttemptId: 2,
      deliveryAttemptPublicId: SECOND_DELIVERY_ATTEMPT_PUBLIC_ID,
      organizationPublicId: ORGANIZATION_PUBLIC_ID,
    });
    expect(queueConstructorMock).toHaveBeenCalledTimes(2);

    await closeWebhookDeliveryQueue();
  });
});
