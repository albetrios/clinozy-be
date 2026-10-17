import { beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { UnrecoverableError } from 'bullmq';
import { processStripeWebhookJob } from '@/domains/billing/sub-domains/stripe-webhook/workers/stripe-webhook.processor.js';
import { StripeWebhookService } from '@/domains/billing/sub-domains/stripe-webhook/stripe-webhook.service.js';
import type { SubscriptionService } from '@/domains/billing/sub-domains/subscription/subscription.service.js';
import type { StripeWebhookEventRepository } from '@/domains/billing/sub-domains/stripe-webhook/stripe-webhook-event.repository.js';
import type { StripeWebhookJobData } from '@/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook.queue.js';

// sec-r4-Q1 regression: parseBullMQJobData must NOT be called by the processor.
// Validation belongs at the worker boundary (parseJobDataOrDeadLetter in
// stripe-webhook.worker.ts); a second parse here would bypass DLQ routing.
// vi.hoisted: the spy must initialize before any vi.mock factory runs, because importing
// StripeWebhookService now transitively loads the queue module (which imports
// parseBullMQJobData) during this file's import phase — before a plain `const` would be set.
const { parseBullMQJobDataSpy } = vi.hoisted(() => ({ parseBullMQJobDataSpy: vi.fn() }));
vi.mock('@/shared/utils/validation/bullmq-job-validation.util.js', () => ({
  parseBullMQJobData: parseBullMQJobDataSpy,
}));

// The duplicate/race fixtures have no stored watermark; database reconciliation is
// covered by the service units and real repository/database tests.
vi.mock(
  '@/domains/billing/sub-domains/subscription/subscription.repository.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/domains/billing/sub-domains/subscription/subscription.repository.js')
    >()),
    createWorkerSubscriptionRepository: vi.fn((databaseHandle) => ({
      databaseHandle,
      findStripeProviderOrderingState: vi.fn().mockResolvedValue(null),
    })),
  }),
);

const retrieveStripeEventMock = vi.fn();

vi.mock('@/infrastructure/payment/stripe.client.js', () => ({
  retrieveStripeEvent: (...arguments_: unknown[]) => retrieveStripeEventMock(...arguments_),
}));

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withMaintenanceDatabaseContext: vi.fn(
    async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
      callback(),
  ),
}));

