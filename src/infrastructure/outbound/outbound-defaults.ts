import { env } from '@/shared/config/env.config.js';
import {
  FIVE_SECONDS_MS,
  TEN_SECONDS_MS,
  THIRTY_SECONDS_MS,
} from '@/shared/constants/ttl.constants.js';
import {
  anthropicCircuit,
  metaCircuit,
  resendCircuit,
  s3Circuit,
  stripeCircuit,
  turnstileCircuit,
  type CircuitBreaker,
} from '@/infrastructure/resilience/circuit-breaker.js';
import { countsStripeErrorAsCircuitFailure } from '@/infrastructure/payment/stripe-error.util.js';
import { countsS3ErrorAsCircuitFailure } from '@/infrastructure/storage/s3-error.util.js';

/**
 * Closed set of external integrations that {@link outboundCall} understands. Adding a
 * new value here requires a matching entry in `OUTBOUND_DEFAULT_FACTORIES` (timeout +
 * optional circuit) so timeouts and breaker wiring stay consistent across call sites.
 */
export type OutboundIntegrationName =
  | 'stripe'
  | 's3'
  | 'resend'
  | 'meta'
  | 'anthropic'
  | 'webhook'
  | 'webhook-test'
  | 'oauth-google'
  | 'oauth-github'
  | 'captcha-turnstile';

/** Per-integration defaults (HTTP timeout + circuit breaker) applied when call sites omit overrides. */
export interface OutboundIntegrationDefaults {
  timeoutMs: number;
  circuit?: CircuitBreaker;
  /**
   * False for an error that is the upstream refusing one request rather than failing: the circuit
   * counts it as a success (see `outboundCall`). Set for every integration whose client turns a
   * 4xx answer into a thrown error — otherwise a burst of not-founds or declines opens the
   * circuit for every caller.
   */
  countsAsCircuitFailure?: (error: unknown) => boolean;
}

const OAUTH_HTTP_TIMEOUT_MS = TEN_SECONDS_MS;
const WEBHOOK_DELIVERY_TIMEOUT_MS = THIRTY_SECONDS_MS;
const WEBHOOK_TEST_TIMEOUT_MS = TEN_SECONDS_MS;
const TURNSTILE_HTTP_TIMEOUT_MS = FIVE_SECONDS_MS;
/** Wall-clock cap for S3 SDK calls (SDK also uses maxAttempts). */
const S3_HTTP_TIMEOUT_MS = THIRTY_SECONDS_MS;

type OutboundDefaultsFactory = () => OutboundIntegrationDefaults;

const OUTBOUND_DEFAULT_FACTORIES: Record<OutboundIntegrationName, OutboundDefaultsFactory> = {
  stripe: () => ({
    timeoutMs: env.STRIPE_HTTP_TIMEOUT_MS,
    circuit: stripeCircuit,
    countsAsCircuitFailure: countsStripeErrorAsCircuitFailure,
  }),
  s3: () => ({
    timeoutMs: S3_HTTP_TIMEOUT_MS,
    circuit: s3Circuit,
    countsAsCircuitFailure: countsS3ErrorAsCircuitFailure,
  }),
  resend: () => ({
    timeoutMs: env.RESEND_HTTP_TIMEOUT_MS,
    circuit: resendCircuit,
  }),
  meta: () => ({
    timeoutMs: env.META_HTTP_TIMEOUT_MS,
    circuit: metaCircuit,
  }),
  anthropic: () => ({
    timeoutMs: env.ANTHROPIC_HTTP_TIMEOUT_MS,
    circuit: anthropicCircuit,
  }),
  webhook: () => ({
    timeoutMs: WEBHOOK_DELIVERY_TIMEOUT_MS,
  }),
  'webhook-test': () => ({
    timeoutMs: WEBHOOK_TEST_TIMEOUT_MS,
  }),
  'oauth-google': () => ({
    timeoutMs: OAUTH_HTTP_TIMEOUT_MS,
  }),
  'oauth-github': () => ({
    timeoutMs: OAUTH_HTTP_TIMEOUT_MS,
  }),
  'captcha-turnstile': () => ({
    timeoutMs: TURNSTILE_HTTP_TIMEOUT_MS,
    circuit: turnstileCircuit,
  }),
};

/**
 * Returns timeout + circuit-breaker defaults for the given integration. Evaluated lazily
 * via factory functions so changes to env-derived values (e.g. `STRIPE_HTTP_TIMEOUT_MS`)
 * after boot are still picked up if process env is mutated under tests.
 */
export function resolveOutboundDefaults(
  name: OutboundIntegrationName,
): OutboundIntegrationDefaults {
  return OUTBOUND_DEFAULT_FACTORIES[name]();
}
