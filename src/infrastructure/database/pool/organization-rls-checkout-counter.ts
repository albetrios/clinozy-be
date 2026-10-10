/** In-process count of in-flight RLS transaction checkouts (one per unit of work). */
let activeOrganizationRlsCheckouts = 0;

/**
 * Which code path opened the RLS checkout being measured:
 * - `scoped_context` — a `withAppDatabaseContext` unit of work (requests, workers, scripts).
 * - `session_context` — a pre-auth session-artifact unit of work.
 * - `maintenance_context` — a `withMaintenanceDatabaseContext` bypass transaction.
 */
export type OrganizationRlsCheckoutPath =
  | 'scoped_context'
  // A5 all-scope coverage: session (pre-auth artifact) and maintenance (bypass)
  // pattern transactions also hold pooled checkouts — counted so the
  // pool-exhaustion alerter and hold histogram see the WHOLE checkout load
  // (retention sweeps can hold long transactions), not just organization-scoped work.
  | 'session_context'
  | 'maintenance_context'
  // `withTransaction` — the unscoped transactions of the sign-in flows.
  | 'plain_transaction';

/** One completed organization-RLS checkout: how long the pooled connection was held and by which path. */
export type OrganizationRlsCheckoutHoldSample = {
  readonly path: OrganizationRlsCheckoutPath;
  readonly durationSeconds: number;
};

/** Sink for completed checkout hold samples (wired to the Prometheus histogram by the metrics stack). */
export type OrganizationRlsCheckoutHoldObserver = (
  sample: OrganizationRlsCheckoutHoldSample,
) => void;

let checkoutHoldObserver: OrganizationRlsCheckoutHoldObserver | null = null;

/** Increments the in-process organization-RLS checkout gauge when a pooled checkout is acquired. */
export function incrementOrganizationRlsCheckoutCount(): void {
  activeOrganizationRlsCheckouts += 1;
}

/** Decrements the gauge on transaction commit/rollback; clamps to zero to tolerate replay/test drift. */
export function decrementOrganizationRlsCheckoutCount(): void {
  if (activeOrganizationRlsCheckouts > 0) {
    activeOrganizationRlsCheckouts -= 1;
  }
}

/**
 * Current count of in-flight organization-scoped RLS transaction checkouts —
 * read by the DB-pool exhaustion alerter to detect saturation before postgres.js
 * starts queuing, and exported as the `database_rls_active_checkouts` gauge.
 */
export function getActiveOrganizationRlsCheckoutCount(): number {
  return activeOrganizationRlsCheckouts;
}

/**
 * Registers the sink that receives every {@link OrganizationRlsCheckoutHoldSample}. The metrics
 * stack registers a sink that observes the `database_rls_checkout_hold_seconds` histogram; pass
 * `null` to detach. Kept dependency-free here so the hot DB-checkout paths never import prom-client.
 */
export function registerOrganizationRlsCheckoutHoldObserver(
  observer: OrganizationRlsCheckoutHoldObserver | null,
): void {
  checkoutHoldObserver = observer;
}

/**
 * Reports one completed checkout hold to the registered observer (no-op when none is registered,
 * e.g. metrics disabled). Never throws — metrics recording must not break a database checkout path.
 */
export function observeOrganizationRlsCheckoutHold(
  sample: OrganizationRlsCheckoutHoldSample,
): void {
  if (checkoutHoldObserver === null) {
    return;
  }
  checkoutHoldObserver(sample);
}

/**
 * When each unit of work still waiting for a pooled connection started waiting. A `Map` iterates in
 * insertion order, so the first entry is always the oldest waiter.
 */
const connectionWaitStartedAtMs = new Map<symbol, number>();

/** Marks a unit of work as waiting for a pooled connection; end it with {@link endConnectionWait}. */
export function beginConnectionWait(): symbol {
  const waitToken = Symbol('connection-wait');
  connectionWaitStartedAtMs.set(waitToken, performance.now());
  return waitToken;
}

/** Ends a wait begun by {@link beginConnectionWait} (connection claimed, or the unit settled); idempotent. */
export function endConnectionWait(waitToken: symbol): void {
  connectionWaitStartedAtMs.delete(waitToken);
}

/**
 * How long (ms) the oldest unit of work still waiting for a pooled connection has waited; `0` when
 * none waits. Read by the overload guard: a queue the pool drains in milliseconds never ages, a
 * slow database makes it age fast.
 */
export function getOldestConnectionWaitMs(): number {
  const oldest = connectionWaitStartedAtMs.values().next();
  return oldest.done ? 0 : performance.now() - oldest.value;
}

/** Test-only: reset checkout counter and detach the hold observer between Vitest cases. */
export function resetOrganizationRlsCheckoutCountForTests(): void {
  activeOrganizationRlsCheckouts = 0;
  checkoutHoldObserver = null;
  connectionWaitStartedAtMs.clear();
}
