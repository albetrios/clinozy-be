# launch-2026-09-30-jxmr — as built

Baseline: none · KICKOFF.md approved 2026-10-03 · implementing since 2026-10-07

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| #1 | `organization` — CHANGE table: 8 fields on the organization (specialties, timezone, currency, default day float, lead hold days, reminder hour, re-target days, purge days) | `tenancy.organizations` + `specialties` text[] (1–6 of 6 values, `{skin}`), `timezone` varchar(64) (`Asia/Kolkata`), `currency` varchar(3) (`INR`, CHECK fixed); `tenancy.organization_settings` + `default_day_float` numeric(12,2) (2000.00), `lead_hold_days` int (3), `reminder_hour` smallint 0–23 (16), `retarget_after_days` int (90), `deleted_record_purge_days` int (7); 8 CHECKs (`chk_organizations_*`, `chk_organization_settings_*`); constants `organization.constants.ts`, `organization-settings.constants.ts`; migrations `20261007064811`, `20261007064813`; 13 integration tests | the 5 settings live on `organization_settings`, not `organizations`; money `numeric(12,2)` rupees, not paise; `reminder_hour` smallint, not text; specialty values lowercase (the drop's) | reuse: the settings table RC-201's route already owns (CLAUDE.md › Reuse before you create); be-sql-design-guard money rule; D34 "an hour" + prototype 16:00 (Clinozy.dc.html:6048); no repo rule on value casing — the drop's values need no frontend change | agent-os decides (be-kickoff-iteration); user 2026-10-07: backend patterns win, the frontend adapts | `93fe1a9` |

## Revisions to upcoming rows

none yet.

## Summary

Written at the close.

- Planned, not built (deferred — user OK): …
- Built, not planned: …
- Follow-ups for the next iteration: …
- Frontend adapts (user rule, 2026-10-07) — at the route rows that expose them: money as `numeric(12,2)` rupees (clinozy-fe contracts hold paise) · the clinic settings read and written through `/tenancy/organization/settings` (#1).

## Standing deviations

The complete list of where the code differs from the drop — the Baseline's list (empty: this is the
initial iteration), minus what this iteration resolved, plus its new ones. KICKOFF.md §8 lists the
deviations this iteration plans; each joins this table when the row that builds it is done.

| Item | Design says | Built as | Since iteration | Decision |
| --- | --- | --- | --- | --- |
