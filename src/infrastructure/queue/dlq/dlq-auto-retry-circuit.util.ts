import { NOTIFICATION_QUEUE_NAME } from '@/domains/notify/sub-domains/notification/queues/notification.queue.js';
import { resendCircuit, type CircuitBreaker } from '@/infrastructure/resilience/circuit-breaker.js';

const SOURCE_QUEUE_TO_CIRCUIT: Readonly<Record<string, CircuitBreaker>> = {
  // A notification's email channel sends through Resend.
  [NOTIFICATION_QUEUE_NAME]: resendCircuit,
};

/**
 * Returns whether the cluster-wide outbound circuit for a replayable source queue is CLOSED.
 *
 * @remarks
 * - **Algorithm:** maps notification → Resend; webhook-delivery has no shared Redis circuit
 *   (per-webhook opossum breakers) and is always treated as closed. Mail and Stripe webhook jobs
 *   are not replayed from the DLQ (their rows carry their own retry), so they have no entry.
 * - **Failure modes:** relies on {@link CircuitBreaker.getState} Redis fallback semantics.
 * - **Side effects:** read-only Redis GET on the circuit key.
 * - **Notes:** HALF_OPEN and OPEN both block automated replay so probes are not amplified.
 */
export async function isDeadLetterSourceQueueCircuitClosed(sourceQueue: string): Promise<boolean> {
  const circuit = SOURCE_QUEUE_TO_CIRCUIT[sourceQueue];
  if (!circuit) return true;
  const state = await circuit.getState();
  return state === 'CLOSED';
}
