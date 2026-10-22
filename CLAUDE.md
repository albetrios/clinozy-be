# Claude Code Guidelines for clinozy-be

## New requirements — intake format

For **any new requirement** (new domain, routes, worker, schema, etc.), use the format and checklist in **`docs/getting-started/requirement-intake.md`**. That doc defines what details to provide and which skills/rules to invoke so the AI can perform best and keep docs, routes, tests, and lint in sync. Consult **`agent-os/skills/be-skill-index/SKILL.md`** first, then run the skills listed for the requirement type.

A requirement that comes from a **design iteration** (`iterations/<iteration>/`) follows the iteration process in **Design iterations** below instead.

## Design iterations

A design iteration is one product/design change, recorded as `iterations/<type>-<topic>-<YYYY-MM-DD>-<id>/` (type `launch` · `feat` · `change` · `fix`). **Before opening or working on one, read [`iterations/CLAUDE.md`](iterations/CLAUDE.md)** — the folder, the questions to ask first (AskUserQuestion — never guess) and the eight steps; **`/be-iteration [iteration]`** walks it with the user.

## Reuse before you create

Before adding a helper, wrapper, env var, constant or pattern, find the one that already does the job and use it; create something new only when nothing fits. If an existing one is close but not right, improve it — or say in the PR why new is better — **in the same PR**, never leaving old and new side by side. Detail and examples: principle #3 in [`agent-os/docs/principles.md`](agent-os/docs/principles.md).

## AI agent references (`agent-os/`)

`agent-os/` at the repo root is the single source of truth for all AI tooling.
Cursor reads agents/skills/rules via symlinks (`.cursor/agents → agent-os/agents`, etc.).
Claude Code reads `agent-os/` directly via `.claude/` symlinks (`agents`, `skills`, `commands`, `hooks`) — there is intentionally **no** `.claude/rules`: Claude Code follows `CLAUDE.md`, while the `.mdc` rule files are Cursor's glob auto-attach (`.cursor/rules`).

| File                                                                   | Purpose                                                                                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`REVIEW.md`](REVIEW.md)                                               | Review-time severity + skip-path instructions for `/code-review`, `/be-pre-merge-review`, and review agents              |
| [`agent-os/docs/principles.md`](agent-os/docs/principles.md)           | Engineering principles + project identity (full detail)                                                               |
| [`agent-os/docs/skill-triggers.md`](agent-os/docs/skill-triggers.md)   | File pattern → skill map (replaces reading 25 sync rules)                                                             |
| [`agent-os/docs/agents-catalog.md`](agent-os/docs/agents-catalog.md)   | All 13 agents with descriptions and use-when                                                                          |
| [`agent-os/docs/platform-access.md`](agent-os/docs/platform-access.md) | How to invoke agents on Cursor, Claude Code, Codex                                                                    |
| [`agent-os/agents/`](agent-os/agents/)                                 | Agent definition files                                                                                                |
| [`agent-os/skills/`](agent-os/skills/)                                 | Skill definition files                                                                                                |
| [`agent-os/rules/`](agent-os/rules/)                                   | Cursor rule files (also accessible via `.cursor/rules/` symlink)                                                      |
| [`agent-os/hooks/`](agent-os/hooks/)                                   | Claude Code hook scripts                                                                                              |
| [`agent-os/commands/`](agent-os/commands/)                             | Cross-platform custom slash commands (Claude `.claude/commands`, Cursor `.cursor/commands`, Codex `~/.codex/prompts`) |

## Agent-os naming

Every agent-os item this repo owns (skill folder, agent file, command file, rule file, hook script and hook id) starts with `be-`, and a hook helper with `_be-`, so names stay unique when clinozy-be and clinozy-fe (whose items start with `fe-`) are loaded in one session. Skills installed from upstream keep their upstream names: the `agent-os/skills-lock.json` entries whose `sourceType` is not `local` (today `ponytail` and `ponytail-audit`). A skill's frontmatter `name` always equals its folder name. `pnpm agent-os:check` enforces both. The two prefixes are the one sanctioned short form beyond the wire literals in [be-full-names-only.mdc](.cursor/rules/be-full-names-only.mdc).

## Same task, same pattern in both repositories

