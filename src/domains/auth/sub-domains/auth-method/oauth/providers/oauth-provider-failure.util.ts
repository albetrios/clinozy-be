import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';
import { ServiceUnavailableError, UnauthorizedError } from '@/shared/errors/index.js';

/** Statuses in the 4xx range that mean the provider is throttling us, not refusing the user. */
const PROVIDER_THROTTLED_STATUSES: ReadonlySet<number> = new Set([408, 429]);

/** Inputs for {@link toOAuthProviderFailure}. */
export interface ToOAuthProviderFailureOptions {
  /** What the outbound call threw. */
  error: unknown;
  /** The 401 message when the provider refused this code or token. */
  rejectedMessageKey: string;
}

/**
 * True when an OAuth provider answered a 4xx that refuses this code or token — the user's
 * sign-in failed, not the provider.
 */
export function isOAuthProviderRejection(error: unknown): boolean {
  return (
    error instanceof ExternalServiceError &&
    error.category === 'http_4xx' &&
    !(error.status !== undefined && PROVIDER_THROTTLED_STATUSES.has(error.status))
  );
}

/**
 * The error to throw for a failed call to an OAuth provider.
 *
 * @remarks
 * - **Algorithm:** a 4xx refusing the code or token ({@link isOAuthProviderRejection}) → 401 with
 *   `rejectedMessageKey`; anything else (network, timeout, 5xx, throttling, a body that is not
 *   JSON) → 503 `errors:oauthProviderUnavailable`, so the client retries instead of telling the
 *   user their sign-in was refused.
 * - **Failure modes:** none — pure mapping; a non-outbound error passes through unchanged.
 * - **Side effects:** none (`outboundCall` already logged the failure).
 * - **Notes:** shared by the Google and GitHub providers.
 */
export function toOAuthProviderFailure({
  error,
  rejectedMessageKey,
}: ToOAuthProviderFailureOptions): unknown {
  if (isOAuthProviderRejection(error)) {
    return new UnauthorizedError(rejectedMessageKey);
  }
  if (error instanceof ExternalServiceError) {
    return new ServiceUnavailableError('errors:oauthProviderUnavailable');
  }
  return error;
}
