import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  Sentry,
  captureMessage,
  flushSentry,
  initSentry,
} from '@/infrastructure/observability/sentry/sentry.js';
import {
  capturePostHogEvent,
  getPostHogClient,
  initPostHog,
  shutdownPostHog,
} from '@/infrastructure/observability/posthog/posthog.js';
import { registerThirdPartyContractTestIsolationHooks } from './helpers/register-contract-test-hooks.js';

registerThirdPartyContractTestIsolationHooks();

/**
 * Live check of the telemetry sinks (`pnpm test:contract:live`): one tagged event each through our
 * own Sentry and PostHog modules, and the ingest endpoint accepts it. (OpenTelemetry is not
 * checked — no collector is configured.)
 */
describe('Telemetry sinks (live)', () => {
  const runId = randomUUID();

  it('Sentry ingests a tagged message sent through captureMessage', async () => {
    initSentry();
    const client = Sentry.getClient();
    expect(client).toBeDefined();
    // Sentry keeps no transport for a DSN it cannot parse, and then sends nothing at all.
    expect(
      client!.getDsn(),
      'SENTRY_DSN is not a Sentry project DSN (https://<key>@<organization>.ingest.sentry.io/<project id>)',
    ).toBeDefined();
    const responses: Array<number | undefined> = [];
    client!.on('afterSendEvent', (_event, response) => {
      responses.push(response?.statusCode);
    });

    captureMessage(`contract live check ${runId}`, {
      level: 'info',
      extra: { purpose: 'contract-live' },
    });
    await flushSentry(10_000);

    expect(responses).toEqual([200]);
  });

  it('PostHog accepts a tagged event sent through capturePostHogEvent', async () => {
    initPostHog();
    const client = getPostHogClient();
    expect(client).not.toBeNull();
    const errors: unknown[] = [];
    client!.on('error', (error) => errors.push(error));

    capturePostHogEvent({
      distinctId: `contract-live-${runId}`,
      event: 'contract_live_check',
      properties: { purpose: 'contract-live' },
    });
    await shutdownPostHog();

    expect(errors).toEqual([]);
  });
});
