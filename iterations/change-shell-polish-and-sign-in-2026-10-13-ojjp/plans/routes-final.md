# Clinozy API — final routes, sub-domain by sub-domain — change-shell-polish-and-sign-in-2026-10-13-ojjp

The route review for this iteration ([template](../../../docs/design-workflow/process/routes-final-template.md)).
Mode incremental (Baseline `launch-2026-09-30-jxmr`) · Intake hash `bc5d68b3628f` · 2026-10-13.

## Sub-domains

| # | Sub-domain | Folder | Paths | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| — | none in scope | — | — | 0 | — | final (rev 1, confirmed 2026-10-13 by delegation — [D1](decisions.md), [D8](decisions.md)) |

**App total:** unchanged — the route review of `launch-2026-09-30-jxmr` stands as built
(`docs/routes.txt`).

## Code layout

Unchanged — no domain, sub-domain or nested sub-domain is added, moved or renamed.

## Tables without routes

None added.

## Rules that hold across sub-domains

Unchanged from the Baseline's review; this iteration adds none.

## Connections overview

Unchanged. The frontend's sign-in screen and the clinic shell keep calling the auth and app routes
listed in [route-changes.md](route-changes.md) (all `KEPT`).

## Hand-over checks

- [x] No sub-domain in scope, so there are no sections 1–12 to write.
- [x] No repeated or dangling ids (there are none).
- [x] Route count 0 matches [route-changes.md](route-changes.md) (0 NEW · 0 CHANGED · 0 REMOVED).
- [x] [db-changes.md](db-changes.md) and [worker-changes.md](worker-changes.md) say the same: nothing changes.
