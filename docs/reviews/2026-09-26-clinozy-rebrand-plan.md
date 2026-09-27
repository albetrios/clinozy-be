# Rebrand plan — clinovia-be → clinozy-be

**Date:** 2026-09-26 · **Directory:** `clinozy-be` · **Runbook:**
[`docs/getting-started/rebrand-prompt.md`](../getting-started/rebrand-prompt.md) · **Precedent:** the
core-be → clinovia-be rebrand (2026-09-24/25).

This file is archival (`docs/reviews/` is excluded from the rename and from the previous-identity
gate), so it keeps naming both products after the rebrand.

---

## 0. Status — where things stand

| Phase | State |
| --- | --- |
| 0 — Snapshot and baseline | **Done** |
| 1 — Rename | **Done**, verified (section 4) |
| Fresh git, no commit | **Done** — per your instruction, replaces the original "amend the commit" step |
| Remote | **Yours** — not set; no GitHub call of any kind has been made |
| Owner in history links | **Done** — 5,817 `github.com/nikunjmavani/…` links in `CHANGELOG.md` and `docs/reviews/` now point to `github.com/albetrios/…` |
| 2 — Identity gate | **Passing** (run as part of Phase 1 verification) |
| 3 — Local stack | **Done** — `.env.local` moved to clinozy (by you); migrated, seeded; API and worker ready |
| 4 — Gates | **Passing** — `pnpm health` 28/28 |
| 5 — Independent sweep | 5a and 5b **done**; 5c–5e still to run |
| 6 — Full test pass | To do (needs Phase 3) |
| 7 — First commit | To do — after you set the remote |
| 8 — Report | This file |

**Git right now:** branch `main`, **0 commits**, no refs, **no remote**, hooks wired
(`core.hooksPath = .husky/_`), **2,597 files staged**, nothing unstaged or untracked. The previous
`.git` (holding the single clinovia commit) was moved out of the project into the session scratch
directory, which is discarded with the session.

## 1. Starting state (verified 2026-09-26, before any change)

| Item | Value |
| --- | --- |
| Git | 1 commit `abca500 chore: initial commit`, no parent, branch `main`, no remote, clean tree |
| Identity | `clinovia-be` / "Clinovia Backend" / brand "Clinovia" / `albetrios/clinovia-be` |
| Previous identity | `previousNames: [core-be, core-fe]`, `previousOwners: [nikunjmavani]` |
| Scale | 319 tracked files / 1,109 lines mentioned `clinovia`; 9 files mentioned the owner |
| Local-only files | `.env`, `.env.local`, `.env.development`, `.env.production`, `.setup/`, `node_modules/`, `dist/` — copied from clinovia, gitignored |
| Docker | `clinovia-be-*` and `core-be-*` containers, all stopped; volume `clinovia-be_clinovia_be_postgres_data` |
| Siblings | `clinozy-fe` (also an unrebranded clinovia copy, no commits), `clinozy-infra` — out of scope |

## 2. Identity — applied

| Surface | Before | After |
| --- | --- | --- |
| Slug / package | `clinovia-be` | `clinozy-be` |
| Display name | `Clinovia Backend` | `Clinozy Backend` |
| Brand (email sender, passkey prompt, authenticator label) | `Clinovia` | `Clinozy` |
| OpenAPI title / Postman prefix | `Clinovia Backend API` | `Clinozy Backend API` |
| Repository (metadata only) | `albetrios/clinovia-be` | `albetrios/clinozy-be` |
| Owner / CODEOWNERS | `albetrios` | `albetrios` (unchanged) |
| Paired frontend | `clinovia-fe` | `clinozy-fe` |
| Local database / user / password | `clinovia` | `clinozy` |
| Postgres roles | `clinovia_be_app`, `_runtime`, `_owner`, `_operator`, `_maintenance`, `_migrator` | `clinozy_be_*` |
| Redis key prefix | `clinovia:<env>:` | `clinozy:<env>:` |
| JWT issuer / audience | `clinovia-be` / `clinovia-api` | `clinozy-be` / `clinozy-api` |
| MCP URI scheme | `clinovia-be://` | `clinozy-be://` |
| OTEL services, Docker/GHCR images | `clinovia-be-api`, `clinovia-be-worker` | `clinozy-be-api`, `clinozy-be-worker` |
| Compose containers | `clinovia-be-*` | `clinozy-be-*` |
| `previousNames` | `[core-be, core-fe]` | `[core-be, core-fe, clinovia-be, clinovia-fe]` |

