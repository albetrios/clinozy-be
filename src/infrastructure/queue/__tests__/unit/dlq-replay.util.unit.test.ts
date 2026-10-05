import { describe, expect, it } from 'vitest';
import {
  buildReplayJobPayload,
  buildReplayJobPayloadFromLedger,
  DLQ_REPLAY_SOURCE_QUEUE_NAMES,
  resolveDeadLetterQueueNames,
} from '@/infrastructure/queue/dlq/dlq-replay.util.js';
import type { DeadLetterJobData } from '@/infrastructure/queue/dlq/dead-letter.js';
import { MAIL_QUEUE_NAME } from '@/infrastructure/mail/queues/mail.queue.js';
import { WEBHOOK_DELIVERY_QUEUE_NAME } from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import { NOTIFICATION_QUEUE_NAME } from '@/domains/notify/sub-domains/notification/queues/notification.queue.js';
import { STRIPE_WEBHOOK_QUEUE_NAME } from '@/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook.queue.js';

const base = {
  original_job_id: 'job-x',
  original_job_name: 'name-x',
  failed_reason: 'error',
  attempts_made: 5,
  max_attempts: 5,
  failed_at: new Date().toISOString(),
  replay_depth: 0,
} as const;

describe('dlq-replay.util', () => {
  it('resolveDeadLetterQueueNames normalizes queue names', () => {
    expect(resolveDeadLetterQueueNames('notification')).toEqual(['notification-dlq']);
    expect(resolveDeadLetterQueueNames('webhook-delivery-dlq')).toEqual(['webhook-delivery-dlq']);
  });

  it('does not offer mail for replay — a failed mail row is scrubbed, a pending one is re-enqueued by the sweeper', () => {
    expect(DLQ_REPLAY_SOURCE_QUEUE_NAMES).not.toContain(MAIL_QUEUE_NAME);
    expect(() => resolveDeadLetterQueueNames('mail')).toThrow(/Unknown DLQ queue/);
    expect(
      buildReplayJobPayload({
        ...base,
        original_queue: MAIL_QUEUE_NAME,
        original_data_summary: { mail_outbox_token: '6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f' },
      }),
    ).toBeNull();
  });

  it('buildReplayJobPayload reconstructs webhook and stripe payloads one level down the lineage', () => {
    const webhookData: DeadLetterJobData = {
      ...base,
      original_queue: WEBHOOK_DELIVERY_QUEUE_NAME,
      original_job_name: 'deliver-webhook',
      original_data_summary: {
        delivery_attempt_public_id: 'wda_9z3rura5kqvcv8zggriym',
        organization_public_id: 'org_public_abc',
      },
    };
    const stripeData: DeadLetterJobData = {
      ...base,
      original_queue: STRIPE_WEBHOOK_QUEUE_NAME,
      original_job_name: 'process-stripe-webhook',
      original_data_summary: { stripe_event_id: 'evt_123' },
      replay_depth: 2,
    };

    expect(buildReplayJobPayload(webhookData)).toEqual({
      deliveryAttemptPublicId: 'wda_9z3rura5kqvcv8zggriym',
      organizationPublicId: 'org_public_abc',
      replayFromDlq: true,
      dlqReplayAttempt: 1,
    });
    expect(buildReplayJobPayload(stripeData)).toEqual({
      stripeEventId: 'evt_123',
      replayFromDlq: true,
      dlqReplayAttempt: 3,
    });
  });

  it('buildReplayJobPayload reconstructs a tenant-scoped notification payload', () => {
    expect(
      buildReplayJobPayload({
        ...base,
        original_queue: NOTIFICATION_QUEUE_NAME,
        original_job_name: 'dispatch-notification',
        original_data_summary: {
          notification_public_id: 'ntf_000000000000000000077',
          organization_public_id: 'org_public_abc',
          user_public_id: 'usr_000000000000000000077',
        },
        replay_depth: 1,
      }),
    ).toEqual({
      notificationPublicId: 'ntf_000000000000000000077',
      organizationPublicId: 'org_public_abc',
      userPublicId: 'usr_000000000000000000077',
      replayFromDlq: true,
      dlqReplayAttempt: 2,
    });
  });

  it('buildReplayJobPayload reconstructs a notification without an organization (null scope)', () => {
    expect(
      buildReplayJobPayload({
        ...base,
        original_queue: NOTIFICATION_QUEUE_NAME,
        original_data_summary: {
          notification_public_id: 'ntf_000000000000000000088',
          user_public_id: 'usr_000000000000000000088',
        },
      }),
    ).toEqual({
      notificationPublicId: 'ntf_000000000000000000088',
      organizationPublicId: null,
      userPublicId: 'usr_000000000000000000088',
      replayFromDlq: true,
      dlqReplayAttempt: 1,
    });
  });

  it('buildReplayJobPayload returns null when required replay keys are missing', () => {
    // Webhook missing organization_public_id → cannot scope replay.
    expect(
      buildReplayJobPayload({
        ...base,
        original_queue: WEBHOOK_DELIVERY_QUEUE_NAME,
        original_data_summary: { delivery_attempt_public_id: 'wda_9z3rura5kqvcv8zggriym' },
      }),
    ).toBeNull();

    // Stripe missing stripe_event_id → cannot re-fetch the event.
    expect(
      buildReplayJobPayload({
        ...base,
        original_queue: STRIPE_WEBHOOK_QUEUE_NAME,
        original_data_summary: {},
      }),
    ).toBeNull();

    // Notification missing its public id or recipient → nothing to load, no scope.
    expect(
      buildReplayJobPayload({
        ...base,
        original_queue: NOTIFICATION_QUEUE_NAME,
        original_data_summary: { organization_public_id: 'org_public_abc' },
      }),
    ).toBeNull();
    expect(
      buildReplayJobPayload({
        ...base,
        original_queue: NOTIFICATION_QUEUE_NAME,
        original_data_summary: { notification_public_id: 'ntf_000000000000000000088' },
      }),
    ).toBeNull();
  });

  it('buildReplayJobPayloadFromLedger maps ledger columns to a replay one level deeper', () => {
    expect(
      buildReplayJobPayloadFromLedger({
        source_queue: STRIPE_WEBHOOK_QUEUE_NAME,
        job_id: 'job-ledger-1',
        job_name: 'process-stripe-webhook',
        payload_summary: { stripe_event_id: 'evt_ledger' },
        attempts_made: 5,
        replay_depth: 2,
      }),
    ).toEqual({
      stripeEventId: 'evt_ledger',
      replayFromDlq: true,
      dlqReplayAttempt: 3,
    });
  });
});
