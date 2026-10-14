---
name: be-idempotency-guard
description: Keeps clinozy-be request idempotency correct — the idempotencyRequired writes, listed live as `req` in the docs/routes.txt `I` column (X-Idempotency-Key → 422 when missing/reused, 409 in-flight), the post-commit Redis replay write (never in onSend), secret-bearing response bodies excluded from caching, and the client X-Idempotency-Key forwarded as Stripe's idempotencyKey on customer/subscription mutations. Use when adding or changing a mutating money/state route, the idempotency middleware or utils, the Stripe client, or the subscription controller/service.
trigger: src/shared/middlewares/core/idempotency.middleware.ts, src/infrastructure/payment/stripe.client.ts
triggerNote: Idempotency engine + idempotencyRequired writes + Stripe mutations
indexNote: X-Idempotency-Key writes, post-commit Redis replay, Stripe idempotencyKey
---

# Idempotency guard

The writes registered with `config: { idempotencyRequired: true }` require an `X-Idempotency-Key`; getting the replay, fingerprint, and Stripe-forwarding right is what makes a retried subscription-create safe end-to-end (no duplicate charge). This guard codifies the rules; contract tests (`src/tests/contract/stripe.contract.test.ts`) and unit tests (`src/tests/unit/utils/idempotency/**`) catch regressions.

## Mechanism

- Engine: `src/shared/middlewares/core/idempotency.middleware.ts` + `src/shared/utils/idempotency/**`. Applies to `POST/PUT/PATCH/DELETE`.
- **Key-format check** (global `onRequest`, `idempotencyOnRequest`): a malformed key on a write where the key is optional (and on an unknown path) → **422** `idempotencyKeyInvalid` at once — one status for one bad header (launch USERS-M6). On a required route it does nothing and leaves both rejections to the gate below. Key format: 16–255 chars, `/^[A-Za-z0-9._:~+/=-]+$/`.
- **Required-key gate** (route `preHandler`: `idempotencyClaimPreHandler` → `assertIdempotencyKeyPresentWhenRequired`): routes with `config.idempotencyRequired === true` throw `UnprocessableEntityError('errors:idempotencyKeyRequired')` → **422** when the `X-Idempotency-Key` header is missing, `errors:idempotencyKeyInvalid` → **422** when malformed. The `onRoute` hook appends this preHandler **after** the route's own `onRequest: [authenticate]` and `preHandler`s (step-up, permission guards), so an anonymous caller gets **401** and a caller without step-up or permission gets **403** before any 422.
- **Claim/replay** (route `preHandler`, after auth so anonymous callers never occupy keys): scope = active `org` JWT claim + actor (`userId` or `apiKeyPublicId`); **unauthenticated callers get no caching**. Redis key: `idempotency:<organization|none>:<actor>:<key>`. Request fingerprint = SHA-256(method + normalized route + canonical validated body, schema defaults included); every entry carries it. On a hit: fingerprint mismatch → **422** (`idempotency_key_reuse`); `completed` → replay stored response with header `x-idempotency-replay: true`; `in_flight` → **409**; an entry without a fingerprint (corrupt, not one the middleware wrote) is never replayed or overwritten → **409** until it expires. Tests seed entries with `buildInFlightIdempotencyEntry` / `buildCompletedIdempotencyEntry` (`src/tests/helpers/idempotency-entry.helper.ts`). Over the per-actor cap → **429** + `Retry-After`. Redis error on claim → **fail closed 503** + `Retry-After`.
- **Completed entry is written only after the DB transaction commits** — dispatched from `src/shared/middlewares/core/request-lifecycle.middleware.ts` (post-commit), never directly in `onSend`. Rollback/settle-failure → `DEL` the placeholder so the client can safely retry. TTL: placeholder = session TTL; completed = 24 h.
- **Never cache secrets:** `onSend` skips bodies > 100 KB or containing secret fields (`responseBodyContainsSecretFields`); token/secret-issuance routes are in `IDEMPOTENCY_EXCLUDED_ROUTE_PATTERNS` (`idempotency-fingerprint.util.ts`).

## The idempotencyRequired routes