## 3. Decisions — as taken

| # | Decision | Taken |
| --- | --- | --- |
| D1 | Names | Section 2 defaults |
| D2 | History | **Fresh `.git`, no commit** — the old `.git` moved out; the first commit is made after the remote is set |
| D3 | Publish | **No** — you set the remote; no GitHub call has been made |
| D4 | `.env.local` | **You edit it by hand** (section 6); agents cannot read or edit it |
| D5 | Old clinovia containers/volumes | Left untouched (stopped) |
| D6 | `clinozy-fe`, `clinozy-infra` | Not touched |

## 4. What Phase 1 did and found

**The rename:** `pnpm init:project --yes --name clinozy-be --display-name "Clinozy Backend"
--brand-name "Clinozy" --repository albetrios/clinozy-be` — exit 0. 293 files rewritten; 3 renamed
(`migrations/20260603150000_clinozy_be_app_role_least_privilege.sql`,
`migrations/20260827010000_clinozy_be_maintenance_role.sql`,
`src/tests/security/rls/clinozy-be-app-role-privileges.security.test.ts`); identity artifacts,
lockfile, route catalog, DBML, source tree, API documents and agent-os skill hashes regenerated.

**Tooling defects the run exposed — fixed in this tree** (in the rename tooling, not only in the
renamed files):

| # | Defect | Effect | Fix |
| --- | --- | --- | --- |
| T1 | The previous-identity scan ran inside `init:project`'s generation step, **before** its prose pass | The rename failed on every old name it was about to rewrite | `generateAllProjectIdentityArtifacts({ scanPreviousIdentity: false })` for that step; the full gate runs at the end of `init:project` |
| T2 | The hardcoded-literal scan ran **after** the generator wrote its files | A refused run left 27 artifacts on the new identity | The scan now runs before any write; a refused run writes **0** files |
| T3 | The failure path restored the manifest through `saveConfig(current)` | The "restored" file gained a defaulted `artifacts` block | The manifest's exact text is kept and written back (`readConfigText` / `restoreConfigText`) |
| T4 | The prose pass rewrote the manifest itself | `previousNames` became `[…, clinozy-be, clinozy-fe]`; the gate skipped them as current and **passed without checking `clinovia` at all** | `tooling/setup/setup.config.json` excluded from the prose pass; `previousNames` corrected |
| T5 | The prose pass skipped `Dockerfile` / `Dockerfile.worker` (no code extension) | Their build-time `DATABASE_URL` still named database `clinovia` | Both files are always rewritten; the two lines fixed |

T1–T5 are proven by running the real script (a refused run and the successful run), not yet by
automated tests. Also fixed by hand: the captured WebAuthn example in
`tooling/openapi/route-examples/route-examples.json` still had the brand `Clinovia` (captured output is
neither a slug spelling nor rewritten by the prose pass).

**Known, not fixed:** the end-of-rename report warns that 43 lines "still mention the previous
identity `albetrios`" although the owner did not change — it compares the owner against itself.

## 5. Verification results

| Check | Result |
| --- | --- |
| `pnpm tool:generate-project-identity:check` | **Pass** — now genuinely checking `clinovia-be` / `clinovia-fe` in every spelling |
| `pnpm health` | **28/28**; fast tests **4,239 / 4,239** (same as the clinovia baseline) |
| 5a — `clinovia` in any case, all tracked files, no exclusions | 2 files, both intentional: the manifest's `previousNames` (required by the gate) and this plan |
| File and folder names containing `clinovia` | 0 |
| `dist/` | Rebuilt from scratch — the incremental build had left 4 orphans of the renamed test; now 0 |
| Other ignored files (36,546 scanned; `.env*`, `.setup/`, `node_modules/` skipped) | 0, except the self-rebuilding `.codegraph/` index |
| 5b — genuine words vs the snapshot | `src/core` 36 → 36, `@/core/` 38 → 38, `Corepack`, `Core pattern`, `Core layout`, `Core engineering` unchanged |
| `.env*`, `.setup/` | **Not scanned** — secrets files; see section 6 |