clinozy-be and clinozy-fe share many tasks: CI actions, pre-push test selection, session hooks, agent-os tooling, failure issues. A task both repositories have uses **the same pattern in both**: the same rule shape, comment wording, test shape and PR title. The two differ only where a repository needs a different step (its own paths, language or file layout), and the PR says what differs and why. Before finishing a change here, check whether clinozy-fe has the same task; if it does, make the same change there in a sibling PR. The files kept byte-identical in both are listed in [`src/tests/unit/ci/mirrored-files.policy.unit.test.ts`](src/tests/unit/ci/mirrored-files.policy.unit.test.ts); everything else that shares a shape is a parallel implementation that follows this rule.

## API Contract (Non-Negotiable)

See **`agent-os/skills/be-api-contract-guard/SKILL.md`** (rule: `agent-os/rules/be-api-contract.mdc`):

- Route params: snake_case + semantic (`{plan_id}`, `{subscription_id}`, never `{id}`); entity-id params registered in `PARAM_NAME_TO_ENTITY` (non-entity params — `{provider}`, `{slug}` — are the only exemptions). The active organization is the signed `org` JWT claim — routes carry NO `{organization_id}` path segment; the active-organization resource is singular `/tenancy/organization` (sub-resources nest under it); switch active organization via `/auth/switch-to-personal` / `/auth/switch-to-organization`
- Public ids: Paddle-style `<prefix>_<21 [a-z0-9]>` via `generatePublicId(entity)`; external field is always `id`
- Body field casing: request body (`*.dto.ts`) and response body (`*.serializer.ts`) property keys are **snake_case** (`file_name`, `created_at`); the external id stays `id`; validation `errors[].field` values are snake_case too. Internal TS identifiers may stay camelCase. Exceptions passed through verbatim: third-party/browser-native payloads (Stripe webhooks, OAuth, WebAuthn W3C JSON) and JWT claims. Enforced by `src/tests/unit/api/snake-case-body-keys.policy.unit.test.ts`
- Method→status policy: success is **200** for every method except DELETE (**204**) — no exemptions (Stripe-shaped uniform model; 200 stays true for idempotent replays and upserts where 201 would lie). POST is middleware-enforced (`method-status-policy.middleware.ts` rewrites POST 201/202/204 → 200); the other methods are enforced by the `validate:route-success-coverage` gate
- Error codes: when to set 400/401/403/404/406/409/413/415/422/429 — see **`docs/reference/api/response-codes.md`** (400 on all POST/PATCH/PUT, omitted only when truly nothing to validate; 409/422 mutating only; never invent statuses)
- Headers: `Authorization: Bearer`, `X-Idempotency-Key` (required on the `idempotencyRequired` writes; see the `I` column in `docs/routes.txt`), `X-Captcha-Token` (public auth forms), `X-CSRF-Token` (refresh only), `Stripe-Signature` (Stripe-sent); ecosystem X- forms kept (`X-Request-Id`, `X-Api-Key`, `X-RateLimit-*`, …)

## Architecture Rules (Non-Negotiable)

- HTTP controllers **coordinate**, never enforce invariants
- Services express **intent**; they may wrap a unit of work in `withTransaction` for atomicity, but issue no raw SQL and own no DB connection — repositories own the SQL
- Postgres is the **only source of truth**
- Workers are **pull-based**, never push-based
- Cross-domain service imports are **allowed** for READ/WRITE where needed
- Cross-domain reads/writes are handled via service imports (no separate use-cases layer)

## Naming Conventions (Non-Negotiable)

Detail and examples live in scoped Cursor rules (auto-attach when editing `src/**/*.ts`):

- **[be-full-names-only.mdc](.cursor/rules/be-full-names-only.mdc)** — no abbreviations in identifiers OR prose (`organization` not `org`, incl. plurals/compounds); intentional compact WIRE literals are the only survivors — the `org_` public-id prefix, the JWT claim keys `org`/`sv`, third-party payloads, and the agent-os prefixes `be-`/`fe-`; Fastify `req`/`reply` exempt
- **[be-object-params.mdc](.cursor/rules/be-object-params.mdc)** — options objects for 2+ params; repos and framework callbacks exempt
- **[be-no-digits-in-names.mdc](agent-os/rules/be-no-digits-in-names.mdc)** — no digits in identifiers we own (`firstPage`, never `page1`); a digit is a version, a duplicate or a shrug. Exempt: the API `v1` segment, vendor/standard names (`S3`, `OAuth2`, `SHA256`), a third-party export renamed **at the import**, audit-finding citations in comments, digits in values, and the date stamp on a dated record (`migrations/<timestamp>_*.sql`, `iterations/<type>-<topic>-<YYYY-MM-DD>-<id>/`)
- Sub-domain folders **must** prefix with domain/resource name (`organization-settings`, `webhook-event`, …)

