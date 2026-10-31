# feat-patient-image-thumbnails-2026-10-31-tibz — background work

Iteration `feat-patient-image-thumbnails-2026-10-31-tibz` · Baseline `none` · Intake mode `brief` · 2026-10-31.

| NEW | CHANGED | REMOVED |
| --- | --- | --- |
| 1 queue (2 job names) + 1 ops script | 0 | 0 |

| Item | What | Rule |
| --- | --- | --- |
| `patient-image-thumbnail` queue, job `sync-patient-image-thumbnail` | `{ organizationPublicId, patientImagePublicId }` + trace. Enqueued after the commit of a photo's create, delete or restore (`runEnqueueAfterCommit`, never fails the request). The worker reads the row in the organization's context, closes it, calls S3 (make or delete), then writes `thumbnail_key` in a second short context | §3, §4.2, §4.5, §5.5, §5.6; identity [PT8](decisions.md) |
| same queue, job `reconcile-patient-image-thumbnails` (cron `*/15 * * * *`) | the lost-enqueue sweep: reads under `runGlobalRetentionWorkerJob`, then adds one sync job per photo needing one ([PT9](decisions.md)) | §4.6, §7.2, §7.4 |
| worker | `createProviderPausableWorker({ provider: 's3' })`, `retention` family, concurrency 1, `getRetentionWorkerOptions()` ([PT10](decisions.md)) | §5, §6.2 |
| `pnpm ops:patient-image-thumbnails-backfill` | dry run by default; `--apply` enqueues sync jobs for every live photo without a thumbnail, organization by organization ([PT13](decisions.md)) | — |

Failure choices (§6.1): row gone / nothing to do → skip; source missing or undecodable → skip with a
warning ([PT11](decisions.md)); S3 transient → throw (retried, the queue pauses on an outage).
