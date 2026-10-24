---
name: be-path-to-production
description: Take main to production: readiness plan, Release PR, the deploy the user approves, live check, rollback; before clinozy-fe. Use to release, deploy, go live. Command /be-release.
trigger: docs/deployment/runbooks/production-go-live.md
triggerNote: Or the user asks to release / deploy to production / path to production — the readiness plan the user approves, then the Release PR, the approved deploy and the live check
indexNote: release to production — readiness plan the user approves, Release PR, approved deploy, live check, rollback
---

# Path to production (clinozy-be)

One procedure from a green `main` to a live production backend. Command:
**`/be-release`** (`review` stops after step 1, `release` skips it). clinozy-fe runs the same
steps for the frontend: skill **fe-path-to-production**, command **`/fe-release`**.

**Workflow doc:** [docs/deployment/runbooks/production-go-live.md](../../../docs/deployment/runbooks/production-go-live.md).

## The order between the two repositories

Release **clinozy-be first** when the frontend release depends on anything new in the API (a
parameter, a field, a route): the frontend must never reach production before the backend it calls.
The query DTOs are `.strict()`, so a frontend that sends a parameter the live backend does not
know gets a 400 on every such read (24 Oct: `exclude_appointment_id` would have broken every
Reschedule grid against v9.3.0). Start the frontend release only after this one reports
**Environment fully live**.

## Never

- Approve a production deployment, or ask an agent to: the `production` environment's reviewer
  approves it in GitHub (Actions → the run → **Review deployments**).
- Merge a Release PR on red, or with `--admin`.
- Run any production action before the user has seen and confirmed the step 1 plan, unless the
  user explicitly says to release without it.

## Step 1 — Readiness review and the plan the user approves

Run the **be-prod-readiness** pipeline (`/be-prod-readiness`: be-production-reviewer,
be-production-hardening-reviewer, be-dependency-auditor) or do the review yourself:

1. **Production-hardening checklist** — read **`agent-os/skills/be-production-hardening-guard/SKILL.md`**.
   For each item (Security, Database, Redis, External Services, Logging, Worker Process, CI/CD)
   note **Satisfied** (with a file or config reference) or **Gap** (file path and what to do).
2. **Local gates** — confirm they passed: `pnpm ci:local` (the full PR gate and test suite),
   `pnpm verify:base` (migrate → seed → API smoke → validate), and the SonarQube gate
   (`pnpm sonar:up && pnpm sonar:scan`). When the post-merge CI run on the release commit already
   ran a gate, cite that run as CI evidence instead of a local run.
3. **Codebase checks** —
   - `TODO` / `FIXME` / `HACK` / `XXX` / `placeholder` / `not implemented` in `src/` that affect production;
   - raw user-facing strings in API responses (**be-i18n-message-guard**);
   - the client's `X-Idempotency-Key` forwarded to Stripe on billing writes;
   - organization context documented for HTTP and workers;
   - no hardcoded production secrets or unsafe defaults (JWT, CORS).
4. **What the release ships** — `git log --oneline <last tag>..origin/main`, and
   `git diff --name-status <last tag> origin/main -- migrations/`. Every migration must work with the
   **previous** app still running: the deploy migrates the database before it switches the
   containers, so a failure after the migration leaves the old code on the new schema.
5. **The plan**, in this template, then ask: "Please review this plan. Should we address the gaps
   first, or proceed to the release?" Wait for the answer.

```markdown
# Pre-production review plan

## Summary

[1–2 sentences]

## Satisfied

- [Check] — [reference]

## Gaps (address before production)

- **[Title]** — [file/area]: [what to do]

## Optional improvements

- [Item] — [file/area]: [what to do]

## Next step

Review this plan. Confirm whether to address gaps first or proceed to the release.
```

## Step 2 — Open the Release PR

An ordinary merge to `main` deploys development only; it never opens a Release PR. Ask for one:

```bash
gh workflow run post-merge-ci.yml -R albetrios/clinozy-be -f release_pr=true -f skip_docker=true -f skip_docs=true
```

(Or Actions → **Post-merge CI** → Run workflow → tick `release_pr`.) The dispatched run runs the
test matrix first (about 10 minutes), then release-please opens **`chore(main): release X.Y.Z`**.

## Step 3 — Check and merge the Release PR

- It changes three files: `package.json`, `.github/release-please/manifest.json` and `CHANGELOG.md`.
  Read the changelog: the bump (`feat` → minor, `fix` → patch, `!` → major) and the PRs it lists.
- Squash-merge it once `Quality gate` and `Checks` are green — auto-merge is allowed here
  (`gh pr merge <n> --squash --auto`). Keep the title: the merge commit must start with
  **`chore(main): release`**, which is what makes its post-merge run cut the tag and the GitHub Release.

## Step 4 — The production deploy and its approval

Publishing the Release starts **Release deploy (production)** (`release-deploy.yml`), pinned to the
tag: resolve tag and image → probe the development API → generate the docs → build the tag image
only if missing, with Trivy → verify signatures and attestations → **Deploy (production)**, which
waits for the `production` reviewer. Tell the user it is ready to approve, with the run link.

## Step 5 — Watch it to live

The deploy job runs, in order:

- validate the environment's secrets;
- wait for the images;
- **migrate and seed the database**;
- set the Railway service variables (CI-only keys excluded);
- deploy the API and worker;
- probe the live API (headers, CORS, TLS);
- rotate `:current` / `:previous`;
- publish the docs;
- **Environment fully live**.

Only that last step means done. Then, when the frontend has a release waiting, start
**fe-path-to-production** in clinozy-fe.

## When a deploy fails

- Read the failed step's log first (`be-ci-investigator` keeps a long log out of the conversation).
- **A secret the step names** (for example `Invalid RAILWAY_TOKEN`): the owner replaces it in GitHub →
  Settings → Environments → production. Rotating a development secret means rotating production's
  too: on 24 Oct a token replaced for development on 21 Oct was still dead in production.
- Re-run on the same run: **Re-run failed jobs**. It reuses the built and signed image, and the
  approval prompt appears again. Or redeploy a tag:
  `gh workflow run release-deploy.yml -R albetrios/clinozy-be -f tag=vX.Y.Z`.
- A failure after **Prepare the database** leaves the previous app on the migrated schema; say so,
  with the migrations the release added.

## Rollback

Actions → **Rollback deploy** (`rollback-deploy.yml`, target `production`), or redeploy the previous
tag with `release-deploy.yml -f tag=vPREVIOUS`. A migration is not rolled back by either: write a
forward fix.

## Dependencies

- **be-production-hardening-guard** — the checklist at the core of step 1.
- **be-i18n-message-guard** — the user-facing strings check.
- **be-ci-investigation** — a failed deploy step.
- **fe-path-to-production** (clinozy-fe) — the frontend half; same steps, same order rules.

## Maintaining this skill

A new production-readiness check (here or in **be-production-hardening-guard**) goes into step 1. A
change to `post-merge-ci.yml`, `release-deploy.yml` or `rollback-deploy.yml` (inputs, job names, the
approval) goes into steps 2–5 and the rollback, here and in clinozy-fe's **fe-path-to-production**,
so both stay one procedure.
