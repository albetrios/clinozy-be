/**
 * Keeps every Vitest run away from third parties — the main suite, the chaos suite and the
 * contract slice all import this for its side effect, right after the env loader: fake provider
 * credentials, no telemetry, and no network beyond this machine.
 *
 * @remarks
 * Keys are forced with `=`, never `??=`: the env loader layers the machine-local env file over the
 * shell, and `pnpm setup:local` copies the hosted development Stripe, Resend, S3 and PostHog
 * keys into it. With `??=` the suite ran with those real keys.
 *
 * Fake keys alone were not enough: a suite that created a subscription still reached
 * api.stripe.com, and one confirm path reached AWS S3 — passing only because the fake key was
 * refused. nock now refuses every HTTP(S) and `fetch` connection to a host that is not loopback,
 * so such a call fails at once, offline, instead of depending on a third party's answer.
 * Loopback stays open for the test servers and Toxiproxy's admin API. nock 15 intercepts every
 * socket, not only HTTP; the pinned `@mswjs/interceptors` patch (`pnpm-workspace.yaml`) lets
 * loopback ones reach Node.js untouched, so Postgres, Redis and Toxiproxy's proxies behave — and
 * fail — exactly as without nock. Contract tests register their own interceptors on top.
 *
 * Also removed: the S3 endpoint (a local MinIO URL changes presigned URLs), the separate BullMQ
 * Redis (queues must share the test prefix on the test Redis) and every telemetry sink.
 *
 * The one exception is `pnpm test:contract:live` (`LIVE_PROVIDER_CONTRACTS=true`): the
 * `*.live.contract.test.ts` specs check the real providers, so that run keeps the configured
 * sandbox keys and telemetry sinks and may reach the network. It refuses a live Stripe key, a
 * bucket whose name says production, and any lane but the contract slice.
 */
import nock from 'nock';

/** `host` or `host:port` of this machine — the only destinations a Vitest run may connect to. */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/;

/** Whether this run is the opt-in live provider check (`pnpm test:contract:live`). */
export function isLiveProviderContractRun(): boolean {
  return process.env.LIVE_PROVIDER_CONTRACTS === 'true';
}

/** Refuses a live run that is not the contract slice, or whose keys are not sandbox ones. */
function assertLiveProviderRunIsSandboxed(): void {
  // Set only by tooling/vitest/contract.config.ts in live mode: any other config (`pnpm test`, a
  // single lane) refuses, so a stray flag can never run the whole suite against real providers.
  if (process.env.LIVE_PROVIDER_CONTRACT_CONFIG !== 'true') {
    throw new Error(
      'LIVE_PROVIDER_CONTRACTS runs only the contract slice: pnpm test:contract:live',
    );
  }
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    throw new Error('Live provider contracts need a Stripe sandbox key (sk_test_…)');
  }
  if (/prod/i.test(process.env.S3_BUCKET ?? '')) {
    throw new Error('Live provider contracts refuse a bucket whose name says production');
  }
}

/** Fake provider credentials and no telemetry sinks — every run but the live one. */
function useFakeProviderKeys(): void {
  process.env.STRIPE_SECRET_KEY = 'sk_test_contract_fixture_key_for_nock_stubs';
  process.env.STRIPE_WEBHOOK_SECRET =
    'whsec_test_contract_fixture_webhook_signing_must_be_minimum_32characters';
  process.env.RESEND_API_KEY = 're_test_contract_fixture_key';
  // EMAIL_FROM_ADDRESS is required by the env schema whenever RESEND_API_KEY is set.
  process.env.EMAIL_FROM_ADDRESS = 'noreply@example.com';
  process.env.S3_BUCKET = 'contract-test-bucket';
  process.env.S3_REGION = 'us-east-1';
  process.env.S3_ACCESS_KEY_ID = 'test-s3-access-key-id';
  process.env.S3_SECRET_ACCESS_KEY = 'test-s3-secret-access-key';
  // The harness's uploads have no stored object (S3 is out of reach): the photo's location removal
  // (launch D79) is off unless a suite turns it on and answers the S3 calls.
  process.env.PATIENT_IMAGE_LOCATION_REMOVAL_ENABLED = 'false';

  for (const key of ['S3_ENDPOINT', 'SENTRY_DSN', 'POSTHOG_KEY', 'POSTHOG_HOST']) {
    delete process.env[key];
  }
}

if (isLiveProviderContractRun()) {
  assertLiveProviderRunIsSandboxed();
} else {
  useFakeProviderKeys();
}

delete process.env.REDIS_BULLMQ_URL;

if (isLiveProviderContractRun()) {
  // Real requests only: nock's pass-through breaks Node `http` clients (the AWS SDK, Sentry's
  // transport) even with the network enabled, so the live run takes nock out entirely.
  nock.restore();
} else {
  if (!nock.isActive()) {
    nock.activate();
  }
  nock.disableNetConnect();
  nock.enableNetConnect((host) => LOOPBACK_HOST.test(host));
}