vi.mock('@/domains/billing/sub-domains/stripe-webhook/stripe-webhook-organization.util.js', () => ({
  runStripeWebhookHandlerWithOrganizationContext: vi.fn(
    async ({
      event: _event,
      repository: _repository,
      handler,
    }: {
      event: Stripe.Event;
      repository: unknown;
      handler: (databaseHandle: unknown) => Promise<void>;
    }) => handler({} as never),
  ),
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('stripe-webhook.processor duplicate job delivery', () => {
  const jobData: StripeWebhookJobData = {
    stripeEventId: 'evt_race_duplicate',
    requestId: 'req-race-1',
  };

  const stripeEventPayload = {
    id: 'evt_race_duplicate',
    type: 'customer.subscription.updated',
    created: 1_700_000_000,
    data: {
      object: {
        id: 'sub_race',
        status: 'active',
        items: {
          data: [{ current_period_start: 1_700_000_000, current_period_end: 1_700_086_400 }],
        },
      },
    },
  } as unknown as Stripe.Event;

  const subscriptionService = {
    syncFromStripeProviderSubscription: vi.fn(),
    markCanceledByStripeProviderSubscriptionId: vi.fn(),
    emitSubscriptionEvent: vi.fn().mockResolvedValue(undefined),
    findStripeSubscriptionPublicState: vi.fn().mockResolvedValue(null),
    logEntitlementLossAfterCommit: vi.fn().mockResolvedValue(undefined),
  } as unknown as SubscriptionService;

  const stripeWebhookEventRepository = {
    tryClaimEvent: vi.fn(),
    markProcessed: vi.fn(),
    markFailed: vi.fn(),
    markAbandoned: vi.fn(),
  } as unknown as StripeWebhookEventRepository;

  const stripeWebhookService = new StripeWebhookService(
    subscriptionService,
    stripeWebhookEventRepository,
    // sec-B7: processor test exercises retry / DLQ paths, never reaches
    // plan-id resolution. Stub for type safety only.
    { findByStripePriceId: vi.fn() } as never,
  );

  beforeEach(() => {
    retrieveStripeEventMock.mockReset();
    retrieveStripeEventMock.mockResolvedValue(stripeEventPayload);

    vi.mocked(stripeWebhookEventRepository.tryClaimEvent).mockReset();
    vi.mocked(stripeWebhookEventRepository.markProcessed).mockReset();
    vi.mocked(subscriptionService.syncFromStripeProviderSubscription).mockReset();
    parseBullMQJobDataSpy.mockReset();

    // sec-new-D2: markProcessed now returns boolean; true = row found and updated.
    vi.mocked(stripeWebhookEventRepository.markProcessed).mockResolvedValue(true as never);
    vi.mocked(subscriptionService.syncFromStripeProviderSubscription).mockResolvedValue({
      id: 1,
    } as never);
  });

  // sec-r4-Q1: processor must use jobData directly — no redundant re-parse.
  it('does not re-invoke parseBullMQJobData (validation belongs at worker boundary)', async () => {
    vi.mocked(stripeWebhookEventRepository.tryClaimEvent).mockResolvedValueOnce('claimed');

    await processStripeWebhookJob({ jobData, stripeWebhookService, jobId: 'job-noreparse' });

    expect(parseBullMQJobDataSpy).not.toHaveBeenCalled();
    expect(retrieveStripeEventMock).toHaveBeenCalledWith({ stripeEventId: jobData.stripeEventId });
  });

  it('parallel duplicate BullMQ jobs apply subscription side effects only once', async () => {
    vi.mocked(stripeWebhookEventRepository.tryClaimEvent)
      .mockResolvedValueOnce('claimed')
      .mockResolvedValueOnce('processed_duplicate');

    await Promise.all([
      processStripeWebhookJob({ jobData, stripeWebhookService, jobId: 'job-duplicate-a' }),
      processStripeWebhookJob({ jobData, stripeWebhookService, jobId: 'job-duplicate-b' }),
    ]);

    expect(retrieveStripeEventMock).toHaveBeenCalledTimes(2);
    expect(subscriptionService.syncFromStripeProviderSubscription).toHaveBeenCalledTimes(1);
    expect(stripeWebhookEventRepository.markProcessed).toHaveBeenCalledTimes(1);
  });

  it('abandons an event Stripe no longer has and fails the job for good — one alert, no retries', async () => {
    retrieveStripeEventMock.mockRejectedValueOnce(
      new Stripe.errors.StripeInvalidRequestError({
        message: "No such event: 'evt_race_duplicate'",
        type: 'invalid_request_error',
        code: 'resource_missing',
      }),
    );
    vi.mocked(stripeWebhookEventRepository.markAbandoned).mockResolvedValueOnce(true);

    await expect(
      processStripeWebhookJob({ jobData, stripeWebhookService, jobId: 'job-missing' }),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(stripeWebhookEventRepository.markAbandoned).toHaveBeenCalledWith(
      'evt_race_duplicate',
      'stripe_event_not_found',
    );
    expect(stripeWebhookEventRepository.tryClaimEvent).not.toHaveBeenCalled();
  });

  it('keeps retrying when Stripe itself is failing — an outage is not a missing event', async () => {
    const outage = new Stripe.errors.StripeAPIError({
      message: 'Internal error',
      type: 'api_error',
    });
    retrieveStripeEventMock.mockRejectedValueOnce(outage);

    await expect(
      processStripeWebhookJob({ jobData, stripeWebhookService, jobId: 'job-outage' }),
    ).rejects.toBe(outage);
    expect(stripeWebhookEventRepository.markAbandoned).not.toHaveBeenCalled();
  });

  it('fails the job for good once the service abandoned the event', async () => {
    vi.mocked(stripeWebhookEventRepository.tryClaimEvent).mockResolvedValueOnce('claimed');
    vi.mocked(subscriptionService.syncFromStripeProviderSubscription).mockRejectedValueOnce(
      new Error('handler keeps failing'),
    );
    vi.mocked(stripeWebhookEventRepository.markFailed).mockResolvedValueOnce({ attemptCount: 25 });
    vi.mocked(stripeWebhookEventRepository.markAbandoned).mockResolvedValueOnce(true);

    const error = await processStripeWebhookJob({
      jobData,
      stripeWebhookService,
      jobId: 'job-last',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnrecoverableError);
    expect((error as Error).message).toContain('handler keeps failing');
  });
});
