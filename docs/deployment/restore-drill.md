# Monthly restore drill (deployment)

Canonical process: **[backup-drills.md](../process/backup-drills.md)** — RTO recording, `RTO_MINUTES` threshold, artifacts.

This page covers deployment wiring only.

---

## Workflow

| Workflow                               | File                                                                                           | When                                         | Required?             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------- |
| **Monthly backup restore & RTO drill** | [scheduled-monthly-restore-rto.yml](../../.github/workflows/scheduled-monthly-restore-rto.yml) | 1st of month 06:00 UTC + `workflow_dispatch` | Yes (compliance gate) |

Fully automated: Neon PITR child branch in the GitHub Environment's own Neon project (**`clinozy-be-production`**, branch `production`) → migrate → advance id sequences → integration smoke → RTO assert → branch delete.

---

## GitHub Environment secrets (required)

| Secret | Purpose |
| --- | --- |
| `MONTHLY_DATABASE_RESTORE_DRILL_NEON_API_KEY` | Neon API authentication — an **organization** API key preferred (with a personal key the drill looks up the key's only organization) |

Provision in `.env.development` / `.env.production` (GitHub Secrets half) and sync with `pnpm github:sync`. The workflow resolves the GitHub Environment from the git ref (single trunk: `main` → `production`; environment ≠ branch, there is no `dev` branch) and finds that environment's Neon project **`clinozy-be-<environment>`** by name via the Neon API.

**Parent branch:** that project's only branch, named after the environment (`production`). The drill branch logs in as the project's database owner (`clinozy_be_production_owner` on `clinozy_be_production`).

The workflow **fails** when secrets are missing, when the parent Neon branch is not found, when restore steps do not complete, or when `restore_seconds` ≥ `RTO_MINUTES × 60` (default **60 minutes**).

---

## CI artifacts

| Artifact                   | Contents                        |
| -------------------------- | ------------------------------- |
| `restore-drill-rto`        | Automated timing JSON           |
| `restore-drill-rto-report` | Consolidated report for the run |

---

## Related

- [backup-drills.md](../process/backup-drills.md) — full drill procedure
- [dr-runbook.md](../process/dr-runbook.md) — disaster recovery runbook
- [credentials-and-env.md](../integrations/credentials-and-env.md) — secret setup
