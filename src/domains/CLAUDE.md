# Domains — clinozy-be

Claude Code loads this file when it works in `src/domains/`. It holds sections moved out of the root [`CLAUDE.md`](../../CLAUDE.md), which keeps a pointer to each; the root rules apply here too.

## Domain Structure

Domains live under `src/domains/<domain>/`. Each domain has sub-domains with this layout:

### Canonical layout

```text
src/domains/<domain>/
  <domain>.routes.ts          # Route registration (FastifyPluginAsync)
  <domain>.container.ts       # DI container (repos → services); export services for routes/controllers
  events/                     # Optional: register<Domain>EventHandlers() aggregator
    index.ts
  seed/                       # Optional: present when this level owns tables (see Seeding)
    index.ts                  # Domain root: exports a DomainSeedModule (name + dependsOn)
    <domain>.reference.seed.ts  # Idempotent reference/bootstrap data
    <domain>.bulk.seed.ts     # Scaled rows for tables this level owns
    <domain>.faker.ts         # Level-specific faker generators
  __tests__/                  # Domain e2e, domain-level unit, domain factories (see Testing)
    <domain>.test.ts
    factories/                # Optional: cross-sub-domain test helpers (e.g. tenancy permission.factory)
    unit/
  sub-domains/                # Multi-resource domains only (omit for audit, upload)
    <sub-domain>/             # Top-level resource (sibling under sub-domains/)
      <sub-domain>.controller.ts
      <sub-domain>.service.ts
      <sub-domain>.repository.ts
      <sub-domain>.dto.ts
      <sub-domain>.validator.ts
      <sub-domain>.serializer.ts
      <sub-domain>.types.ts
      <sub-domain>.schema.ts  # When this resource owns tables
      seed/                   # Optional: present when this resource owns tables
        index.ts              # Sub-domain: exports a SeedContribution (parent composes it)
        <sub-domain>.reference.seed.ts
        <sub-domain>.bulk.seed.ts
        <sub-domain>.faker.ts
      __tests__/              # Sub-domain unit, nested e2e (see Testing)
        unit/                 # incl. events/ — leaf event-handler suites (never events/__tests__/)
        <sub-domain>.test.ts  # Optional: dedicated route suite (tenancy organization children)
      events/                 # Optional: types, handlers, *-emit.ts
      queues/                 # Optional: BullMQ enqueue helpers
      workers/                # Optional: BullMQ processors
      <nested-sub-domain>/    # Optional: aggregate child (lifecycle tied to parent)
        <nested-sub-domain>.controller.ts
        ...                   # Same layer files as parent sub-domain
        seed/                 # Optional: SeedContribution when this child owns tables
        __tests__/unit/       # Tests co-located on the nested resource
```

**Import path:** `@/domains/<domain>/sub-domains/<sub-domain>/...` or, for nested children, `@/domains/<domain>/sub-domains/<parent>/<nested>/...`.

Flat domains (`audit`, `upload`) keep layers at domain root (no `sub-domains/`). Bundled domains (`auth`, `user`) use `sub-domains/` for resources; domain root may also have `<domain>.controller.ts`, `<domain>.service.ts`, etc.

### Domain and sub-domain mapping

| Domain (folder) | Sub-domains (folders)                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **audit**       | (single domain, no sub-domains)                                                                                                                                                                                                                                                             |
| **auth**        | auth-method (email verification-code, oauth as services in auth-method/; verification-token/ nested persistence module — service/repository/schema, no routes), auth-session, auth-mfa, auth-mfa-session (Redis MFA challenge-ticket store shared by auth-mfa/auth-webauthn), auth-webauthn |
| **user**        | user-settings, user-notification-preferences, user-data-export, user-bug-report                                                                                                                                                                                                             |
| **tenancy**     | organization (organization-settings, organization-notification-policy, organization-api-key), membership (membership-invitation, membership-additional-roles), member-roles (member-role-permission), permission                                                                                                             |
| **billing**     | plan, subscription, stripe-webhook                                                                                                                                                                                                                                                          |
| **notify**      | notification, webhook (webhook-event, webhook-delivery)                                                                                                                                                                                                                                     |
| **upload**      | (single domain, no sub-domains)                                                                                                                                                                                                                                                             |
| **app**         | the app's own records, Postgres schema `app` — one sub-domain per section of the launch route review; the full list: [`app/CLAUDE.md`](app/CLAUDE.md) |

**Permission resolution** (tenancy domain, not under `shared/`):

- `src/domains/tenancy/sub-domains/permission/authorization.service.ts` — resolve user organization permissions (Redis-cached)
- `src/domains/tenancy/sub-domains/permission/permission-cache.service.ts` — Redis cache helpers for permission sets

### File naming

