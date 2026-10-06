import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_QUEUE_NAME } from '@/domains/notify/sub-domains/notification/queues/notification.queue.js';
import { WEBHOOK_DELIVERY_QUEUE_NAME } from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';

const getStateMock = vi.fn();

vi.mock('@/infrastructure/resilience/circuit-breaker.js', () => ({
  resendCircuit: { getState: getStateMock },
}));

describe('dlq-auto-retry-circuit.util', () => {
  beforeEach(() => {
    getStateMock.mockReset();
  });

  it('requires the Resend circuit CLOSED for notification replays (their email channel)', async () => {
    getStateMock.mockResolvedValueOnce('OPEN');
    const { isDeadLetterSourceQueueCircuitClosed } = await import(
      '@/infrastructure/queue/dlq/dlq-auto-retry-circuit.util.js'
    );
    expect(await isDeadLetterSourceQueueCircuitClosed(NOTIFICATION_QUEUE_NAME)).toBe(false);

    getStateMock.mockResolvedValueOnce('HALF_OPEN');
    expect(await isDeadLetterSourceQueueCircuitClosed(NOTIFICATION_QUEUE_NAME)).toBe(false);

    getStateMock.mockResolvedValueOnce('CLOSED');
    expect(await isDeadLetterSourceQueueCircuitClosed(NOTIFICATION_QUEUE_NAME)).toBe(true);
  });

  it('treats webhook-delivery as always eligible (no cluster circuit)', async () => {
    const { isDeadLetterSourceQueueCircuitClosed } = await import(
      '@/infrastructure/queue/dlq/dlq-auto-retry-circuit.util.js'
    );
    expect(await isDeadLetterSourceQueueCircuitClosed(WEBHOOK_DELIVERY_QUEUE_NAME)).toBe(true);
    expect(getStateMock).not.toHaveBeenCalled();
  });
});
