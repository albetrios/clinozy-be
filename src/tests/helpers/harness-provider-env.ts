/**
 * Fake provider credentials and no telemetry for every Vitest run — the main suite, the chaos
 * suite and the contract slice all import this for its side effect, right after the env loader.
 *
 * @remarks
 * Forced with `=`, never `??=`: the env loader layers the machine-local env file over the shell,
 * and `pnpm setup:local` copies the hosted development Stripe, Resend, S3, PostHog and
 * OpenTelemetry keys into it. With `??=` the suite ran with those real keys — integration tests
 * reached the real Stripe API with a developer's key and passed only because the call failed.
 * Contract tests stub these hosts with nock; nothing else may reach them.
 *
 * Also removed: the S3 endpoint (a local MinIO URL changes presigned URLs), the separate BullMQ
 * Redis (queues must share the test prefix on the test Redis) and every telemetry sink.
 */

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
  'PUBLIC_MEDIA_BASE_URL',
  'REDIS_BULLMQ_URL',
  'SENTRY_DSN',
  'POSTHOG_KEY',
  'POSTHOG_HOST',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
]) {
  delete process.env[key];
}

export {};
