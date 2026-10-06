import { describe, it, expect, beforeEach } from 'vitest';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { WebhookRepository } from '@/domains/notify/sub-domains/webhook/webhook.repository.js';
import { WebhookDeliveryAttemptRepository } from '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery-attempt.repository.js';

describe('WebhookDeliveryAttemptRepository.tryMarkSending (database)', () => {
  const webhookRepository = new WebhookRepository();
  const attemptRepository = new WebhookDeliveryAttemptRepository();

  async function createWebhookFixture(urlSuffix: string) {
    const owner = await createTestUser({ email: `mark-sending-${urlSuffix}@example.com` });
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const webhook = await webhookRepository.create({
      organization_id: organization.id,
      url: `https://example.com/hook-${urlSuffix}`,
      events: ['subscription.updated'],
      encrypted_secret: 'v1:test',
      created_by_user_id: owner.id,
    });
    return { owner, organization, webhook };
  }

  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function createAttempt(options: {
    webhookId: number;
    status: 'PENDING' | 'SENDING' | 'FAILED' | 'SENT';
    attemptCount: number;
  }) {
    return attemptRepository.create({
      webhook_id: options.webhookId,
      event_type: 'subscription.updated',
      payload: { id: `sub_${options.status}` },
      status: options.status,
      http_status_code: options.status === 'FAILED' ? 500 : null,
      response_body: options.status === 'FAILED' ? 'server error' : null,
      sent_at: options.status === 'PENDING' ? null : new Date(),
      attempt_count: options.attemptCount,
    });
  }

  async function readAttempt(webhookId: number, attemptId: number) {
    const { items } = await attemptRepository.listByWebhook(webhookId, { limit: 10 });
    return items.find((item) => item.id === attemptId);
  }

  it('claims a PENDING attempt and counts it', async () => {
    const { webhook } = await createWebhookFixture('pending');
    const attempt = await createAttempt({
      webhookId: webhook.id,
      status: 'PENDING',
      attemptCount: 0,
    });

    expect(await attemptRepository.tryMarkSending(attempt.id)).toBe('claimed');

    const row = await readAttempt(webhook.id, attempt.id);
    expect(row?.status).toBe('SENDING');
    expect(row?.attempt_count).toBe(1);
  });

  it('re-claims a SENDING attempt — the execution that claimed it died mid-send', async () => {
    // BullMQ runs one execution per job and the job id is the attempt's public id, so a new
    // execution that finds the row SENDING is looking at a crashed or lost one. Reporting it as
    // "in flight" completed the job and the event was never delivered.
    const { webhook } = await createWebhookFixture('sending');
    const attempt = await createAttempt({
      webhookId: webhook.id,
      status: 'SENDING',
      attemptCount: 1,
    });

    expect(await attemptRepository.tryMarkSending(attempt.id)).toBe('claimed');
    expect((await readAttempt(webhook.id, attempt.id))?.attempt_count).toBe(2);
  });

  it('re-claims a FAILED attempt — the next retry, or a DLQ replay starting its attempts over', async () => {
    const { webhook } = await createWebhookFixture('failed');
    const attempt = await createAttempt({
      webhookId: webhook.id,
      status: 'FAILED',
      attemptCount: 8,
    });

    expect(await attemptRepository.tryMarkSending(attempt.id)).toBe('claimed');

    const row = await readAttempt(webhook.id, attempt.id);
    expect(row?.status).toBe('SENDING');
    expect(row?.attempt_count).toBe(9);
    // The previous outcome is cleared with the claim.
    expect(row?.http_status_code).toBeNull();
    expect(row?.next_retry_at).toBeNull();
  });

  it('never claims a SENT attempt', async () => {
    const { webhook } = await createWebhookFixture('sent');
    const attempt = await createAttempt({ webhookId: webhook.id, status: 'SENT', attemptCount: 1 });

    expect(await attemptRepository.tryMarkSending(attempt.id)).toBe('already_sent');

    const row = await readAttempt(webhook.id, attempt.id);
    expect(row?.status).toBe('SENT');
    expect(row?.attempt_count).toBe(1);
  });

  it('recordOutcome never overwrites a terminal SENT row (stale reclaim writer)', async () => {
    // Race: execution A claims and POSTs slowly and stalls; execution B re-claims, re-sends and
    // records SENT. A's slow POST then returns and records FAILED. Without a guard A would flip
    // an already-delivered webhook back to FAILED and trigger a spurious redelivery.
    const { webhook } = await createWebhookFixture('record-outcome-sent');
    const sentAttempt = await attemptRepository.create({
      webhook_id: webhook.id,
      event_type: 'subscription.updated',
      payload: { id: 'sub_5' },
      status: 'SENT',
      http_status_code: 200,
      response_body: 'ok',
      sent_at: new Date(),
      attempt_count: 1,
    });

    await attemptRepository.recordOutcome(sentAttempt.id, {
      status: 'FAILED',
      http_status_code: 500,
      response_body: 'late-failure',
      next_retry_at: new Date(),
    });

    const { items } = await attemptRepository.listByWebhook(webhook.id, { limit: 10 });
    const sentRow = items.find((item) => item.id === sentAttempt.id);
    expect(sentRow?.status).toBe('SENT');
    expect(sentRow?.http_status_code).toBe(200);

    // Control: the guard only protects SENT — a SENDING row is still recordable to a terminal
    // outcome (the normal delivery path must keep working).
    const sendingAttempt = await attemptRepository.create({
      webhook_id: webhook.id,
      event_type: 'subscription.updated',
      payload: { id: 'sub_6' },
      status: 'SENDING',
      http_status_code: null,
      response_body: null,
      sent_at: new Date(),
      attempt_count: 1,
    });
    await attemptRepository.recordOutcome(sendingAttempt.id, {
      status: 'SENT',
      http_status_code: 200,
      response_body: 'ok',
    });
    const { items: afterControl } = await attemptRepository.listByWebhook(webhook.id, {
      limit: 10,
    });
    expect(afterControl.find((item) => item.id === sendingAttempt.id)?.status).toBe('SENT');
  });
});
