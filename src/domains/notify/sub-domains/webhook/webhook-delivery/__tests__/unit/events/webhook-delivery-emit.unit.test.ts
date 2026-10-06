import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '@/core/events/event-bus.js';
import { NOTIFY_EVENT } from '@/domains/notify/sub-domains/webhook/events/notify.events.js';
import { emitWebhookDeliveryRequested } from '@/domains/notify/sub-domains/webhook/webhook-delivery/events/webhook-delivery-emit.js';

const { createPendingWebhookDeliveryAttemptMock } = vi.hoisted(() => ({
  createPendingWebhookDeliveryAttemptMock: vi.fn(),
}));

vi.mock(
  '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js',
  () => ({
    createPendingWebhookDeliveryAttempt: createPendingWebhookDeliveryAttemptMock,
  }),
);

const emitSpy = vi.spyOn(eventBus, 'emit');

describe('webhook-delivery-emit', () => {
  beforeEach(() => {
    emitSpy.mockClear();
    createPendingWebhookDeliveryAttemptMock.mockReset();
    createPendingWebhookDeliveryAttemptMock.mockResolvedValue({
      publicId: 'wda_9z3rura5kqvcv8zggriym',
    });
  });

  it('emitWebhookDeliveryRequested emits WEBHOOK_DELIVERY_REQUESTED with the public id only', async () => {
    await emitWebhookDeliveryRequested({
      webhookId: 2,
      eventType: 'subscription.updated',
      payload: { id: 'inv_1' },
    });

    expect(emitSpy).toHaveBeenCalledOnce();
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NOTIFY_EVENT.WEBHOOK_DELIVERY_REQUESTED,
        payload: { delivery_attempt_public_id: 'wda_9z3rura5kqvcv8zggriym' },
      }),
    );
  });

  it('emits nothing when the logical event is already being delivered', async () => {
    // createPendingWebhookDeliveryAttempt returns null when the (webhook_id, event_key) partial
    // unique index already holds a row — a second job for it would be a duplicate signed POST.
    createPendingWebhookDeliveryAttemptMock.mockResolvedValue(null);

    await emitWebhookDeliveryRequested({
      webhookId: 2,
      eventType: 'subscription.updated',
      payload: { id: 'inv_1' },
      eventKey: 'evt_duplicate',
    });

    expect(emitSpy).not.toHaveBeenCalled();
  });
});
