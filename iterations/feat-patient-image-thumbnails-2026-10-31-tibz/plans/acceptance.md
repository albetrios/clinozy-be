# feat-patient-image-thumbnails-2026-10-31-tibz — acceptance

One row per acceptance criterion in `BRIEF.md`. Result and Evidence are filled when built.

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 `patient_images.thumbnail_key` exists, nullable, with its migration; RLS unchanged | `BRIEF.md` Acceptance 1 | pass | migration `20261031041630_…`, `pnpm db:migrate:lint` 0 violations, RLS policy lint no findings; the integration test reads and writes it as the RLS-subject role — [AS-BUILT #2](../AS-BUILT.md) |
| A-2 A create enqueues the thumbnail job after the commit; the job writes a ≤ 320 px WebP next to the photo and sets `thumbnail_key`; an enqueue or thumbnail failure never fails the create | Acceptance 2 | pass | `patient-image-thumbnail.integration.test.ts` steps 1–2, `upload-thumbnail.util.unit.test.ts` (320 px WebP), the queue unit test (an enqueue failure is swallowed), the processor unit test (a failed source is a skip) — [AS-BUILT #1, #2](../AS-BUILT.md) |
| A-3 Every image response carries `thumbnail_url` (thumbnail, else the full photo); `file_url` unchanged | Acceptance 3 | pass | the integration test (GET and list sign the thumbnail; before it, `thumbnail_url == file_url`), `patients.integration.test.ts`, `pnpm docs:check` — [AS-BUILT #3](../AS-BUILT.md) |
| A-4 A delete removes the thumbnail object and clears `thumbnail_key`; a restore makes one again | Acceptance 4 | pass | the integration test steps 3–4 — [AS-BUILT #2](../AS-BUILT.md) |
| A-5 A sweep re-enqueues photos whose enqueue was lost | Acceptance 5 | pass | the sweep unit test; the integration test (a deleted photo with a thumbnail is a sweep candidate, gone after the job) — [AS-BUILT #2](../AS-BUILT.md) |
| A-6 The backfill (dry run by default, `--apply`) enqueues every live photo without a thumbnail, organization by organization; safe to re-run | Acceptance 6 | pass | the script, its local dry run, its reads in the integration test — [AS-BUILT #4](../AS-BUILT.md) |
| A-7 `sharp` loads inside both production images | Acceptance 7 | pass | both images built locally; `require('sharp')` made a WebP in each (`sharp 0.35.5 vips 8.18.7`) — [AS-BUILT #1](../AS-BUILT.md) |
