# Backup and restore drills

Operational procedure for monthly disaster-recovery verification. Targets align with [dr-runbook.md](dr-runbook.md): **RPO ≤ 15 minutes**, **RTO ≤ 1 hour** for API + worker availability.

The **[scheduled-monthly-restore-rto.yml](../../.github/workflows/scheduled-monthly-restore-rto.yml)** workflow runs on the **1st of each month** (06:00 UTC) and on **`workflow_dispatch`**. It is fully automated — no human input.

---

## RTO threshold (`RTO_MINUTES`)

| Setting | Default | Where |
| --- | --- | --- |
| `RTO_MINUTES` | `60` | Workflow `env` in [scheduled-monthly-restore-rto.yml](../../.github/workflows/scheduled-monthly-restore-rto.yml) |

Elapsed restore time must be **strictly less than** `RTO_MINUTES × 60` seconds. The workflow **fails** when elapsed time meets or exceeds the threshold.

---

## What gets measured (automated)

```mermaid
flowchart LR
  A[GitHub Environment secrets] --> B["PITR branch from the environment's Neon branch"]
  B --> C[db:migrate + advance id sequences + auth integration smoke]
  C --> D[restore-drill-rto.json]
  D --> E{elapsed < RTO_MINUTES?}
  E -->|yes| F[Pass + delete branch]
  E -->|no| G[Fail + delete branch]
```

| Step | Automated action |
| ---- | ---------------- |
| **Parent branch** | Neon branch named after the resolved **GitHub Environment** (`main` → **`production`**; the drill runs from `main` only) |
| **Branch create** | Child branch from that parent at **15-minute** PITR lookback |
| **Recovery** | `pnpm db:migrate`, then `pnpm db:sequences:advance` (the [DR runbook](dr-runbook.md#advance-the-id-sequences-after-a-restore) step), then auth integration smoke against the new branch — the weekly restore smoke runs the same three |
| **RTO clock** | Starts at branch creation; ends after smoke passes |
| **Cleanup** | Ephemeral branch deleted (also has `expires_at` TTL) |

Neon branches are named after GitHub Environments (`development`, `production`), not git branches — the default Neon `main` branch serves no environment, so restoring it would prove nothing about production.

---

## GitHub Environment secrets (required)

Set in `.env.development` / `.env.production` under the **GitHub Secrets** half and push with `pnpm github:sync` (see [credentials-and-env.md](../integrations/credentials-and-env.md)).

| Secret | Purpose |
| --- | --- |
| `MONTHLY_DATABASE_RESTORE_DRILL_NEON_API_KEY` | Neon Console → Organization settings → API keys — an **organization** key (a personal key needs an `org_id` the drill does not send) |

Neon **project ID** is resolved automatically via the Neon API using project name **`clinozy-be`**. Single trunk: the workflow maps **`main` → `production`** (environment ≠ branch; there is no `dev` branch). Without the API key in the matching GitHub Environment, the monthly workflow **fails**.

---

## Artifacts and job summary

Open **Actions → Monthly backup restore & RTO drill**:

| Artifact                   | When                                              |
| -------------------------- | ------------------------------------------------- |
| `restore-drill-rto`        | Automated migrate + smoke completed               |
| `restore-drill-rto-report` | Consolidated JSON from **Record and publish RTO** |

Each JSON file includes `restore_seconds`, `rto_minutes`, `rto_target_seconds`, `parent_branch_name`, and `within_rto_target`.

---

## Acceptance

- Monthly scheduled run produces a measured RTO artifact using automated Neon PITR branch creation.
- Restore time is **recorded** in the workflow job summary and uploaded as JSON.
- Failed runs emit a workflow error notice for follow-up.

Related: [restore-drill.md](../deployment/restore-drill.md), [dr-runbook.md](dr-runbook.md), [credentials-and-env.md](../integrations/credentials-and-env.md).
