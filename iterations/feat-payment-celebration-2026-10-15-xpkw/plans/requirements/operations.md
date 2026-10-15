# Operations

- `operations.read-branch-review-link` — **CHANGED.** Listing my branches returns each branch's
  review link next to what it returns today; a branch without one says so (`null`). Source:
  `PRD.md:21–25`; `schema-routes.md:27`; `BRIEF.md:39–41`, `:121–122`.
- `operations.edit-branch-review-link` — **EXISTING (unchanged).** Those who may change a branch set,
  change or clear its review link (`https://` only); the change is audited as any branch change is.
  Source: `PRD.md:24–25`; `schema-routes.md:28`; `BRIEF.md:38–39`.

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `operations.read-branch-review-link` | my branches: name, tone, main flag, address, phone, GSTIN, hours, working days | the same, and the review link (or `null`) | PC4, PC5 |
