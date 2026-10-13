# Monthly restore drill (deployment)

Canonical process: **[backup-drills.md](../process/backup-drills.md)** — RTO recording, `RTO_MINUTES` threshold, artifacts.

This page covers deployment wiring only.

---

## Workflow

| Workflow                               | File                                                                                           | When                                         | Required?             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------- |
| **Monthly backup restore & RTO drill** | [scheduled-monthly-restore-rto.yml](../../.github/workflows/scheduled-monthly-restore-rto.yml) | 1st of month 06:00 UTC + `workflow_dispatch` | Yes (compliance gate) |

Fully automated: Neon PITR child branch from the Neon branch named after the GitHub Environment (**`production`**) → migrate → advance id sequences → integration smoke → RTO assert → branch delete.

---

## GitHub Environment secrets (required)

| Secret | Purpose |
| --- | --- |
| `MONTHLY_DATABASE_RESTORE_DRILL_NEON_API_KEY` | Neon API authentication — an **organization** API key (a personal key cannot list an organization's projects without `org_id`) |

Provision in `.env.development` / `.env.production` (GitHub Secrets half) and sync with `pnpm github:sync`. The workflow resolves Neon project **`clinozy-be`** by name via the Neon API and uses the GitHub Environment resolved from the git ref (single trunk: `main` → `production`; environment ≠ branch, there is no `dev` branch).

**Parent branch:** the Neon branch named after that GitHub Environment (`production`), not the git ref — the default Neon `main` branch serves no environment.

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
