import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, type MockInstance, vi } from 'vitest';

import { type Job, Queue, QueueEvents, type Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { env } from '@/shared/config/env.config.js';
import { webhook_delivery_attempts } from '@/domains/notify/sub-domains/webhook/webhook.schema.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';

import { createWebhookDeliveryWorker } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery.worker.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { WEBHOOK_DELIVERY_QUEUE_NAME } from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { CHAOS_POSTGRES_PROXY_NAME } from '@/tests/chaos/chaos.constants.js';
import {
  resetChaosTestingListeningProxyFailuresGloballyViaToxiproxy,
  setChaosTestingListeningProxyEnabledAdministrativeSwitch,
} from '@/tests/chaos/helpers/toxiproxy.client.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import {
  createTestWebhook,
  createTestWebhookDeliveryAttempt,
} from '@/tests/factories/webhook.factory.js';

describe('Chaos resilience: BullMQ webhook delivery survives transient Postgres outages', () => {
  const chaosWebhookDeliveryProbeUrlAwaitingIsolation =
    'https://example.org/api/v1/chaos_fixture_webhooks_for_queue_observation/mock-ingest-route';

  let webhookDeliveryWorkerHandleAwaitingObservation: WorkerHandle | null = null;
  let enqueueQueueAwaitingIsolation: Queue | null = null;
  let queueTelemetryListeningForCompletionEventsAwaitingIsolation: QueueEvents | null = null;
  const originalFetchImplementationCapturedBeforeIsolation: typeof globalThis.fetch =
    globalThis.fetch;
  let outboundWebhookFetchSpyAwaitingObservation: MockInstance<typeof globalThis.fetch> | null =
    null;

  afterAll(async () => {
    await webhookDeliveryWorkerHandleAwaitingObservation?.close();
    outboundWebhookFetchSpyAwaitingObservation?.mockRestore();
    await enqueueQueueAwaitingIsolation?.close();
    await queueTelemetryListeningForCompletionEventsAwaitingIsolation?.close();
    globalThis.fetch = originalFetchImplementationCapturedBeforeIsolation;
    vi.restoreAllMocks();
    await resetChaosTestingListeningProxyFailuresGloballyViaToxiproxy();
  });

  it('retries when the first Postgres connection attempt fails midway through toxin exposure', async () => {
    await resetChaosTestingListeningProxyFailuresGloballyViaToxiproxy();

    const userAwaitingWebhookFixtureIsolation = await createTestUser();
    const organizationAwaitingWebhookFixtureIsolation = await createTestOrganization({
      ownerUserId: userAwaitingWebhookFixtureIsolation.id,
    });
    const webhookAwaitingDeliveryJobIsolation = await createTestWebhook({
      organizationId: organizationAwaitingWebhookFixtureIsolation.id,
      url: chaosWebhookDeliveryProbeUrlAwaitingIsolation,
      events: ['chaos.webhooks.delivery.probe'],
    });
    const pendingWebhookDeliveryAttemptAwaitingIsolation = await createTestWebhookDeliveryAttempt({
      webhookId: webhookAwaitingDeliveryJobIsolation.id,
      eventType: 'chaos.webhooks.delivery.probe',
      payload: { simulatedEvent: true },
    });

    webhookDeliveryWorkerHandleAwaitingObservation = createWebhookDeliveryWorker();

    enqueueQueueAwaitingIsolation = new Queue(WEBHOOK_DELIVERY_QUEUE_NAME, {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
      defaultJobOptions: {
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 20 },
      },
    });

    queueTelemetryListeningForCompletionEventsAwaitingIsolation = new QueueEvents(
      WEBHOOK_DELIVERY_QUEUE_NAME,
      {
        connection: getBullMQConnectionOptions(),
        prefix: getBullMQKeyPrefix(),
      },
    );

    await queueTelemetryListeningForCompletionEventsAwaitingIsolation.waitUntilReady();

    const workerReferenceListeningForIsolation =
      webhookDeliveryWorkerHandleAwaitingObservation.worker;
    await waitUntilWebhookWorkerReferenceSignalsOperationalReadiness(
      workerReferenceListeningForIsolation,
    );

    outboundWebhookFetchSpyAwaitingObservation = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async (requestListeningForIsolation, initializerArgumentsAwaitingIsolation) => {
          const inferredHttpMethodListening =
            typeof initializerArgumentsAwaitingIsolation === 'object' &&
            initializerArgumentsAwaitingIsolation !== null &&
            'method' in initializerArgumentsAwaitingIsolation
              ? String(initializerArgumentsAwaitingIsolation.method)
              : typeof requestListeningForIsolation === 'string'
                ? 'GET'
                : 'GET';

          const requestUrl =
            requestListeningForIsolation instanceof Request
              ? requestListeningForIsolation.url
              : String(requestListeningForIsolation);
          if (
            requestUrl === chaosWebhookDeliveryProbeUrlAwaitingIsolation &&
            inferredHttpMethodListening.toUpperCase() === 'POST'
          ) {
            return new Response(JSON.stringify({ delivered: true }), {
              headers: {
                'content-type': 'application/json',
              },
              status: 200,
            });
          }

          return originalFetchImplementationCapturedBeforeIsolation(
            requestListeningForIsolation,
            initializerArgumentsAwaitingIsolation,
          );
        },
      );

    const outageStartedAt = performance.now();
    await setChaosTestingListeningProxyEnabledAdministrativeSwitch(
      CHAOS_POSTGRES_PROXY_NAME,
      false,
    );

    const observationCancellation = new AbortController();
    try {
      const randomJobPublicIdentifierAwaitingIsolation = `chaos-webhook-retry-${randomUUID()}`;
      const firstFailure = observeWorkerFailure({
        worker: workerReferenceListeningForIsolation,
        jobId: randomJobPublicIdentifierAwaitingIsolation,
        timeoutMs: 30_000,
        signal: observationCancellation.signal,
      });

      const waitForMatchedCompletionPromiseListening =
        observeQueueCompletionFilteringByJobPublicIdentifier({
          completionEventsListeningForCorrelation:
            queueTelemetryListeningForCompletionEventsAwaitingIsolation,
          expectedJobPublicIdentifierAwaitingCompletionObservation:
            randomJobPublicIdentifierAwaitingIsolation,
          timeoutMillisecondsAwaitingIsolation: 90_000,
          signal: observationCancellation.signal,
        });

      // Handle timeouts immediately; await both correlated observations below.
      void firstFailure.catch(() => undefined);
      void waitForMatchedCompletionPromiseListening.catch(() => undefined);
      const enqueueQueueReferenceAwaitingIsolation = enqueueQueueAwaitingIsolation;
      if (!enqueueQueueReferenceAwaitingIsolation) {
        throw new Error(
          'enqueueQueueReferenceAwaitingIsolation was undefined before webhook job submission',
        );
      }

      await enqueueQueueReferenceAwaitingIsolation.add(
        'deliver-webhook',
        {
          deliveryAttemptPublicId: pendingWebhookDeliveryAttemptAwaitingIsolation.publicId,
          organizationPublicId: organizationAwaitingWebhookFixtureIsolation.public_id,
        },
        {
          jobId: randomJobPublicIdentifierAwaitingIsolation,
          attempts: 5,
          backoff: {
            delay: 550,
            type: 'fixed',
          },
        },
      );

      const failedAttempt = await firstFailure;
      expect(failedAttempt.attemptsMade).toBeGreaterThanOrEqual(1);
      const failureCode = postgresConnectionFailureCode(failedAttempt.error);
      if (failureCode === 'SERVICE_UNAVAILABLE') {
        // The bounded database acquisition wait deliberately hides the socket error.
        expect(env.DATABASE_POOL_ACQUIRE_TIMEOUT_MS).toBeGreaterThan(0);
        expect(performance.now() - outageStartedAt).toBeGreaterThanOrEqual(
          env.DATABASE_POOL_ACQUIRE_TIMEOUT_MS,
        );
      } else {
        expect(failureCode).toMatch(
          /^(ECONNREFUSED|ECONNRESET|CONNECTION_CLOSED|CONNECTION_ENDED|CONNECT_TIMEOUT|ETIMEDOUT)$/,
        );
      }
      const receiverCallsBeforeRecovery =
        outboundWebhookFetchSpyAwaitingObservation.mock.calls.filter(
          ([input]) =>
            (input instanceof Request ? input.url : String(input)) ===
            chaosWebhookDeliveryProbeUrlAwaitingIsolation,
        );
      expect(receiverCallsBeforeRecovery).toHaveLength(0);

      await setChaosTestingListeningProxyEnabledAdministrativeSwitch(
        CHAOS_POSTGRES_PROXY_NAME,
        true,
      );
      await resetChaosTestingListeningProxyFailuresGloballyViaToxiproxy();

      await waitForMatchedCompletionPromiseListening;
      const completedJob = await enqueueQueueReferenceAwaitingIsolation.getJob(
        randomJobPublicIdentifierAwaitingIsolation,
      );
      expect(await completedJob?.getState()).toBe('completed');
      expect(completedJob?.attemptsMade).toBeGreaterThan(failedAttempt.attemptsMade);
      const [persistedAttempt] = await getOperatorDatabase()
        .select({
          status: webhook_delivery_attempts.status,
          httpStatusCode: webhook_delivery_attempts.http_status_code,
          attemptCount: webhook_delivery_attempts.attempt_count,
        })
        .from(webhook_delivery_attempts)
        .where(eq(webhook_delivery_attempts.id, pendingWebhookDeliveryAttemptAwaitingIsolation.id));
      expect(persistedAttempt).toMatchObject({
        status: 'SENT',
        httpStatusCode: 200,
        attemptCount: 1,
      });
    } finally {
      observationCancellation.abort();
      await setChaosTestingListeningProxyEnabledAdministrativeSwitch(
        CHAOS_POSTGRES_PROXY_NAME,
        true,
      ).catch(() => {});
      await resetChaosTestingListeningProxyFailuresGloballyViaToxiproxy();
    }
  });
});

