/**
 * Keeps every Vitest run away from third parties — the main suite, the chaos suite and the
 * contract slice all import this for its side effect, right after the env loader: fake provider
 * credentials, no telemetry, and no network beyond this machine.
 *
 * @remarks
 * Keys are forced with `=`, never `??=`: the env loader layers the machine-local env file over the
 * shell, and `pnpm setup:local` copies the hosted development Stripe, Resend, S3, PostHog and
 * OpenTelemetry keys into it. With `??=` the suite ran with those real keys.
 *
 * Fake keys alone were not enough: a suite that created a subscription still reached
 * api.stripe.com, and one confirm path reached AWS S3 — passing only because the fake key was
 * refused. nock now refuses every HTTP(S) and `fetch` connection to a host that is not loopback,
 * so such a call fails at once, offline, instead of depending on a third party's answer.
 * Loopback stays open for the test servers and Toxiproxy's admin API; Postgres and Redis speak
 * their own protocols over raw sockets, which nock never touches. Contract tests register their
 * own interceptors on top; fixture recording (`CONTRACT_RECORD`) re-enables the network itself.
 *
 * Also removed: the S3 endpoint (a local MinIO URL changes presigned URLs), the separate BullMQ
 * Redis (queues must share the test prefix on the test Redis) and every telemetry sink.
 */
import nock from 'nock';

/** `host` or `host:port` of this machine — the only destinations a Vitest run may connect to. */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/;

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

for (const key of [
  'S3_ENDPOINT',
  'REDIS_BULLMQ_URL',
  'SENTRY_DSN',
  'POSTHOG_KEY',
  'POSTHOG_HOST',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
]) {
  delete process.env[key];
}

if (!nock.isActive()) {
  nock.activate();
}
nock.disableNetConnect();
nock.enableNetConnect((host) => LOOPBACK_HOST.test(host));
