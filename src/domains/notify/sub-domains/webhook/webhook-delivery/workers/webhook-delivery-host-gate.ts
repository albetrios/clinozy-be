import { WEBHOOK_DELIVERY_PER_HOST_IN_FLIGHT_LIMIT } from '@/infrastructure/outbound/outbound-defaults.js';

/**
 * Thrown when a webhook delivery cannot start because its destination host already has
 * {@link WEBHOOK_DELIVERY_PER_HOST_IN_FLIGHT_LIMIT} requests in flight in this process.
 * The worker parks the job; the attempt row is not marked failed.
 */
export class WebhookDeliveryHostAtCapacity extends Error {
  readonly host: string;

  constructor(host: string) {
    super('webhook.delivery.host_at_capacity');
    this.name = 'WebhookDeliveryHostAtCapacity';
    this.host = host;
  }
}

const inFlightCountByHost = new Map<string, number>();

/**
 * Hostname of a webhook URL, lowercased, or null when the URL cannot be parsed.
 */
export function webhookDeliveryDestinationHost(webhookUrl: string): string | null {
  try {
    const hostname = new URL(webhookUrl).hostname;
    if (hostname.length === 0) {
      return null;
    }
    return hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Reserves one in-flight slot for `host`, or throws {@link WebhookDeliveryHostAtCapacity}.
 */
export function acquireWebhookDeliveryHostSlot(host: string): void {
  const inFlightCount = inFlightCountByHost.get(host) ?? 0;
  if (inFlightCount >= WEBHOOK_DELIVERY_PER_HOST_IN_FLIGHT_LIMIT) {
    throw new WebhookDeliveryHostAtCapacity(host);
  }
  inFlightCountByHost.set(host, inFlightCount + 1);
}

/**
 * Returns one in-flight slot reserved by {@link acquireWebhookDeliveryHostSlot}.
 */
export function releaseWebhookDeliveryHostSlot(host: string): void {
  const inFlightCount = inFlightCountByHost.get(host) ?? 0;
  if (inFlightCount <= 1) {
    inFlightCountByHost.delete(host);
    return;
  }
  inFlightCountByHost.set(host, inFlightCount - 1);
}

/**
 * Clears in-flight host slots. Unit tests call this so one case cannot consume the next case's cap.
 */
export function resetWebhookDeliveryHostSlots(): void {
  inFlightCountByHost.clear();
}
