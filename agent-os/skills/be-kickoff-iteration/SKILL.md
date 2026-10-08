---
name: be-kickoff-iteration
description: >
  Implement an approved iteration: confirm which iteration to kick off (Step 0), pass the intake gate
  (iteration:intake --check — stop on failure), set it implementing, then follow KICKOFF.md's ROUTE
  one row at a time — do → verify (by Intake mode) → write the AS-BUILT.md row and Standing
  deviations → check the impact on upcoming rows → stop for the user's review → next — and close
  with the gates, plans/acceptance.md and Status done. Use when the user says 'kickoff', 'kickoff
  iteration <name>', 'kickoff <iteration>' or 'start implementing <iteration>'. Requires README
  Status approved.
indexNote: implement an approved iteration — follow the KICKOFF.md ROUTE row by row, record AS-BUILT.md, stop for review after each row
trigger: iterations/*/AS-BUILT.md
triggerNote: Iteration implementation — one ROUTE row at a time; every row's technical decisions go into AS-BUILT.md
---

# Kickoff an iteration (implement `KICKOFF.md`, one ROUTE row at a time)

The second half of the iteration workflow. **`be-iteration-planning` wrote and the user approved
`KICKOFF.md`; this skill implements it.** It follows the ROUTE ledger row by row, records what was
actually built in `iterations/<iteration>/AS-BUILT.md`, and stops for the user's review after every
row. It never pushes, opens a PR or merges.

The whole flow: [`docs/design-workflow/process/README.md`](../../../docs/design-workflow/process/README.md).
The iteration rules: [`iterations/README.md`](../../../iterations/README.md).

## The plan proposes; agent-os decides — remember this on every row

The plan (`KICKOFF.md`, `plans/routes-final.md`, `db-changes.md`, `route-changes.md`, `worker-changes.md`)
states requirements and proposals — the route review in full design detail, the rest in logical terms. **The backend's agent-os — its skills, rules and agents
under `agent-os/` — is the expert.** Whenever the plan and agent-os disagree, or anything is unclear,
follow agent-os. That covers the skills each row runs — the
schema chain (`be-schema-generator`, `be-sql-design-guard`, `be-db-migration-maintainer`,
`be-rls-tenant-isolation-guard`), the route chain (`be-api-contract-guard`, `be-route-schema-doc-guard`,
`be-route-catalog`, `be-seed-maintainer`), `be-workers-events`, and the repository's rules. They decide
the physical design and may change plan details on the way: names, types, indexes, constraints, tenant
rules, paths, statuses, idempotency, job names. Follow them, never the plan's wording, wherever they
differ; record each difference in the row's `AS-BUILT.md` entry and sync the change files (Each ROUTE
row › Record). Only a scope change — a row added or removed, an acceptance changed, the order changed
— stops for the user.

**With a route review it is ditto.** When the plan has `plans/routes-final.md`, the agent-os checks already
shaped it, so each row builds its module **exactly as written** — names, routes, gates, statuses, errors,
codes, folders. Where a skill, rule or gate still cannot build something as written, **stop and ask**; the
agreed change goes into `routes-final.md` first, then into the build — never a silent difference. Only what
the review leaves open is decided on the way and recorded in `AS-BUILT.md`.

## Step 0 — Confirm the iteration, then stop until confirmed

Run `pnpm iteration:list` and show:

| Iteration | Type | Baseline | Status | Eligible | Why |
| --- | --- | --- | --- | --- | --- |

- Eligible = Status `approved`, not yet `implementing`, and Baseline `none` or an iteration that is
  `done` / `frozen`.
- Recommend the earliest-opened eligible iteration (the launch always comes first). If the user
  named one, check it against the rule.
- Always ask with **AskUserQuestion** — never pick silently.

Once confirmed, **the gate**:

```bash
pnpm iteration:intake <iteration> --check
```

**Gate rule:** if it exits non-zero, stop now — write nothing, change no status, ask nothing else;
print the command's output and end the turn. The intake has to be fixed (and the plan re-approved
if it changed) before any build.

When it passes: `pnpm iteration:status <iteration> implementing`, and start `AS-BUILT.md` from the
shape below, dated today, with the Baseline's Standing deviations copied in as the starting list
(empty for an initial iteration).

## Before the first row — read

- `KICKOFF.md` (the plan and its ROUTE) and every file under `plans/` — for each row, its module's
  section in `plans/routes-final.md` is the spec and its code changes the checklist.
- The repository's conventions: `CLAUDE.md`, the skill index
  (`agent-os/skills/be-skill-index/SKILL.md`), the existing domains under `src/domains/`, the
  permission model (`src/domains/tenancy/sub-domains/permission/authorization.service.ts` and the
  seeded catalog in `src/domains/tenancy/seed/tenancy.seed.ts`), the public-id prefixes
  (`src/shared/utils/identity/public-id.util.ts`) and `docs/reference/`.
- `KICKOFF.md` section 8 — the Baseline's Standing deviations this change touches.

## The ROUTE — its shape

**Initial** (Baseline `none`):

1. **Schema first** — tables in dependency order. Each NEW table's design is approved through the
   staged-build prompt's Stage 1, then its schema and migration land.
2. **Features** — each table's code: data access, service, handlers, routes, permissions, i18n,
   seed, tests.
3. **Background work** — jobs, notifications, events.
4. **Flows** — cross-table rules and end-to-end tests.
5. **Acceptance** — `plans/acceptance.md`.

**Incremental:** schema changes first — new tables and `ALTER` migrations from the diff, never an
edit to an existing migration → changed features → changed background work → affected flows,
re-running the existing end-to-end tests for everything touched.

**Drivers:**

| Work item | Driver |
| --- | --- |
| NEW table | the staged-build prompt (`docs/getting-started/staged-build-prompt.md`) — paste the ROUTE row, its requirements and its story above it |
| CHANGE table, flow, background work | `/be-build-requirement` (`agent-os/commands/be-build-requirement.md`), from the requirement form `docs/getting-started/requirement.template.md` |

Each driver runs the matching skill chain (schema-change, route-change, worker-change or new-domain
— `agent-os/skills/chains.json`).

## Each ROUTE row — do → verify → record → check impact → stop

Before marking a row in progress, check its dependencies are done, compare existing code with
the approved module specification, identify unresolved decisions, and select the affected tests.
Use the [document ownership and row execution guidance](../../../docs/design-workflow/process/README.md#document-ownership--write-once-reference-elsewhere)
for what each record owns. Keep the approved row order and scope; a preflight finding does not
authorize changing either.

1. **Do** — mark the row `in progress` in `KICKOFF.md` and build it through its driver.
2. **Verify** — the row's acceptance, its tests, `pnpm validate` — by the README's Intake mode:
   `full` / `overlay` → the acceptance traced to the PRD; `brief` → the `BRIEF.md` acceptance
   criteria the row covers, and the parts it touches still match the carried-forward PRD and
   `schema-routes.md` except where the brief changes them. MODE incremental, every mode: re-run the
   existing end-to-end tests for everything touched. Against the plan's own files: what the row built matches its module's
   section in `plans/routes-final.md`, every route matches its proposal in `plans/route-changes.md`, every table it built matches
   `plans/db-changes.md` (`pnpm db:viewer` — the built table now stands where the plan drew it), and
   every piece of background work it built matches `plans/worker-changes.md` (now with its real queue
   and job names); any difference goes into the AS-BUILT row.
3. **Record** — add the row to `AS-BUILT.md`:

   | # | Planned | Actually built | Difference | Why | Decision | Commit |
   | --- | --- | --- | --- | --- | --- | --- |

   Every technical decision the row made (table and column design, endpoints, permission codes,
   queue names) is recorded here or referenced from its approved specification or decision.
   Do not copy an unchanged module specification. Record verification commands, outcomes and
   acceptance references once in this row or an adjacent verification section; `plans/acceptance.md`
   links to that evidence. Where the build now differs from the drop on purpose, add a **Standing
   deviation** (item · design says · built as · since iteration · decision); where this row resolves
   one, remove it.

   Then **sync the plan with what was built**, so the three change files end as the true record:
   `plans/db-changes.md` — the table's final `domain.table` on its label and its final field names
   (still logical types; the physical types live in the schema code the DB Viewer draws);
   `plans/route-changes.md` and `plans/worker-changes.md` — a `Built` column (added on the first
   row) with the final method + path, or the final job, and the commit. Keep these updates concise:
   link to the AS-BUILT row for evidence and deviation explanations rather than repeating them.
   `KICKOFF.md` stays frozen
   apart from its ROUTE Status column.
4. **Check the impact on upcoming rows.**
   - Small and inside the row → record it in `AS-BUILT.md` and continue.
   - **Scope** — a row added or removed, an acceptance changed, the order changed → **stop and ask**
     (AskUserQuestion). Record the decision in `plans/decisions.md` (Kind `SCOPE`) and in
     `AS-BUILT.md` › Revisions to upcoming rows (the revised row text), and mark the affected
     `KICKOFF.md` row "revised → AS-BUILT #n". Never rewrite `KICKOFF.md` otherwise — it is frozen.
5. **Stop** — mark the row `done`, show the user what was built and the AS-BUILT row, and wait for
   their review before the next row. Use the review summary from the linked row execution guidance:
   changes and contracts, verification evidence, deviations or blockers, impact, and the next row.

## Close

- Run the repository's gates: `pnpm validate`, `pnpm ci:local`, and the route and domain gates.
- Run `/be-pre-merge-review` as a review only — report its findings, change nothing on its say-so.
- Every ROUTE row is `done`, or `deferred` with the user's explicit OK.
- Fill `plans/acceptance.md` — a Result and Evidence for every item.
- Finish `AS-BUILT.md` with its closing summary: planned but not built (deferred, user OK), built but
  not planned, follow-ups for the next iteration — and the **Standing deviations**: the complete list
  of where the code now differs from the drop (the Baseline's list, minus what this iteration
  resolved, plus its new ones). The next iteration plans against it.
- Run `pnpm iteration:status <iteration> done`. `pnpm iteration:status <iteration> frozen` goes in
  the last commit before the merge.
- **Never push, open a PR or merge** — the user raises PRs.

## AS-BUILT.md — the shape

```markdown
# <iteration> — as built

Baseline: <none | iteration> · KICKOFF.md approved <date>

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |

## Revisions to upcoming rows

- #<n>: <the revised row text> — <decision link>

## Summary

- Planned, not built (deferred — user OK): …
- Built, not planned: …
- Follow-ups for the next iteration: …

## Standing deviations

The complete list of where the code differs from the drop — the Baseline's list (empty for an
initial iteration), minus what this iteration resolved, plus its new ones.

| Item | Design says | Built as | Since iteration | Decision |
| --- | --- | --- | --- | --- |
```

## Project conventions every row must keep (non-negotiable)

`CLAUDE.md` is the source of truth; these are what a row most often gets wrong:

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

## Failure modes this skill exists to prevent

| Failure | Prevention here |
| --- | --- |
| The wrong iteration implemented, or one on an unfinished Baseline | Step 0 eligibility + AskUserQuestion |
| A build on an incomplete or edited intake | Step 0 gate (`iteration:intake --check`) |
| A deliberate difference from the drop that nobody can find later | Standing deviations, carried forward |
| Rows built in a batch, reviewed too late | stop for review after every row |
| What was built drifts from the plan with no record | the AS-BUILT row per ROUTE row |
| A scope change slipped in silently | the impact check — scope changes stop and ask |
| The approved plan rewritten after the fact | `KICKOFF.md` frozen; revisions live in AS-BUILT |
| An existing migration edited for a CHANGE table | incremental route: new `ALTER` migrations only |
| "Done" claimed with open rows | close: every row done or deferred with the user's OK |

## Related

- **`be-iteration-planning`** — writes and gets approval for `KICKOFF.md`
- [`kickoff-iteration-prompt.md`](../../../docs/design-workflow/prompts/kickoff-iteration-prompt.md) — the paste prompt
- [`staged-build-prompt.md`](../../../docs/getting-started/staged-build-prompt.md) — the driver for NEW tables
- [`requirement-intake.md`](../../../docs/getting-started/requirement-intake.md) — `/be-build-requirement` and the requirement form
- [`iteration-guide.md`](../../../docs/design-workflow/process/iteration-guide.md) — every step with its questions
