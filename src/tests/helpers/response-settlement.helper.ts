import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Upper bound on waiting for in-flight `onResponse` hooks. A hook that never finishes is a bug the
 * test's own assertions will surface; this cap only keeps a helper from hanging the suite on it.
 */
const RESPONSE_SETTLEMENT_TIMEOUT_MS = 5_000;

type ResponseSettlementTracker = {
  readonly trackedRequests: WeakSet<FastifyRequest>;
  pendingResponses: number;
  waiters: Array<() => void>;
};

const trackers = new WeakMap<FastifyInstance, ResponseSettlementTracker>();

function releaseWaiters(tracker: ResponseSettlementTracker): void {
  if (tracker.pendingResponses > 0) return;
  const waiters = tracker.waiters;
  tracker.waiters = [];
  for (const release of waiters) release();
}

/**
 * Registers the hooks that let tests wait for a response's `onResponse` work — the idempotency
 * entry and the post-commit dispatch flush — which still runs after `app.inject()` resolves.
 *
 * @remarks
 * Call before `app.ready()`. Both hooks are added last at the root, so the `onResponse` hook runs
 * after every hook the app registered (Fastify runs them in registration order) and marks the
 * request settled only once that work is done. A request answered by an earlier `onRequest` hook
 * is never counted: none of the post-response work applies to it.
 */
export function trackResponseSettlement(app: FastifyInstance): void {
  const tracker: ResponseSettlementTracker = {
    trackedRequests: new WeakSet(),
    pendingResponses: 0,
    waiters: [],
  };
  trackers.set(app, tracker);
  app.addHook('onRequest', async (request) => {
    tracker.trackedRequests.add(request);
    tracker.pendingResponses += 1;
  });
  app.addHook('onResponse', async (request) => {
    if (!tracker.trackedRequests.has(request)) return;
    tracker.trackedRequests.delete(request);
    tracker.pendingResponses -= 1;
    releaseWaiters(tracker);
  });
}

/**
 * Resolves once every response the app has started has finished its `onResponse` hooks; resolves
 * at once for an app built without {@link trackResponseSettlement}.
 */
export async function waitForResponseSettlement(app: FastifyInstance): Promise<void> {
  const tracker = trackers.get(app);
  if (!tracker || tracker.pendingResponses === 0) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, RESPONSE_SETTLEMENT_TIMEOUT_MS);
    tracker.waiters.push(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
