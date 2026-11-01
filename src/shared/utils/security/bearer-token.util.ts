import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/shared/config/env.config.js';

/**
 * Constant-time comparison of a Bearer authorization header against an expected token.
 */
export function isBearerTokenValid({
  authorizationHeader,
  expectedBearerToken,
}: {
  authorizationHeader: string | undefined;
  expectedBearerToken: string;
}): boolean {
  if (!authorizationHeader) {
    return false;
  }
  const expectedHeader = `Bearer ${expectedBearerToken}`;
  const provided = Buffer.from(authorizationHeader);
  const expected = Buffer.from(expectedHeader);
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

/**
 * Whether a request presents the deployment's metrics scrape token (`METRICS_SCRAPE_TOKEN`) as
 * `Authorization: Bearer <token>`. The one check behind the API `/metrics`, the internal ops
 * reads, and the worker's verbose `/readyz` body.
 *
 * @remarks
 * - **Algorithm:** reads `METRICS_SCRAPE_TOKEN` from the env and compares it with
 *   {@link isBearerTokenValid} (constant time).
 * - **Failure modes:** none thrown; an unset token means no request presents it (`false`).
 * - **Side effects:** none.
 */
export function isMetricsScrapeTokenPresented(authorizationHeader: string | undefined): boolean {
  const expectedBearerToken = getEnv().METRICS_SCRAPE_TOKEN;
  return Boolean(
    expectedBearerToken && isBearerTokenValid({ authorizationHeader, expectedBearerToken }),
  );
}
