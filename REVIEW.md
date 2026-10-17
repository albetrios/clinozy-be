# Code-review instructions for clinozy-be

Highest-priority instructions for any agent reviewing a diff or PR in this repo
(`/code-review`, `/be-pre-merge-review`, `/review`, and review subagents). These
tune *review judgment*; the mechanical rules themselves live in `CLAUDE.md` and
are enforced by gates — do not re-litigate what a gate already proves.

## Severity definitions

| Severity | Meaning | Examples in this repo |
| -------- | ------- | --------------------- |
| **critical** | Data loss, tenant leakage, security hole, money wrong | Missing/weakened RLS policy; query path that skips the `app.current_organization_public_id` GUC (a context wrapper); billing ledger mutated in place; secret committed |
| **major** | Correctness bug a user or worker will hit | Worker calling `getRequestDatabase()`; idempotent write missing the `X-Idempotency-Key` 422/409 flow; wrong method→status mapping; unhandled promise in an event handler |
| **minor** | Contract or convention drift that gates may not catch | Response body key in camelCase; route param named `{id}`; raw user-facing string instead of an i18n key; cross-domain repository/schema import from a service |
| **nit** | Style/preference — cap at 2 per review, or omit | Naming taste, comment phrasing |

## Repo-specific checks (in priority order)

1. **Tenant isolation / RLS** — every new tenant-owned table has ENABLE + FORCE
   RLS with an organization-scoped policy carrying both USING and WITH CHECK; workers use
   context wrappers and tenant jobs carry `organizationPublicId`.
2. **Money paths** — billing ledgers are append-only; Stripe mutations forward
   the client `X-Idempotency-Key` as Stripe's `idempotencyKey`.
3. **API contract** — snake_case body keys and route params, semantic
   `{plan_id}`-style params, `<prefix>_<21>` public ids, success 200 for every
   method except DELETE (204) — POST included (`method-status-policy.middleware.ts`).
4. **Layer discipline** — controllers coordinate; services own intent (no raw
   SQL); repositories own SQL; cross-domain access only via the other domain's
   service.
5. **i18n** — all user-facing `detail` / `message` / `errors[].message` strings
   are translation keys present in `src/shared/locales/en/`.
6. **NODE_ENV** — never compared/branched on outside `env-schema.ts`; new
   env-varying behaviour is an explicit flag with a production-safe default.
7. **New route completeness** — schema block (summary/description/tags), an
   integration test, catalog + seed alignment.

## Skip — do not comment on

- Generated artifacts: `pnpm-lock.yaml`, `docs/routes.txt`, `docs/openapi/`,
  `docs/postman-collection.json`, `*project-identity.constants.ts`,
  `docs/database/clinozy-be.dbml`, `.codex/hooks.json`, `agent-os/skills-lock.json`.
- Formatting/import order — Biome owns it (`edit-hooks.mjs` at the end of each turn + pre-commit).
- Anything a required gate already enforces (typecheck, `validate:domain`,
  `tsdoc:check`, `db:migrate:lint`) **unless** the diff shows the gate being
  weakened (budget raised, test deleted, rule disabled) — that is **major**.

## Findings format

Every reviewer — the `/be-pre-merge-review` agents, `/code-review`, a review subagent — reports
each finding on one line, in this shape, so one report can merge them:

```markdown
- **major** · `src/domains/billing/sub-domains/invoices/invoices.repository.ts:142` · RLS — the refund
  update runs on the GUC-less pool, so another organization's invoice can be refunded → fix: be-rls-tenant-isolation-guard
```

- **Severity** — one of this file's four: `critical`, `major`, `minor`, `nit`. No other scale
  (no P0/P1, high/medium/low, blocking/optional).
- **Location** — `file:line` in the diff (or the closest line it breaks).
- **Check** — the repo-specific check above (or the reviewer's own rule) it fails.
- **Failure scenario** — the concrete input or state that goes wrong.
- **Fix** — the skill that fixes it (agent finds, skill fixes) or the exact change.

A reviewer may add a `Satisfied` list (check — reference) after its findings. The aggregate
report sorts findings by severity (critical first), merges the same `file:line` and check from
two reviewers into one line naming both, drops anything under **Skip**, and keeps at most two
`nit`s.

## Review posture

- Verify claims against the diff, not the PR description.
- A deleted or skipped test accompanying a behaviour change is always at least
  **major** — ask why.
- Findings must name file:line and a concrete failure scenario; no vague
  "consider improving X".
