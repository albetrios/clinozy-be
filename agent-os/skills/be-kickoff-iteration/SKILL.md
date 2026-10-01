---
name: be-kickoff-iteration
description: >
  Kick off an approved iteration: confirm which iteration to kick off (Step 0), then turn
  iterations/<iteration>/plans into a technical KICKOFF.md with a ledger — schema first, then
  contracts, build order and drivers — before any code. Use when the user says
  'kickoff iteration <name>', 'kickoff <iteration>', 'start implementing <iteration>'. Requires
  README Status approved.
indexNote: confirm which approved iteration to kick off, then plans → technical KICKOFF.md + ledger (schema first) — no code
trigger: iterations/*/KICKOFF.md
triggerNote: Iteration kickoff — technical plan and ledger; build one ledger row at a time after the user confirms
---

# Kickoff an iteration (technical plan from `iterations/<iteration>/plans/`)

The second half of the iteration workflow. **`be-iteration-planning` wrote the requirements; this
skill turns them into a technical plan; the build runs after the user confirms it.** Its output is
two artifacts inside the iteration folder, and a stop:

1. `iterations/<iteration>/KICKOFF.md` — the plan, with every required section present
2. The **ledger** at its end — one numbered row per work item, each with a driver and a status

**Nothing is built until the user confirms the plan.** A kickoff that slides into implementation
has failed.

The whole flow on one page: [`docs/design-workflow/process/README.md`](../../../docs/design-workflow/process/README.md).
The iteration rules: [`iterations/README.md`](../../../iterations/README.md).

## Procedure — stop after every step and wait

### Step 0 — Confirm the iteration, then stop until confirmed

Run `pnpm iteration:list` and show:

| Iteration | Type | Baseline | Status | Eligible | Why |
| --- | --- | --- | --- | --- | --- |

- Planning: eligible = Status planning.
- Kickoff: eligible = Status approved, not yet implementing, and Baseline none or done/frozen.

Recommend the earliest-opened eligible iteration (launch always comes first). If the user
named one, check it against the rule. Always ask the user to confirm (AskUserQuestion)
before Step 1 — never pick silently.

### Step 1 — Read, then stop

- The README (stop unless `Status: approved` — anything earlier goes back to
  `be-iteration-planning`, whose Step 5 ends in the approval) and **every** file under `plans/` in full:
  `product-plan.md`, `coverage.md`, `decisions.md`, every `requirements/*.md`, every
  `features/*/story.md`, `acceptance.md`.
- The repository's conventions: `CLAUDE.md`, the skill index
  (`agent-os/skills/be-skill-index/SKILL.md`), the existing domains under `src/domains/`, the
  permission model (`src/domains/tenancy/sub-domains/permission/authorization.service.ts` and the
  seeded catalog in `src/domains/tenancy/seed/tenancy.seed.ts`), the public-id prefixes
  (`src/shared/utils/identity/public-id.util.ts`) and `docs/reference/`.

Map every requirement identifier and every story work item to a draft work item. Report the
mapping. **Stop.**

### Step 2 — Reconcile with the code, then stop

For each entity and requirement, decide reuse, extend or new — with evidence:

| Requirement / entity | Verdict (reuse · extend · new) | Evidence (file:line) | Conflict |
| --- | --- | --- | --- |

Flag every conflict with an existing domain (an entity that already exists under another name, a
permission that overlaps, a lifecycle that disagrees). **Stop.**

### Step 3 — Technical blocking questions, then stop

Decide what the requirements leave open, never by guessing: domain placement, which side holds
the foreign key in a cycle, polymorphic references, embedded items versus their own table, delete
strategy (soft delete, revocation, immutable ledger), permission codes, the transport for
realtime, queues and schedules. Ask with **AskUserQuestion** — at most 4 per call, one recommended
option each, quoting the evidence. Record every answer in `plans/decisions.md` with `Kind: TECH`.
**Stop.**

### Step 4 — Write `iterations/<iteration>/KICKOFF.md`, then stop

Every section is present. A section may say `n/a — <reason>`; it may never be absent.

1. **Header** — iteration, mode (initial · incremental), Baseline, sources read, date.
2. **Locked technical decisions** — one numbered line each, linked to its `decisions.md` row.
3. **Schema plan — schema first.** NEW and CHANGE tables, enums, the migration order; foreign
   keys that break a cycle are added last.
4. **Contracts** — HTTP, realtime, events, jobs and schedules, notifications, webhooks,
   integrations, files, permissions.
5. **Build order** — schema → missing platform capability → per feature (its table work items →
   its async, notification, realtime and integration work items → its flow) → acceptance.
6. **Work items** — one per table, flow and async piece, each with its **driver**:

   | Work item | Driver |
   | --- | --- |
   | NEW table | the staged-build prompt (`docs/getting-started/staged-build-prompt.md`) — paste the work item (its schema-plan entry, requirement identifiers and story) above it |
   | CHANGE table, flow, async piece | `/be-build-requirement` (`agent-os/commands/be-build-requirement.md`), from the requirement form `docs/getting-started/requirement.template.md` |

   Name the skill chain each item runs: schema-change, route-change, worker-change or new-domain
   (`agent-os/skills/chains.json`).
7. **Verification** — the repository's gates (`pnpm validate`, `pnpm ci:local`, the route and
   domain gates); `plans/acceptance.md` filled with Result and Evidence after the build.
8. **Ledger** — numbered rows, one per work item:

   | # | Work item | Kind | Driver | Requirements | Assignee | Status |
   | --- | --- | --- | --- | --- | --- | --- |

   Assignee is `—` until someone takes the row. Status is `open`, `in progress`, `done` or
   `deferred (user-OK)`. **Success may not be reported while any row is open.**

#### Step 4-inc — MODE incremental only

- Plan **only this iteration's changes**; the folder is the delta.
- A CHANGE table gets a new `ALTER` migration — never an edit to an existing migration.
- Re-check `plans/coverage.md` › Overlap first: if newer iterations reached `main` since the
  Baseline, update the Baseline and resolve every overlap before planning on top of it.

**Stop** after writing `KICKOFF.md`.

### Step 5 — Self-check, then stop

Fix before presenting, never after:

- [ ] Every requirement identifier and every story work item is in the ledger
- [ ] No ledger row without a driver
- [ ] The schema order respects every dependency (cycle-breaking foreign keys last)
- [ ] Every section of `KICKOFF.md` is present (or `n/a — <reason>`)
- [ ] Every TECH decision is in `plans/decisions.md`

Present the reconciliation, the decisions, `KICKOFF.md` and the ledger. **Stop.**

## After the user confirms — implementing

- Set `Status: implementing` in the iteration's README as soon as the user confirms `KICKOFF.md`.
- Build **one ledger row at a time**, through its driver; update the row as it moves.
- When every row is `done` (or `deferred (user-OK)`) and `plans/acceptance.md` has a Result and
  Evidence for every item, set `Status: done`.
- `Status: frozen` goes in the last commit before the iteration's branch merges; after that the
  folder is never edited — a correction is a new `fix` iteration.
- **Never push, open a PR or merge** — the user raises PRs.

## Project conventions the plan must encode (non-negotiable)

`CLAUDE.md` is the source of truth; these are what a kickoff most often gets wrong:

- **Domain layout** — `src/domains/<domain>/sub-domains/<sub-domain>/`, prefixed sub-domain names,
  nested only when the child's lifecycle is the parent's
  (`docs/reference/architecture/domains-and-public-api-design.md`).
- **API contract** — snake_case route params and body keys, `generatePublicId` prefixes, 200 for
  every method except DELETE (204), the error codes in `docs/reference/api/response-codes.md`,
  `X-Idempotency-Key` on money and state writes.
- **Tenancy** — the active organization comes from the signed `org` claim; every tenant table is
  ENABLE + FORCE row-level security with an organization policy
  (`docs/reference/security/rls-architecture.md`).
- **Data lifecycle** — soft delete, revocation or immutable ledger
  (`docs/reference/data/data-lifecycle-deletion.md`); migrations are append-only
  (`docs/reference/data/migrations.md`).
- **Async** — services emit in-process events; durable work is a pull-based BullMQ worker carrying
  `organizationPublicId` (`docs/reference/runtime/workers-and-events.md`).
- **Copy** — every user-facing message is an i18n key.

## Skill routing — the plan names the chain per work item

| Work item | Chain / skill |
| --- | --- |
| New or changed table | **schema-change** — be-schema-generator → be-sql-design-guard → be-db-migration-maintainer → be-rls-tenant-isolation-guard |
| New or changed route | **route-change** — be-api-contract-guard → be-route-schema-doc-guard → be-route-catalog → be-seed-maintainer |
| New domain or sub-domain | **new-domain** — be-domain-generator → … |
| Event, queue, worker, schedule | **worker-change** — be-workers-events → be-test-generator → be-tsdoc-export-guard |
| Money or state write | be-idempotency-guard |
| Seed data | be-seed-maintainer |
| Finishing every row | be-change-completeness-guard |

## Failure modes this skill exists to prevent

| Failure | Prevention here |
| --- | --- |
| The wrong iteration kicked off, or one planned on an unbuilt Baseline | Step 0 eligibility table + confirmation |
| A plan that duplicates an existing entity or permission | Step 2 reconciliation with evidence |
| Guessed foreign-key side, delete strategy or permission code → rework | Step 3 TECH questions |
| Tables built before the tables they reference | Step 4.3 schema first, cycle-breaking keys last |
| Work done outside the ledger; "done" claimed with open rows | Step 4.8 + Step 5 self-check |
| An existing migration edited for a CHANGE table | Step 4-inc: new `ALTER` migrations only |

## Related

- **`be-iteration-planning`** — the requirements half; its approval is this skill's input
- [`kickoff-iteration-prompt.md`](../../../docs/design-workflow/prompts/kickoff-iteration-prompt.md) — the paste prompt
- [`staged-build-prompt.md`](../../../docs/getting-started/staged-build-prompt.md) — the driver for NEW tables
- [`requirement-intake.md`](../../../docs/getting-started/requirement-intake.md) — `/be-build-requirement` and the requirement form
- [`iterations/README.md`](../../../iterations/README.md) — the iteration rules
