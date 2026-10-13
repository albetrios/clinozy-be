# Worker changes — feat-clinic-setup-2026-10-13-sltd

The iteration's background work — everything that happens without a user — in one file, kept current
at every planning step (`be-iteration-planning` › Worker changes). Plain words only: no queue, job,
event or worker names; kickoff names them and records them in `AS-BUILT.md`.

Status: **Step 1 draft, 2026-10-13.** Mode incremental (Baseline `launch-2026-09-30-jxmr`) · Intake mode `brief` ·
Intake hash `d5f100464051`.

## Counts

| NEW | CHANGED | REMOVED |
| --- | --- | --- |
| 0 | 0 | 0 |

**None so far.** The brief asks for no work that runs without a user. Every setup write happens in the owner's own
request, and the guide's ticks are read when the shell asks for them, so nothing runs on a schedule.

| # | Change | Background work | When it runs | What it touches | On failure | Who is told | Requirement | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | none | — | — | — | — | — | BRIEF.md:205–219 |

## Not background work, noted so it is not missed

- **Existing clinics counted as set up (D7)** — a one-time fill done with the database change itself, not a job:
  [db-changes.md › organization_setting](db-changes.md#organization_setting--changed).
- **Invitations (setup step 7)** — the invitation email already goes out through the built invitation flow (launch
  routes-final §2.C); setup sends nothing of its own.

## Open (Step 4)

- **A "finish setting up" reminder?** Big products email an owner who left setup unfinished (for example a day
  later). The brief does not ask for it (BRIEF.md › Out of scope lists no such item either) — a question for Step 4:
  add it (NEW background work) or leave it out.
