# GitHub Environments (IaC)

JSON files here declare protection rules for [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) used by [reusable-railway-deploy.yml](../workflows/reusable-railway-deploy.yml).

**Canonical mapping source:** [`tooling/setup/setup.config.json`](../../tooling/setup/setup.config.json). Run `pnpm tool:generate-project-identity` after manifest changes to regenerate identity constants and the CI composite action.

Single trunk: `main` deploys to each environment, chosen explicitly by the caller — never from the
branch. `NODE_ENV` is set by the deploy from that environment, not stored in the GitHub Environment.

| Trigger                       | GitHub Environment | `NODE_ENV` (set by the deploy) |
| ----------------------------- | ------------------ | ------------------------------ |
| Merge to `main`               | `development`      | `development`                  |
| Published release             | `production`       | `production`                   |
| Manual dispatch / rollback    | the chosen target  | the chosen target              |

| Config file | GitHub Environment | Protection |
| ----------- | ------------------ | ---------- |
| [production.json](production.json) | `production` | Required reviewers (enforced on a private repo only with GitHub Enterprise — otherwise `github:sync` skips them with a notice), deployment branches |
| [development.json](development.json) | `development` | Deployment branches: the `main` branch only (`protectedBranches`, H-4) |

**`development` allows the `main` branch only** (`deploymentBranchPolicy.protectedBranches`,
H-4): it holds the development deploy's secrets and the release PAT (`RELEASE_PLEASE_TOKEN`), so no
job a pull request or a pushed branch starts may select it. A job that must react to a pull request
and needs one of those secrets is split: the pull-request half holds nothing, and a `workflow_run`
half (which runs main's copy of its file, on `main`) reads the secret and runs no code from the PR —
`dependabot-approval.yml` → `dependabot-auto-merge.yml` (H-3). As on production, the policy does
not stop the `release: published` run (its ref is the tag), which probes the development API.
Pinned by `src/tests/unit/ci/dependabot-auto-merge.policy.unit.test.ts`.

**What `pnpm github:sync` cannot express yet** (set by hand, or not at all):

- **`preventSelfReview` stays `false`** on production while it has one reviewer: with it on, the
  only reviewer cannot approve their own deploy (a deadlock `pnpm github:tool:governance-mode`
  refuses). Flip it with `pnpm github:tool:governance-mode team` once there are two owners.
- **The release PAT in an environment of its own** (only the release-please job, the PAT canary
  and the Dependabot merge selecting it): `sync-config.ts` requires every GitHub Environment to
  be a `NODE_ENV` value (`development` / `production`), so a non-deploy environment fails its
  consistency check. Until then, or until releases move to a GitHub App, the main-only branch
  policy is what keeps the PAT from a PR.

**API docs uploads** (Postman workspace, Scalar Registry) use the same GitHub Environment on push: `dev` → `development`, `main` → `production`. Set `POSTMAN_API_KEY`, `POSTMAN_WORKSPACE_ID`, `SCALAR_API_KEY`, `SCALAR_NAMESPACE`, and optional `SCALAR_SLUG` per environment (e.g. `clinozy-be-dev` vs `clinozy-be`) so hosted docs do not overwrite each other.

**Source of truth for env values.** Each environment's secrets and variables live in a gitignored `.env.<environment>` file at the repo root, derived from the committed `.env.example`. `pnpm github:sync <environment>` pushes them to the matching GitHub Environment.

**Bootstrap (first time):**

```bash
pnpm tool:generate-project-identity  # refresh identity constants + CI composite action from setup.config.json
pnpm github:sync              # creates missing .env.<environment> files from setup.config.json
# Edit each file with real values (DB URL, JWT keys, Sentry DSN, etc.)
pnpm github:sync              # branches + rulesets + environments + push values (confirms before push)
```

`github:sync` runs the full pipeline: ensure protected branches exist, sync committed rulesets from [`.github/rulesets/`](../rulesets/), create GitHub Environments from this folder, then push each local `.env.<environment>` file. Preview without writes: `pnpm github:sync --dry-run`.

**One environment only** (same full pipeline, values limited to that environment): `pnpm github:sync <environment>`.

`github:sync` automatically:

- creates the GitHub Environment (idempotent),
- pushes anything under `.env.<environment>`'s **GitHub Secrets** half as a Secret (`gh secret set`) and anything under the **GitHub Variables** half as a Variable (`gh api .../variables`) — the file structure is the source of truth,
- skips empty entries (operators can leave optional integrations blank).

Preview without pushing: `pnpm github:sync <environment> --dry-run`.

**Re-syncing** after editing a value: `pnpm github:sync <environment>` again — idempotent, overwrites in place.

**Only a few values changed?** `pnpm github:sync [environment...] --only KEY,KEY --yes` pushes just those keys (even one that equals its schema default), skips rulesets and environment protection, and deletes nothing — instead of re-pushing every secret.

**Adding a new environment** (e.g. `staging`):

1. Add `staging` to the `NODE_ENV` enum in `src/shared/config/env-schema.ts`.
2. Add `{ "name": "staging", "branch": "staging", "nodeEnvironment": "staging" }` to the `environments[]` array in `tooling/setup/setup.config.json`.
3. `pnpm github:sync` — scaffolds local IaC and syncs remote shells.
4. Edit `.env.staging` with real values; update `.github/workflows/reusable-railway-deploy.yml`.
5. `pnpm github:sync staging` — push values to GitHub.

See [docs/deployment/runbooks/add-new-environment.md](../../docs/deployment/runbooks/add-new-environment.md).

**Drift check:** `pnpm github:sync --check` — consistency + branches/rulesets/environments, comparing the committed protection JSON vs the GitHub API (requires `gh auth login`).

**When reviewers change:** prefer `pnpm github:tool:governance-mode` (`personal` / `team`) — it sets `production.json` `requiredReviewers.users` + `preventSelfReview` from CODEOWNERS and refuses a deadlocking combo — then `pnpm github:sync`. If you hand-edit `production.json`, run `pnpm github:tool:governance-mode:check` to catch an inconsistent/deadlocking state, and keep the GitHub UI in sync. See [docs/deployment/ci-cd/branch-protection.md](../../docs/deployment/ci-cd/branch-protection.md#governance-mode--personal--team-one-switch).

See [docs/deployment/github-production-environment.md](../../docs/deployment/github-production-environment.md).