- Domain/sub-domain folders: **singular** or **kebab-case** for multi-word (`member-roles`, `membership-invitation`).
- Files inside a sub-domain: **singular** for the main resource (`user.service.ts`, `organization.repository.ts`).
- Controllers export: `create<Resource>Controller(service)` or `create<Resource>Controller(container)` when multiple sub-domain services are wired.
- Always prefix sub-domain directories with parent domain name.

### Sub-domain nesting (sub-domains may contain sub-domains)

A **top-level sub-domain** is a direct child of `sub-domains/<name>/`. A **nested sub-domain** is a folder inside a parent sub-domain when the child’s lifecycle is tied to the parent aggregate.

| Rule                                                                                      | Example                                                                             |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Sibling resources** live under `sub-domains/` only                                      | `sub-domains/plan/`, `sub-domains/subscription/`                                    |
| **Nested sub-domains** live inside the parent sub-domain folder                           | `sub-domains/webhook/webhook-event/`                                                |
| **App sub-domains** nest what their main record owns the same way                         | `app/sub-domains/patients/patient-treatments/`, `app/sub-domains/branches/branch-rooms/` |
| **Organization children** nest under `organization/`                                      | `sub-domains/organization/organization-api-key/`, `organization-settings/`          |
| **Membership / member-roles children** nest under parent                                  | `sub-domains/membership/membership-invitation/`, `member-roles/member-role-permission/` |
| **Prefix** multi-word names with domain/resource name                                     | `organization-settings`, `membership-invitation`, `webhook-event`                       |
| **Implementation modules** (not separate API resources) stay as services in parent folder | `auth-method/email-login.service.ts`, `oauth/` under `auth-method/`                 |
| Prefer depth ≤ 4 under `domains/<domain>/` for new work                                   | Flatten if a nested folder has no distinct routes or tests                          |

Nested resources use the **same layer files** (controller, service, repository, validator, serializer, dto, types, schema) and the **same optional** `events/`, `queues/`, `workers/`, `__tests__/` as top-level sub-domains.

See **`docs/reference/architecture/domains-and-public-api-design.md`** for route strategies, tests, and examples.

## Queue Infrastructure — Domain-Owned Jobs and Processors

Adding or changing a queue, worker, cron or sweep: follow **[`docs/reference/runtime/queue-and-worker-rules.md`](../../docs/reference/runtime/queue-and-worker-rules.md)** — every rule (registration, job data, enqueue after commit, job identity and deduplication, lost-enqueue sweeps, provider outage pause, failure choice, database contexts, scheduler, capacity, tests) with the test that enforces it (rule: `agent-os/rules/be-queue-worker-conventions.mdc`; procedure: **be-workers-events**).

- **Infrastructure only**: Connection (Redis), **scheduler** (repeatable retention cron registry), **bootstrap** that registers schedulers and starts each worker.
- **Jobs and processors**: Live in **respective domains only** — never in `common` or `shared`.
- Layout:
  - `infrastructure/queue/`: `connection.ts`, `health.ts`, `scheduler.ts` (all `upsertJobScheduler` calls for retention), `dlq/dead-letter.ts` (per-queue `<name>-dlq` + final-failure Sentry), `worker-runtime/` (worker options + lifecycle), `bootstrap.ts`
  - `domains/<domain>/<sub-domain>/queues/*`: Queue definition + enqueue helpers
  - `domains/<domain>/<sub-domain>/workers/*`: BullMQ processor(s)
- **No** `infrastructure/queue/processors/` — processors live in domains.

## Domain events (in-process) vs BullMQ workers

These are **not** the same:

- **Event bus** (`src/core/events/event-bus.ts`): in-process, runs in the API process immediately after a successful service write. Handlers enqueue side effects and **must not** fail the HTTP request.
- **BullMQ workers** (`src/infrastructure/queue/bootstrap.ts`, `pnpm dev:worker`): async, durable jobs in Redis processed in a separate worker process (retries, DLQ).

Typical flow: `service` → `eventBus.emit` → handler → `recordOutboxEmail()` (+ `dispatchOutboxEmail()` on commit) → mail worker. Worker/runtime paths (no request transaction) call `recordOutboxEmail()` + `dispatchOutboxEmail()` directly.

- **Registration (two paths)** — bootstrap order matters:
  1. `buildApp()` → `registerEventHandlers()` ([`register-event-handlers.ts`](../core/events/register-event-handlers.ts)) **before** routes — auth + tenancy email handlers only.
  2. `registerRoutes()` → [`domain-containers.plugin.ts`](domain-containers.plugin.ts) → `registerNotifyContainer()` → `registerNotifyEventHandlers()` — notify handlers registered after the DI container is composed.