Source of truth = the `config: { idempotencyRequired: true }` flag on each route registration (typed in `src/fastify.d.ts`); there is **no central array** and no hand-kept list or count anywhere. The live set is the `I` column of `docs/routes.txt` (`req`), repeated with its current count in the catalog's generated **IDEMPOTENCY-REQUIRED WRITES (n)** footer — regenerate with `pnpm routes:catalog`.

A few members, as examples only (not the set):

| Route | File |
| ----- | ---- |
| `POST /tenancy/organizations` | `tenancy/sub-domains/organization/organization.routes.ts` |
| `POST /billing/subscriptions` (key forwarded to Stripe) | `billing/sub-domains/subscription/subscription.routes.ts` |
| `POST /uploads` | `upload/upload.routes.ts` |
| `POST /app/appointments` | `app/sub-domains/appointments/appointments.routes.ts` |

Step-up-gated `/auth/me/*` routes are intentionally **not** in this set: their handlers dedupe
server-side. Hook order is not the reason — the required-key gate runs after route auth and the
step-up preHandler, so flagging one of them would still answer 401/403 before 422.

## When this guard triggers

`src/shared/middlewares/core/idempotency.middleware.ts` · `request-lifecycle.middleware.ts` · `src/shared/utils/idempotency/**` · `src/fastify.d.ts` · `src/domains/**/*.routes.ts` (declaring `idempotencyRequired`) · `src/infrastructure/payment/stripe.client.ts` · `billing/sub-domains/subscription/{subscription.controller,subscription.service}.ts` · `src/infrastructure/observability/idempotency-cardinality/**`.

## Enforcement checklist

- [ ] A **new externally-mutating write** (creates/charges/transfers state) gets `config: { idempotencyRequired: true }` — **merge it into the existing `config` object**, don't spread a rate-limit preset at top level or it drops the flag (see the inline warnings in `membership.routes.ts` / `organization.routes.ts`).
- [ ] Run `pnpm routes:catalog` so the route reads `req` in the catalog's `I` column. Docs point at the catalog instead of keeping a count or list, so there is nothing else to bump — never add one.
- [ ] Document the `X-Idempotency-Key` header in the route schema (keeps OpenAPI accurate); 409/422 are already in `docs/reference/api/response-codes.md`.
- [ ] **Stripe:** new mutation helpers in `stripe.client.ts` accept and forward `options.idempotencyKey` as Stripe's native `RequestOptions.idempotencyKey`; the controller reads the request header via `readIdempotencyKey` and threads it controller → service → client. Add a contract test asserting `matchHeader('idempotency-key', …)`.
- [ ] **New secret response fields** → add to `IDEMPOTENCY_SECRET_RESPONSE_FIELD_NAMES` / `RESPONSE_BODY_SECRET_FRAGMENTS`; new token-issuance routes → `IDEMPOTENCY_EXCLUDED_ROUTE_PATTERNS`.
- [ ] Keep cache keys scoped per actor + active organization (no anonymous caching); keep the per-actor rate key aligned with the cache-key actor segment.
- [ ] New key prefixes stay under `idempotency:*` so the cardinality sampler (`scheduler.ts` → `createIdempotencyCardinalityWorker`) counts them.

## Top failure modes

1. **Rolled-back txn replaying as 2xx** — prevented by the post-commit write in `request-lifecycle.middleware.ts`; never write the completed entry from `onSend`.
2. **Same key, different payload** → fingerprint mismatch 422 (canonical body serialization closes JSON key-order / undefined-drop collisions).
3. **Secret leakage via cached body** — `responseBodyContainsSecretFields` + excluded routes; name new single-use fields (`recovery_codes`, `download_url`, …).
4. **Spreading a rate-limit preset over the route `config`** silently drops `idempotencyRequired`.
5. **Redis outage** — required writes fail **closed** (503 + Retry-After); the cap/EVAL paths fail **open** so a soft limit never becomes a 5xx spike.

## Verify

```bash
pnpm test:contract                          # Stripe idempotency-key forwarding
pnpm test:unit                              # src/tests/unit/utils/idempotency/**
pnpm routes:catalog && pnpm docs:check      # route + OpenAPI sync
```

Related: [[be-api-contract-guard]] (headers + status policy), [[be-workers-events]] (Stripe webhook flow).
