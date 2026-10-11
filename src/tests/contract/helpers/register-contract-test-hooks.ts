import nock from 'nock';
import { afterAll, beforeAll, beforeEach } from 'vitest';

import { isLiveProviderContractRun } from '@/tests/helpers/harness-provider-env.js';
import { resetOutboundServiceCircuitBreakerState } from './circuit-reset.js';

let outboundContractIsolationHooksWereRegisteredOnce = false;

/**
 * Guards outbound sockets during contract runs and resets circuit breaker + nock mocks between specs.
 *
 * Subsequent imports are no-ops so every contract file can explicitly opt in once while Vitest attaches a single hook instance.
 */
export function registerThirdPartyContractTestIsolationHooks(): void {
  if (outboundContractIsolationHooksWereRegisteredOnce) {
    return;
  }
  outboundContractIsolationHooksWereRegisteredOnce = true;

  // The live provider run (`pnpm test:contract:live`) makes real requests: no nock at all, only
  // a fresh circuit breaker per spec.
  if (isLiveProviderContractRun()) {
    beforeEach(resetOutboundServiceCircuitBreakerState);
    return;
  }

  beforeAll(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
    // The harness (`harness-provider-env.ts`) refuses every non-loopback host for all runs.
    nock.disableNetConnect();
  });

  beforeEach(async () => {
    await resetOutboundServiceCircuitBreakerState();
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.cleanAll();
    nock.restore();
    nock.enableNetConnect();
  });
}
