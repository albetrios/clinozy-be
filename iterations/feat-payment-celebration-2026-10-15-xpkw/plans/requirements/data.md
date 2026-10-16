# Data

The diagrams live in [`db-changes.md`](../db-changes.md) — no table changes.

- `data.branch-review-link` — **EXISTING (unchanged).** A branch keeps one Google review link: an
  `https://` address of at most 512 characters, or nothing (`null`). Owned by the organization,
  kept as long as the branch (a branch is retired, never deleted), cleared by saving `null`. Source:
  `schema-routes.md:8–14`; `PRD.md:21–25`. ([db-changes.md › `branch`](../db-changes.md#branch))
- `data.demo-clinic-review-link` — **NEW (demo data only).** The demo clinic's main branch carries a
  realistic Google review link; its second branch carries none, so both states can be seen. Written
  when the clinic is created; a re-run keeps an existing clinic as it is. Source: `BRIEF.md:41–43`;
  [PC7](../decisions.md).

## Before → after

none — `data.branch-review-link` is EXISTING and unchanged; `data.demo-clinic-review-link` is NEW.
