import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const enqueueWebhookDeliveryMock = vi.fn();
const findOrganizationPublicIdByDeliveryAttemptPublicIdMock = vi.fn();

vi.mock(
  '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js',
  () => ({
    enqueueWebhookDelivery: (...arguments_: unknown[]) => enqueueWebhookDeliveryMock(...arguments_),
  }),
);

vi.mock(
  '@/domains/notify/sub-domains/webhook/webhook-delivery/webhook-delivery.repository.js',
  () => ({
    findOrganizationPublicIdByDeliveryAttemptPublicId: (...arguments_: unknown[]) =>
      findOrganizationPublicIdByDeliveryAttemptPublicIdMock(...arguments_),
  }),
);

describe('webhook delivery event handlers', () => {
  let eventBus: typeof import('@/core/events/event-bus.js').eventBus;
  let runWithOnCommitScope: typeof import('@/core/events/event-bus.js').runWithOnCommitScope;
  let NOTIFY_EVENT: typeof import('@/domains/notify/sub-domains/webhook/events/notify.events.js').NOTIFY_EVENT;

  beforeAll(async () => {
    // One cold import + handler registration for the file — avoids per-test
    // `vi.resetModules()` + event-bus re-import that flakes under parallel fork load.
    const eventBusModule = await import('@/core/events/event-bus.js');
    const notifyEvents = await import(
      '@/domains/notify/sub-domains/webhook/events/notify.events.js'
    );
    const { registerWebhookDeliveryEventHandlers } = await import(
      '@/domains/notify/sub-domains/webhook/webhook-delivery/events/webhook-delivery.event-handlers.js'
    );
    eventBus = eventBusModule.eventBus;
    runWithOnCommitScope = eventBusModule.runWithOnCommitScope;
    NOTIFY_EVENT = notifyEvents.NOTIFY_EVENT;
    registerWebhookDeliveryEventHandlers();
  }, 60_000);

  beforeEach(() => {
    enqueueWebhookDeliveryMock.mockReset();
    findOrganizationPublicIdByDeliveryAttemptPublicIdMock.mockReset();
    findOrganizationPublicIdByDeliveryAttemptPublicIdMock.mockResolvedValue('org_public_test_99');
  });

  it('enqueues webhook delivery on notify.webhook_delivery.requested', async () => {
    await runWithOnCommitScope(async () => {
      await eventBus.emit({
        type: NOTIFY_EVENT.WEBHOOK_DELIVERY_REQUESTED,
        payload: { delivery_attempt_public_id: 'wda_attempt99' },
        timestamp: new Date(),
      });
      await eventBus.flushOnCommit();
    });

    expect(findOrganizationPublicIdByDeliveryAttemptPublicIdMock).toHaveBeenCalledWith(
      'wda_attempt99',
    );
    // The public id is the only handle the job carries — no bigserial crosses into Redis.
    expect(enqueueWebhookDeliveryMock).toHaveBeenCalledExactlyOnceWith({
      deliveryAttemptPublicId: 'wda_attempt99',
      organizationPublicId: 'org_public_test_99',
    });
  });

  it('enqueues webhook delivery immediately when no HTTP onCommit scope is active', async () => {
    await eventBus.emit({
      type: NOTIFY_EVENT.WEBHOOK_DELIVERY_REQUESTED,
      payload: { delivery_attempt_public_id: 'wda_attempt42' },
      timestamp: new Date(),
    });

    expect(enqueueWebhookDeliveryMock).toHaveBeenCalledExactlyOnceWith({
      deliveryAttemptPublicId: 'wda_attempt42',
      organizationPublicId: 'org_public_test_99',
    });
  });

  it('forwards the originating request id so the delivery logs join the request', async () => {
    await eventBus.emit({
      type: NOTIFY_EVENT.WEBHOOK_DELIVERY_REQUESTED,
      payload: { delivery_attempt_public_id: 'wda_attempt43' },
      timestamp: new Date(),
      requestId: 'request-43',
    });

    expect(enqueueWebhookDeliveryMock).toHaveBeenCalledExactlyOnceWith({
      deliveryAttemptPublicId: 'wda_attempt43',
      organizationPublicId: 'org_public_test_99',
      requestId: 'request-43',
    });
  });

  it('leaves the attempt PENDING for the reclaim sweep when the enqueue itself fails (Redis refused the write)', async () => {
    // It used to be marked FAILED (`enqueue_failed`) and was never sent. Now nothing touches the
    // row: the webhook-delivery-reclaim sweep re-enqueues it once Redis takes writes again, and
    // the failure never escapes the event bus into the originating request.
    enqueueWebhookDeliveryMock.mockRejectedValueOnce(new Error('redis down'));

    await eventBus.emit({
      type: NOTIFY_EVENT.WEBHOOK_DELIVERY_REQUESTED,
      payload: { delivery_attempt_public_id: 'wda_attempt44' },
      timestamp: new Date(),
    });

    expect(enqueueWebhookDeliveryMock).toHaveBeenCalledOnce();
  });

  it('does not enqueue an unscoped delivery when the attempt has no resolvable organization', async () => {
    // The handler resolves the organization so delivery is enqueued tenant-scoped. A null (attempt/organization gone)
    // makes it throw `organization_not_found`, which the handler CATCHES and logs — it must never
    // enqueue an organization-less delivery, and the throw must not escape the event bus (a failing
    // handler must not fail the originating request).
    findOrganizationPublicIdByDeliveryAttemptPublicIdMock.mockResolvedValue(null);

    await eventBus.emit({
      type: NOTIFY_EVENT.WEBHOOK_DELIVERY_REQUESTED,
      payload: { delivery_attempt_public_id: 'wda_attempt7' },
      timestamp: new Date(),
    });

    expect(enqueueWebhookDeliveryMock).not.toHaveBeenCalled();
  });
});
