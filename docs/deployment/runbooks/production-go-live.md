# Runbook: Production go-live

clinozy-be is **single-trunk** — `main` is the only long-lived branch, and it deploys to the
development environment on every merge and to production on release.

**How shipping to production works:**

- Every change squash-merges into `main` via a PR ([trunk-based-workflow.md](../../process/trunk-based-workflow.md)),
  behind the `Quality gate` + `Checks` required checks.
- An ordinary merge never opens a Release PR: dispatch `post-merge-ci.yml` with `release_pr: true`
  and `release-please` opens `chore(main): release X.Y.Z`. **Merging it is the ship button** — it
  tags the release and fires `release-deploy.yml` to deploy production (behind the environment
  reviewer approval) ([release-versioning.md](../../process/release-versioning.md)).
- The whole procedure, readiness plan to live, is the **be-path-to-production** skill
  (`/be-release`); clinozy-fe runs the same one as `/fe-release`, after this
  repository when its release depends on the API.
- Urgent fixes: [hotfix-release.md](hotfix-release.md).
- Rollback: [rollback-deploy.md](rollback-deploy.md).

Local setup: [SETUP.md](../../../SETUP.md). Full CI/CD + deploy reference:
[cicd-and-deployment.md](../ci-cd/cicd-and-deployment.md).
