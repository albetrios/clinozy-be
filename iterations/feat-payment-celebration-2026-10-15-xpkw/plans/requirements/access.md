# Access

- `access.every-member-reads-review-link` — **CHANGED.** Every member of the organization reads the
  review link of each branch they work in (a member who may read every branch reads every active
  branch's) — the same branches they already read with their address and hours. Writing it stays
  with those who may change a branch (Owner, Admin by default). The link is public by nature — the
  clinic sends it to patients — so it carries no personal data. Source: `PRD.md:16–17`, `:21–22`;
  `BRIEF.md:39–43`, `:94–96`.

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `access.every-member-reads-review-link` | only a member who may read every branch's full details (Owner, Admin) reads a review link | every member reads the review link of their own branches, with the rest of the branch list they load after sign-in | PC4 |
