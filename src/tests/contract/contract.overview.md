`src/tests/contract/`

# Contract tests

## Purpose

Outbound HTTP contract tests for the platform's third-party integrations: Stripe (subscription, customer, webhook), Resend (mail), S3 (presigned URLs), Cloudflare Turnstile (captcha), the Anthropic Messages API (the patients' AI ideas — headers, model, prompts, throttle and refusal classification), OAuth providers (Google + GitHub code exchange, userinfo, and the primary+verified email guard), and customer webhook endpoints. Uses `nock` to record / replay fixture interactions and pin our request shape against the upstream's documented API.

Vitest config: [tooling/vitest/contract.config.ts](tooling/vitest/contract.config.ts).

What this suite covers:

- Request shape matches upstream API expectations (path, method, headers, body fields).
- Response parsing matches our types (we don't ignore an unexpected field that becomes mandatory).
- Idempotency-Key forwarding to Stripe.
- Stripe write path (customer/subscription create/update/qty/cancel/resume, events list) AND the billing-account read + setup path (`GET /v1/invoices`, `GET /v1/payment_methods?type=card`, customer default-PM retrieve, `POST /v1/setup_intents`, subscription `latest_invoice.confirmation_secret` expand) — `stripe.contract.test.ts` + `stripe-billing-account.contract.test.ts`.
- Webhook signature verification on inbound (Stripe).
- Request-id forwarding on outbound customer webhooks.

What it does **not** cover by default: real network calls, latency (load suite), or business logic (domain suites). The opt-in `*.live.contract.test.ts` specs (`pnpm test:contract:live`, never in CI) make the real calls against the Stripe sandbox, Resend, the configured S3 bucket, Cloudflare's Turnstile test secrets, Sentry and PostHog.

## Test types

- **Per-upstream contract** — one file per provider with all the request shapes pinned.
- **Live provider check** — `<provider>.live.contract.test.ts`, the same wrappers against the real sandbox.

## How to run

```bash
pnpm test:contract
```

No Postgres / Redis / network required — `nock` intercepts every outbound request.

## Fixtures and helpers

- `fixtures/` — recorded HTTP request / response pairs.
- `contract-vitest-setup.ts` — registers `nock` activations + assertions per file.

## Dependencies

- **None** — fully offline. Runs in the CI quality slice. (The live specs need the provider keys and the network.)

## Failure modes

- **Stripe SDK upgrade changes the request shape** → contract test flags the diff; review whether the change is intended (then update the fixture) or a bug in our code.
- **Customer webhook handler emits a payload that doesn't pin** → the test will report which field changed; usually a serializer regression.

## Related docs

- [docs/reference/testing/contract-tests.md](docs/reference/testing/contract-tests.md)