async function waitUntilWebhookWorkerReferenceSignalsOperationalReadiness(
  workerObservationReferenceAwaitingIsolation: Worker | undefined,
): Promise<void> {
  if (!workerObservationReferenceAwaitingIsolation) {
    throw new Error(
      'webhook_delivery.worker_reference_was_undefined_waiting_for_observation_fixture',
    );
  }

  await workerObservationReferenceAwaitingIsolation.waitUntilReady();
}

function postgresConnectionFailureCode(error: Error): string | undefined {
  let cause: unknown = error;
  while (cause instanceof Error) {
    if ('code' in cause && typeof cause.code === 'string') return cause.code;
    cause = cause.cause;
  }
  return undefined;
}

function observeWorkerFailure(input: {
  worker: Worker | undefined;
  jobId: string;
  timeoutMs: number;
  signal: AbortSignal;
}): Promise<{ attemptsMade: number; error: Error }> {
  const worker = input.worker;
  if (!worker) throw new Error('webhook delivery worker missing before failure observation');
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      worker.off('failed', onFailed);
      input.signal.removeEventListener('abort', onAbort);
    };
    const onFailed = (job: Job | undefined, error: Error) => {
      if (job?.id !== input.jobId) return;
      cleanup();
      resolve({ attemptsMade: job.attemptsMade, error });
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('correlated webhook failure observation canceled'));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error('correlated webhook failure was not observed while PostgreSQL was unavailable'),
      );
    }, input.timeoutMs);
    worker.on('failed', onFailed);
    input.signal.addEventListener('abort', onAbort, { once: true });
  });
}

function observeQueueCompletionFilteringByJobPublicIdentifier(input: {
  completionEventsListeningForCorrelation: QueueEvents;
  expectedJobPublicIdentifierAwaitingCompletionObservation: string | number | undefined | null;
  timeoutMillisecondsAwaitingIsolation: number;
  signal: AbortSignal;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const events = input.completionEventsListeningForCorrelation;
    const cleanup = () => {
      clearTimeout(timeout);
      events.off('completed', onCompleted);
      input.signal.removeEventListener('abort', onAbort);
    };
    const onCompleted = (payload: { jobId?: string | number }) => {
      if (
        String(payload.jobId) !==
        String(input.expectedJobPublicIdentifierAwaitingCompletionObservation)
      )
        return;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('correlated webhook completion observation canceled'));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('bullmq.completion_event_timed_out_waiting_for_correlated_fixture'));
    }, input.timeoutMillisecondsAwaitingIsolation);
    events.on('completed', onCompleted);
    input.signal.addEventListener('abort', onAbort, { once: true });
  });
}