- **Rule:** Handlers that only enqueue mail (`recordOutboxEmail()`) or have no container deps → register via `register-event-handlers.ts`. Handlers that need repositories from the composition root → register in the domain’s `register*Container()` (notify today).
- **Example (core path):** `tenancy/sub-domains/membership/membership-invitation/` — service emits; handler calls `recordOutboxEmail()`.
- **Example (container path):** `notify/events/notify.event-handlers.ts` → `registerWebhookDeliveryEventHandlers()` — subscribes to `NOTIFY_EVENT.WEBHOOK_DELIVERY_REQUESTED` and enqueues outbound webhook delivery.

| Registrar                               | Event types (examples)                                                                | Side effect             |
| --------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------- |
| `registerAuthMethodEventHandlers`       | `AUTH_EVENT.EMAIL_VERIFICATION_CODE_REQUESTED`, `AUTH_EVENT.PASSWORD_RESET_REQUESTED` | Mail queue              |
| `registerMembershipInvitationEventHandlers` | `MEMBERSHIP_INVITATION_EVENT.CREATED`, `RESENT`                                           | Mail queue              |
| `registerNotifyEventHandlers`           | `NOTIFY_EVENT.WEBHOOK_DELIVERY_REQUESTED`                                             | BullMQ webhook delivery |
| `registerNotifyEventHandlers`           | `ORGANIZATION_EVENT.*`, `MEMBERSHIP_EVENT.*`, `SUBSCRIPTION_EVENT.*`                  | Webhook delivery attempts |
| `registerNotifyEventHandlers`           | `MEMBERSHIP_INVITATION_EVENT.ACCEPTED`, `DECLINED`                                    | In-app notification     |

## Drizzle ORM Conventions

- **Always use `snake_case`** for column property names in Drizzle schema definitions
- Column names must match the actual Postgres column names exactly
- Table names: plural, snake_case (`organizations`, `subscriptions`)
- Schema files are **co-located in domains**: `src/domains/<domain>/<sub-domain>/<sub-domain>.schema.ts`
- Shared `pgSchema` definitions live in `src/infrastructure/database/pg-schemas.ts`

## Seeding

- **Per-domain `seed/` dir**: Every folder that owns tables (domain, sub-domain, nested sub-domain) gets a co-located `seed/` directory holding `<name>.reference.seed.ts` (idempotent reference data), `<name>.bulk.seed.ts` (scaled rows for that level's tables), `<name>.faker.ts` (level-specific generators), and `index.ts`. Each domain still seeds **only its own tables** — no cross-domain insert logic inside domains.
- **Seed contract** (`src/scripts/seed/seed-contract.ts`): Each `seed/index.ts` exports a `SeedContribution` (`seedReference?` / `seedBulk?` hooks) **except** a top-level domain's, which exports a `DomainSeedModule` (`SeedContribution` plus `name` + `dependsOn`). Parents fold their children up with `composeContributions(...)` (nested sub-domain → sub-domain → domain). Cross-domain parent ids (organizations/users) flow through a `SeedRegistry` on the `SeedContext`: the user/tenancy seeders append created parents; downstream domains read them. This preserves "no cross-domain insert logic inside domains" — cross-domain wiring lives only in the orchestrator/context.
- **Orchestrator** (`src/scripts/seed/bulk.ts` + `bulk-config.ts`): Registers one `DomainSeedModule` per domain (`SEED_MODULES` in `src/scripts/seed/modules.ts`), topologically orders them by `dependsOn` (`orderModules` in `seed-contract.ts`), runs every `seedReference` first, then every `seedBulk`. Behind a production guard (`production-guard.ts`, `assertBulkSeedAllowed`); reproducible via `SEED`; idempotent (count-and-resume or `onConflictDoNothing`).
- **Three tiers** (all share the contract/seeders): `pnpm db:seed` (minimal/reference only), `pnpm db:seed:full` (fixed demo data, plus the demo clinic — `pnpm db:seed:demo-clinic`, `src/scripts/seed/demo-clinic.ts`), `pnpm db:seed:bulk` (scaled volume via profiles). Profiles `demo` / `edge` / `load` set base counts; `SCALE` multiplies volume-bearing counts (bounded by `HARD_CAP`); per-knob env overrides `BULK_ORGS`, `BULK_USERS_PER_ORG`, `BULK_AUDIT_MONTHS`, `BULK_AUDIT_PER_ORG_PER_MONTH`. Example: `BULK_PROFILE=load SCALE=5 pnpm db:seed:bulk`.
- **Route alignment**: Seed data should support what the API exposes. When routes are added, removed, or updated, run **be-route-catalog** skill (`pnpm routes:catalog`) and **be-seed-maintainer** so seeds stay aligned with routes.
- **Conventions and detail**: scoped rule `.cursor/rules/be-seed-conventions.mdc` (auto-attaches under `src/domains/**` and `src/scripts/seed/**`); skill `.cursor/skills/be-seed-maintainer/SKILL.md`; overview `src/scripts/seed/seed.overview.md`. The domain-structure validator allows `seed/` at domain root.
