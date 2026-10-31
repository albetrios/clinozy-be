# feat-patient-image-thumbnails-2026-10-31-tibz — acceptance

One row per acceptance criterion in `BRIEF.md`. Result and Evidence are filled when built.

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 `patient_images.thumbnail_key` exists, nullable, with its migration; RLS unchanged | `BRIEF.md` Acceptance 1 | | |
| A-2 A create enqueues the thumbnail job after the commit; the job writes a ≤ 320 px WebP next to the photo and sets `thumbnail_key`; an enqueue or thumbnail failure never fails the create | Acceptance 2 | | |
| A-3 Every image response carries `thumbnail_url` (thumbnail, else the full photo); `file_url` unchanged | Acceptance 3 | | |
| A-4 A delete removes the thumbnail object and clears `thumbnail_key`; a restore makes one again | Acceptance 4 | | |
| A-5 A sweep re-enqueues photos whose enqueue was lost | Acceptance 5 | | |
| A-6 The backfill (dry run by default, `--apply`) enqueues every live photo without a thumbnail, organization by organization; safe to re-run | Acceptance 6 | | |
| A-7 `sharp` loads inside both production images | Acceptance 7 | | |