## Domain Structure

Domains live under `src/domains/<domain>/` (audit, auth, user, tenancy, billing, notify, upload, app), each with sub-domains and the same layer files. The canonical layout, the domain → sub-domain map (the app domain's in [`src/domains/app/CLAUDE.md`](src/domains/app/CLAUDE.md)), file naming, nesting, the queue/worker and event rules, Drizzle conventions and seeding: **[`src/domains/CLAUDE.md`](src/domains/CLAUDE.md)**. The infrastructure and shared trees: [`src/infrastructure/CLAUDE.md`](src/infrastructure/CLAUDE.md), [`src/shared/CLAUDE.md`](src/shared/CLAUDE.md).

## Key Patterns

- **Route flow**: HTTP Request → Middleware → Controller → Service → Repository
- **DI flow**: Container (repos → services) → Routes (controllers) → `src/routes.ts` (domain containers + route registration)
- **API versioning**: Major versions use `/api/v1`, …; additive/non-breaking changes ship on the same major, a breaking change gets a new major prefix — see **`docs/reference/api/api-versioning.md`** and `src/shared/utils/http/api-versioning.util.ts`.
- **Data lifecycle**: Soft-delete (`deleted_at`), revocation vs immutable billing ledgers, session/audit retention — see **`docs/reference/data/data-lifecycle-deletion.md`**.
- **Controllers**: Thin layer; export `create<Resource>Controller(service)` or `create<Resource>Controller(container)` returning handler map. Use `getRequestIdentifier()` and `requireAuth()` from `@/shared/utils/http/request.util.js`; the auth middleware eagerly attaches `request.principalScope`; controllers narrow it via `requireOrganizationScope(request)` (organization-required, 403) or `requireUserScope(request)` (real user required) and relay the scope into services.
- **Validation**: DTO (Zod schemas in `.dto.ts`), Validator (function-based, calls `.safeParse()`, throws `ValidationError`)
- **Serializer**: Function-based response shaping in `.serializer.ts` (e.g. `serializeOrganization(row)`)
- **Containers**: `<domain>.container.ts` handles DI; export services for routes/controllers. Multi-sub-domain domains (auth, user, billing, tenancy) wire sub-domain services via the container — controllers call the appropriate service directly.
- **Errors**: Typed errors from `src/shared/errors/index.ts`
- **Responses**: Helpers from `src/shared/utils/http/response.util.ts` (`successResponse`, `paginatedResponse`) + global formatting in `src/shared/middlewares/core/error-handler.middleware.ts`
- **i18n**: All user-facing response messages (error `detail`, validation `errors[].message`, success `message`) go through i18next. Use translation keys in errors and success payloads; error handler and controllers translate with `request.t()`. English is the default locale; add new keys to `src/shared/locales/en/` first, then other locales. See **`docs/reference/runtime/internationalization.md`**.
- **Request helpers**: `src/shared/utils/http/request.util.ts` exports `getRequestIdentifier(request)` and `requireAuth(request)` — use these in ALL controllers.
- **Auth**: Fastify auth plugin in `src/shared/middlewares/core/auth.middleware.ts`, decorates `request.auth` (JWT RS256 via `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`). Session cookie (`session_id`) CSRF model and Origin checks for refresh: **`docs/reference/security/csrf-and-session-cookies.md`**
- **Tenant**: `request.organizationId` is claim-derived by the auth middleware from the signed `org` claim; there is no tenant middleware and no request-wide database transaction
- **Organization context / RLS**: Organization context flows from the signed `org` JWT claim: the auth middleware attaches `request.principalScope` (and the claim-derived `request.organizationId`); the Postgres session variable `app.current_organization_public_id` is set per unit of work by `withAppDatabaseContext`. Workers and processors must not call `getRequestDatabase()` — it returns the GUC-less pool and throws in worker runtime (enforced by `no-direct-db-in-services.global.test.ts`, code review, and the `be-guard-edits.mjs` hook); importing DB-handle types or `setLocalDatabaseConfig` from `database-context-runtime` is allowed (e.g. `audit-outbox-drain.processor.ts`). Use the two context wrappers over the three scope patterns (`withAppDatabaseContext` with a `PRINCIPAL_SCOPE.REQUEST/.JOB/.VERIFIED`-minted scope or a pre-auth `SESSION_SCOPE.ARTIFACT` — the scope decides the GUCs; `withMaintenanceDatabaseContext` with a frozen `MAINTENANCE_SCOPE.<kind>` for bypasses) and pass the returned `databaseHandle` into `createWorker*Repository(databaseHandle)` factories or `runOrganizationScopedWorkerJob` / `runGlobalRetentionWorkerJob` / `runUserScopedWorkerJob` from `src/infrastructure/queue/worker-runtime/worker-processor.util.ts`. Tenant-scoped jobs must include `organizationPublicId` in the job payload. The context directory holds exactly two files — `src/infrastructure/database/contexts/database-context.ts` (the three scope patterns + registries) and `database-context-runtime.ts` (plumbing) — pinned by `context-directory-standard.policy.unit.test.ts`; the `app.global_retention_cleanup` RLS bypass clauses are defined in the consolidated baseline migration `migrations/00000000000000_init.sql`.
- **DB**: `src/infrastructure/database/connection.ts` singleton + Drizzle queries in repositories; every keyset list builds its page with `finishKeysetPage` (`src/shared/utils/http/list-query.util.ts`) from a `limit + 1` fetch
- **Config**: Environment variables from `src/shared/config/env.config.ts`. `NODE_ENV` is `local | development | production` (the enum rejects `test`/`staging`; the Vitest suite runs as `development`; an out-of-enum value fails loudly at boot). `development`/`production` are the two DEPLOY targets; `local` is a developer's machine (primary file `.env.local`). Runtime code **never** compares or branches on `NODE_ENV` — it is compared only in `env-schema.ts` (the enum field + `.refine()` constraints on parsed `data`). The pre-schema loader `load-env-files.ts` reads `NODE_ENV` solely to name the `.env.<NODE_ENV>` file (no comparison). Every environment-varying behaviour is an explicit env flag with a **static production-safe default** (+ a production `.refine()` for security flags); the dev value ships ACTIVE in `.env.example` and the test harness (`src/tests/setup.ts`) sets test values. Three non-negotiable env-flag principles (detail in the be-env-schema-add skill): (1) **conditions live in the env layer** — the `.refine()` in `env-schema.ts` owns every prod-forbidden/allowed-when rule, and runtime code reads one specific `env.FLAG` boolean without re-deriving the condition or combining flags; (2) **one thing → exactly one env variable** — never gate a single behaviour on two flags (`env.A && env.B`), e.g. the destructive wipe helpers gate on `env.TEST_MODE` **alone**; (3) **casing** — env vars are `UPPER_SNAKE_CASE`, while a `snake_case` name like `debug_verification_code` is an API body field, not an env var. Enforced by [`no-nodeenv-branching.global.test.ts`](src/tests/global/no-nodeenv-branching.global.test.ts), the `be-guard-edits.mjs` R4 pre-edit hook, and the be-env-schema-add skill. Env files are **root only**: `.env.example` is the single committed template; per-environment `.env.<environment>` files (e.g. `.env.development`, `.env.production`) and `.env.local` are gitignored. Hosted environment mapping lives in `tooling/setup/setup.config.json` (canonical); `pnpm github:sync` reads it directly. Project identity is generated from that manifest via `pnpm tool:generate-project-identity` — the runtime constants, the CI composite action, `.github/CODEOWNERS`, the production environment's reviewer handles, `package.json` identity fields, `sonar-project.properties`, and Compose `container_name:` values. Its `:check` mode (in `ci:quality`, `pnpm health` and pre-commit) additionally fails on any hardcoded project slug, GitHub owner, display name or brand name outside the generated targets and the self-validating `IDENTITY_LITERAL_ALLOWLIST`, and on any previous identity (`project.previousNames` / `previousOwners` in the manifest) left in the tree. Scaffold and push with `pnpm github:sync`. Consistency and remote drift: `pnpm github:sync --check`. Runtime loader (`src/shared/config/load-env-files.ts`) reads `.env.${NODE_ENV ?? 'local'}` (default `local`, matching the env schema — an unset NODE_ENV is a developer's machine), then layers the gitignored `.env.local` on top as a machine-local override (`.env.local` is gitignored **and** dockerignored, so it is absent in production — no runtime `NODE_ENV` guard needed). `.env.local` plays two roles from the one loader: with the default (unset) `NODE_ENV=local`, it IS the primary file (self-contained, the `!== primary` check skips the override step); when a DEPLOY target sets `NODE_ENV=development`/`production` explicitly, `.env.local` becomes the machine-local override layered on top of `.env.<environment>`. Scaffold a self-contained `.env.local` (`.env.example` + generated JWT keys/`SECRETS_ENCRYPTION_KEY` + localhost `DATABASE_URL`/`REDIS_URL`) with `pnpm setup:local` or `pnpm setup:local --only-env`; every run also fills the third-party API keys still on their placeholder (Stripe, Resend, S3, PostHog — `tooling/dev/external-credentials.ts`) from `.env.development`, else from the process environment, never overwriting a set value, and turns `TEST_MODE` on unless the file sets it (send-code then echoes the code, which clinozy-fe's code screen fills in; `.env.example` keeps it off, so no hosted file carries the echo); because the process environment beats `.env.local`, every run first stops on a `DATABASE_*_URL` there (a cloud environment's Variables, a shell export) that is remote or logs in as another role, or on a remote `REDIS_URL`. **A database is set up one way** — `prepareDatabase` ([`src/scripts/ops/db-prepare.ts`](src/scripts/ops/db-prepare.ts)) behind `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:seed:full` (`--reset` starts from an empty local database), so behind the Vitest global setups, `bootstrap.sh`, `pnpm setup:local`, `pnpm verify:base`, `pnpm dashboards:up`, every deploy and, compiled, inside the API image (`node dist/src/scripts/ops/db-prepare.js [--seed <level>]`, which runs the compiled migration runner): create (a local server only) → migrate → enable the three local database logins (`DATABASE_URL` → `clinozy_be_app`, `DATABASE_MAINTENANCE_URL` → `clinozy_be_maintenance`, `DATABASE_OPERATOR_URL` → `clinozy_be_operator`, per-machine passwords, `tooling/dev/local-database-logins.ts`; the migrations create the roles `NOLOGIN`) → seed → one database per test worker.

## Dependency Rules

- HTTP controllers may import: services (or container deps), `@/shared/utils/http/request.util.js`, `@/shared/utils/http/response.util.js`, shared errors
- Services may import: **same-domain** repositories, own validators/types, shared errors, `eventBus`, `logger`. For **cross-domain** reads/writes, import the other domain's **service** only — never its repository or schema.
- Repositories may import: DB connection, schema, own domain types, the shared pagination/list-query utils. Repositories may import other domains' **schemas** for joins only (same bounded context or documented exception).
- Containers may import: own domain repositories, services. Accept cross-domain deps as parameters. Export services for route registration.
- Routes may import: own domain controllers, container types. Must use `FastifyPluginAsync` pattern.

### Import paths

See **[be-import-paths.mdc](.cursor/rules/be-import-paths.mdc)** — `@/` in `src/`, `@tooling/` in tooling, same-folder `./` only, never `../`. Enforced by [`import-paths.global.test.ts`](src/tests/global/import-paths.global.test.ts).

## Context7 (version-wise backend docs)

This repo uses **Context7 MCP** for up-to-date, version-specific documentation. Scope is **backend only** (Fastify, Drizzle, BullMQ, Postgres, Node). Add `use context7` to prompts when asking about library APIs or setup; mention versions (e.g. Fastify 5, Drizzle 0.45) for version-specific docs.

## MCP servers (agent tooling)

Two committed, secret-free templates define the agent-only MCP set (each mirrored under [`agent-os/mcp/`](agent-os/mcp/)):

- **Default auto-start pair — [`.mcp.default.json`](.mcp.default.json): `be-codegraph` + `be-headroom`** (zero-config local CLIs, no token). `pnpm setup:local`, the session-start hook, and the cloud bootstrap declare both in the gitignored `.mcp.json` so they are present before the first prompt.
- **On-demand set — [`.mcp.example.json`](.mcp.example.json): the full set** (`be-context7`, `clinozy-be:api`, `neon`, `sentry`, `railway`, `aws`, `stripe`, `be-semgrep`, `be-sonarqube`, `redis`, `postman`, `resend`, `dashboards`, `serena`, `ast-grep`, `be-codegraph`, `be-headroom`; most need a provider token). The five clinozy-fe declares too carry the `be-` prefix, so a client that loads both repositories never runs one repository's server for the other; `pnpm mcp:setup` renames them in an existing `.mcp.json`. Scaffold with **`pnpm mcp:setup`** — all, or a subset by name (`pnpm mcp:setup stripe sentry`); `pnpm mcp:setup:default` for just the pair, `pnpm mcp:setup --list` for status (per-server runtime/token catalog: **`docs/integrations/agentic-third-party-tooling.md`**). The pair in `.mcp.default.json` mirrors its entries in `.mcp.example.json` — the `mcp-config` global test blocks drift.

On **Claude Code web** a session starts with the platform's servers, the environment's MCP settings (web UI), the user-level servers (`~/.claude.json`) and the `.mcp.json` of its working directory — a cloud session runs non-interactively, so Claude Code approves that file without a prompt. A single-repository session runs in the repository, so the default pair loads. A session that holds both repositories runs from their parent, where no repository's `.mcp.json` is read, so its servers are user-level: `pnpm agent-os:session-hooks` registers each repository's codegraph in `~/.claude.json` (pointed at it with `--path`), beside the one `headroom` that `install-headroom.sh` registers for both. A server added mid-session loads at the next start. Both repositories' Claude settings give each server 3 minutes to start (`env.MCP_TIMEOUT`, which `agent-os:session-hooks` carries to the parent too): on a freshly booted container codegraph and headroom started about 55 s after launch, past the 30 s default, and the first reply waits at most 5 s for MCP servers either way. `Composio`, `Descript`, and `Slack` are intentionally **not** part of this project. See **`docs/integrations/claude-code-web-environment.md`** and **`docs/integrations/agentic-third-party-tooling.md`**.

## Headroom (agent context compression)

All AI agents (Claude Code, Cursor, Codex) share the **Headroom MCP** server (part of the default auto-start MCP pair; wired in `.mcp.example.json` ↔ `agent-os/mcp/mcp.example.json`) as a context-compression layer. Route large, low-signal text — long command/CI/test output, logs, whole-file reads, RAG/search chunks — through `headroom_compress` before loading it into context (same answers, far fewer tokens); use `headroom_retrieve` when exact bytes are needed and `headroom_stats` to check savings. Do **not** compress small outputs or content applied verbatim (diffs, code to edit, migration SQL, secrets). Setup: `bash tooling/setup/agent/install-headroom.sh` (installs the version pinned in `tooling/setup/agent/tool-versions.sh`, then runs `headroom mcp install`). Detail: rule **`agent-os/rules/be-headroom-context-compression.mdc`** (`alwaysApply`).

## Keeping Docs and Skills in Sync

When **code or architecture changes**, consult **`.cursor/skills/be-skill-index/SKILL.md` first** — it maps what changed to which skill(s) to run (no duplicate invocations).

**Definition-of-done (every change):** a code change is finished only when its **own tests, cross-cutting test suites, docs, rules, and skills** have all moved with it — see **be-change-completeness-guard** (always-applied rule: `agent-os/rules/be-change-completeness.mdc`). When a single fact (a count, a route set, a constant, an env key, a header) lives in more than one place, grep the literal across `src/`, `docs/`, and `agent-os/` so no mirror is left stale.

**Enforcement:** Agent skills generate/fix artifacts once → pre-commit (`lint-staged`, `typecheck`, `validate:domain`, `tsdoc:check`) → CI (`pnpm validate`, `routes:catalog:check`, `tsdoc:check`, env-example sync).

**Human docs** (when layout changes): `CLAUDE.md`, `README.md`, `.cursor/rules/`, skills — via **be-structure-maintainer**. Hand-written `docs/**/*.md` — via **be-docs-maintainer**.

All skills live under `.cursor/skills/`; the file → skill map is `agent-os/docs/skill-triggers.md`, generated from `agent-os/skills/chains.json` and each skill's `trigger` frontmatter (`pnpm agent-os:generate`).

### In-source documentation system

Every directory under `src/` participates in the in-source documentation system. There are four layers, each with a single source of truth — there is intentionally no auto-generated `DOCS.md` aggregator.

| Layer                               | File                                                                    | Owner skill                     |
| ----------------------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| System narratives                   | `src/OVERVIEW.md`, `src/PATTERNS.md`, `src/FLOWS.md`, `src/POLICIES.md` | **be-system-narrative-maintainer** |
| Per-folder overviews (hand-written) | `src/<folder>/<folder>.overview.md` at meaningful boundaries            | **be-overview-doc-maintainer**     |
| TSDoc on exports (canonical)        | every `*.ts` file's `export <kind> <name>` declaration                  | **be-tsdoc-export-guard**          |
| Route schema (drives OpenAPI)       | `schema: { summary, description, tags }` on Fastify route registrations | **be-route-schema-doc-guard**      |

The hard gate is `pnpm tsdoc:check` — a **budget-driven ratchet** at [`tooling/tsdoc-coverage/budget.json`](tooling/tsdoc-coverage/budget.json). Counts of `MISSING_DESCRIPTION` and `MISSING_REMARKS` may decrease but may not increase; the budget is at 0/0, so the gate now holds full coverage — any new undocumented export fails. Runs on pre-commit (the `TSDoc coverage gate` step) and CI (`ci:local`, `ci:quality`).

See [docs/reference/architecture/documentation-system.md](docs/reference/architecture/documentation-system.md) for the full system, including why the auto-generated DOCS.md aggregator was retired.

## Testing

- **Test framework**: Vitest + `fastify.inject()` (helpers in `src/tests/helpers/test-http-inject.helper.ts`)
- **Local test database**: local runs use their own `<project>_test`, prepared by the global setup with the one database step (`prepareDatabase`) and cloned once per Vitest worker — every worker runs on its own `<project>_test_worker_<n>` ([`local-test-database.ts`](src/tests/helpers/local-test-database.ts), [`worker-databases.ts`](tooling/vitest/worker-databases.ts)) — never the database `pnpm dev` serves, so suites' `TRUNCATE ... RESTART IDENTITY` cannot wipe dev data and `pnpm dev` can keep running. A remote `DATABASE_*URL` is never used, and every wipe first checks `current_database()` and refuses anything but the worker's own clone. A GitHub Actions runner (`GITHUB_ACTIONS=true`, not `CI`) keeps its service-container database, but a wipe there still refuses any `DATABASE_*URL` off the runner (the restore drills smoke a copy of production with `pnpm db:restore:smoke`, never a test suite); a dedicated hosted test database needs `ALLOW_HOSTED_TEST_DATABASE=true`. Every run also gets fake provider keys, no telemetry and no network beyond loopback — nock refuses any other host ([`harness-provider-env.ts`](src/tests/helpers/harness-provider-env.ts)) — and Redis cleanup is confined to the worker's `<product>:worker-<n>:test:` namespace.
- **Cross-cutting tests**: `src/tests/` — helpers, shared factories, security, performance, chaos, contract, cross-cutting e2e flows (`src/tests/e2e/` — signup, billing onboarding, data-export deletion), smoke (`src/tests/smoke/`), bench (`src/tests/bench/`), SQL fixtures (`src/tests/fixtures/`); k6 under `src/tests/load/k6/`
- **Domain tests** (co-located with code):
  - **Bundled e2e**: `src/domains/<domain>/__tests__/<domain>.test.ts` (auth, billing, notify, user, tenancy, audit, upload)
  - **Domain integration**: `src/domains/<domain>/__tests__/integration/*.integration.test.ts` — **required** for routed domains (`validate:domain` requires a `.test.ts` under `__tests__/integration/`; the `.integration.test.ts` suffix is enforced by `validate:test-naming`); route smoke + focused in-process HTTP contracts
  - **Domain flow e2e** (optional): `src/domains/<domain>/__tests__/e2e/*.e2e.test.ts` — multi-step end-to-end flows (e.g. login, organization onboarding, webhook delivery)
  - **Domain unit / policy scans**: `src/domains/<domain>/__tests__/unit/` (e.g. ledger immutability, tombstone reads)
  - **Domain factories**: `src/domains/<domain>/__tests__/factories/` when helpers span sub-domains (e.g. `tenancy/__tests__/factories/permission.factory.ts`)
  - **Sub-domain unit**: `sub-domains/<resource>/__tests__/unit/*.validator.unit.test.ts` (or nested: `sub-domains/<parent>/<child>/__tests__/unit/`)
  - **Sub-domain e2e** (when split from monolith): `sub-domains/<parent>/<child>/__tests__/<child>.test.ts` (e.g. organization-api-key)
  - **Event handlers / emit**: `sub-domains/<resource>/__tests__/unit/events/` (register leaf handlers only in tests; never `events/__tests__/`)
- **Commands**: `pnpm test:unit` (unit + `__tests__/unit/events/`), `pnpm test:e2e` (excludes `__tests__/unit/`), `pnpm test` (all)
- **Detail**: `.cursor/skills/be-test-generator/SKILL.md`, `.cursor/rules/be-testing-conventions.mdc`
- **Chaos suite**: `src/tests/chaos/**/*.chaos.test.ts` — see **`docs/reference/reliability/chaos-testing.md`**
- **Contract tests**: `src/tests/contract/**` — see **`docs/reference/testing/contract-tests.md`**
- **k6 load tests**: `src/tests/load/k6/scenarios/` — see **`docs/reference/testing/load-testing.md`**

## Git branch naming

Working branches are `<type>/<short-description>`; `main` is the only long-lived branch (`.husky/pre-push`). A web session starts on a throwaway `claude/<slug>` branch: **rename it before the first push** (`git branch -m <type>/<short-description>`), because the cloud git proxy rejects every branch delete. The full rule, deriving the name, and the merge policy (never merge on red): [`.github/CLAUDE.md`](.github/CLAUDE.md).

## Commands

Script namespaces: `ci:*`, `compose:*`, `test:*`, `validate:*`, `db:*`, `docs:*`, `routes:*`, `load:*`, `chaos:*`, `tool:*`, `setup:*`, `mcp:*`, `security:*`, `sonar:*`, `deps:*`, `agent-os:*`, `github:*`, `tsdoc:*`, `docker:*`, `dashboards:*`, `ops:*`, `sbom:*`, `guard:*`, `dev:*`, `build:*`, `lint:*`, `format:*`, `health:*`, `coverage:*`, `env:*`, `start:*`, `verify:*`, `iteration:*`. List all: `pnpm run`.

Local SonarQube quality gate (pre-push, as in clinozy-fe): `pnpm sonar:up` / `sonar:scan` / `sonar:down` / `sonar:reset`. The pre-push hook (`pnpm guard:pre-push`, the last step of the one pre-push list, `tooling/validate/pre-push-steps.ts`) blocks a push when SonarQube has any open issue on the deployed-app surface; the gate is mandatory — there is no bypass, every issue must be resolved. PR CI runs the same gate in its `SonarQube` lane (in the `Quality gate`, source changes only). See **`docs/reference/quality/sonarqube-local.md`**.

- `pnpm build` — compile to `dist/` (`tsc` + `tsc-alias`, plus the circuit breaker's Redis Lua scripts, so `dist/` runs as-is); `pnpm build:check` fails if `@/` aliases remain
- `pnpm dev` — run Fastify server (tsx watch)
- `pnpm dev:worker` — run BullMQ worker process (tsx watch)
- `pnpm lint` — run Biome (lint + format check on `src/` and `tooling/`)
- `pnpm format` — run Biome formatter (`biome format --write`)
- `pnpm typecheck` — TypeScript type check
- `pnpm db:migrate` — set up the database the one way (`src/scripts/ops/db-prepare.ts`): create it on a local server if missing, run the SQL migrations from `migrations/`, turn on the local logins; `--reset` drops and recreates a local database first
- `pnpm docs:check` — verify OpenAPI generator output is in sync (works on fresh clones; specs are gitignored)
- `pnpm test` — run all Vitest tests: the fast lane, then the database projects one process at a time, every worker on its own database (e2e and integration files in parallel)
- `pnpm test:unit` — unit only (`--project unit` in `tooling/vitest/projects.ts`: `src/tests/unit` + domain `__tests__/unit/`)
- `pnpm test:integration` — `src/tests/integration`
- `pnpm test:e2e` — domain route tests (excludes `__tests__/unit/`)
- `pnpm test:global` — global regression (`src/tests/global`; alias `pnpm test:regression`)
- `pnpm test:rls-role` — runs the **e2e** and **integration** lanes with the pool under test opened as the RLS-subject `clinozy_be_app` role. Every other lane connects as a role that BYPASSES row-level security (Compose's `POSTGRES_USER: clinozy` is a superuser; the local operator role carries `rolbypassrls`), so a path reaching a FORCE RLS table without a database context reads rows there and **none** in production. Harness fixtures use the operator connection (`src/tests/helpers/operator-database.ts`). CI job: `RLS application role (whole connection)`. At push, `pnpm test:rls-role:changed` runs the e2e and integration tests of the pushed `src/domains/` code this way
- `pnpm routes:catalog` / `pnpm routes:catalog:check` — regenerate or verify `docs/routes.txt`
- `pnpm ci:local` — PR gate: every `pnpm ci:quality` step, then the build and the full test suite — one step list, `tooling/validate/gates.ts`, which `pnpm health` reads too
- `pnpm validate` — lint + typecheck + markdown lint (`biome check` covers lint + formatting; `docs:lint` is folded in because markdownlint otherwise runs only at pre-commit/pre-push, and a `--no-verify` commit skips it)
- `pnpm validate:domain` — validate domain structure (CI gate)
- `pnpm db:seed` — `pnpm db:migrate`, then the minimal reference/bootstrap rows (permissions, plans)
- `pnpm db:seed:full` — `pnpm db:migrate`, then the full demo data (fixed demo set, then the demo clinic)
- Every other script: [`docs/reference/commands.md`](docs/reference/commands.md); the iteration commands: [`iterations/CLAUDE.md`](iterations/CLAUDE.md).