## 6. Manual items (outside the tracked tree) — yours

`.env.local`:

| Key | New value |
| --- | --- |
| `DATABASE_URL`, `DATABASE_MIGRATION_URL` | `postgresql://clinozy:clinozy@localhost:5432/clinozy` |
| `REDIS_KEY_PREFIX` | `clinozy:dev:` |
| `OTEL_SERVICE_NAME` | `clinozy-be-api` |
| `EMAIL_FROM_NAME`, `WEBAUTHN_RP_NAME` | `Clinozy` |
| `DATABASE_POOL_MAX` | `60` |
| `POSTGRES_MAX_CONNECTIONS` | remove (read live from the server) |
| `SONAR_TOKEN` (if present) | remove — a fresh token is provisioned for the new Sonar project |

`.env.development` / `.env.production` / `.env` — the same keys, plus any hosted database role names
(`clinovia_be_*` → `clinozy_be_*`), before they are ever pushed with `pnpm github:sync`.

Set the remote when ready:

```bash
git remote add origin https://github.com/albetrios/clinozy-be.git
```

## 7. Remaining phases

### Phase 3 — Local stack (after section 6) — done

Result: `clinozy-be-postgres` / `clinozy-be-redis` on a fresh volume; migrations complete; seed done; API `/livez` and `/readyz` 200; worker `/readyz` 200 with 33 workers, `poolMaxConnections: 60`, demand 47, `max_connections` 500 read live; 0 error lines and no `clinovia` in either log.

1. `pnpm compose:up` → new `clinozy-be-postgres` / `clinozy-be-redis` on a fresh volume.
2. `pnpm db:migrate`, `pnpm db:seed`.
3. **Verify:** API `GET /readyz` 200 on :3000; worker `GET /readyz` 200 on :9090 logging
   `poolMaxConnections: 60`, demand 47.

### Phase 5 — Remaining sweeps (rebrand-prompt.md §5)

| Step | Pass condition |
| --- | --- |
| 5c — connection strings and CI service settings | Placeholders unchanged; restricted-role URLs keep role and secret; every `POSTGRES_*` / `pg_isready` names `clinozy` |
| 5d — user-facing values | `EMAIL_FROM_NAME` / `WEBAUTHN_RP_NAME` = `Clinozy` in `.env.example`; `API_DOCS_BASE_URL` still the placeholder |
| 5e — word-by-word substitutions vs the snapshot | Every pair is an identity rename |

### Phase 6 — Full test pass (API and worker stopped)

```bash
pnpm ci:local && pnpm ci:quality && pnpm knip && pnpm test:rls-role
```

Then restart the API and worker, `pnpm db:seed && pnpm db:seed:full && pnpm db:seed:demo-admin`, and
`pnpm test:api-smoke`. **Pass:** 7,305 tests, 0 failed (6 by-design skips in the RLS-role lane),
smoke 86/86, route coverage 131/131.

### Phase 7 — First commit (after the remote is set)

`git commit -m "chore: initial commit"` with the 22-step pre-commit guard (gitleaks, SonarQube —
Docker must be running). Never `--no-verify`. **Verify:** 1 commit, no parent, 0 deleted lines.

## 8. Acceptance criteria

- [x] Identity gate green, genuinely checking every previous name
- [x] No `clinovia` in tracked files except `previousNames` and this plan; none in file names or `dist/`
- [x] Sweeps 5a and 5b clean
- [x] `pnpm health` 28/28
- [x] Fresh `.git`, 0 commits, no remote, everything staged, nothing secret staged
- [x] `.env.local` moved to clinozy (section 6)
- [ ] `.env.development` / `.env.production` moved to clinozy (section 6)
- [x] Local stack: migrated, seeded; API `/readyz` 200, worker `/readyz` 200 (pool 60, demand 47, 33 workers)
- [x] Old owner removed from history links; `nikunjmavani` remains only in `previousOwners`, this plan's starting-state record, and three local home-folder paths in `docs/superpowers/`
- [ ] Remote set
- [ ] Sweeps 5c–5e clean
- [ ] `ci:local`, `ci:quality`, `knip`, `test:rls-role` exit 0; smoke 86/86
- [ ] First commit: 22/22 guard steps, 0 deletions
