# Worker changes — feat-clinic-setup-2026-10-13-sltd

The iteration's background work — everything that happens without a user — in one file, kept current
at every planning step (`be-iteration-planning` › Worker changes). Plain words only: no queue, job,
event or worker names; kickoff names them and records them in `AS-BUILT.md`.

Status: **Step 4, 2026-10-13** — none (D21). Mode incremental (Baseline `launch-2026-09-30-jxmr`) · Intake mode `brief` ·
Intake hash `790d068ffc3b`.

## Counts

| NEW | CHANGED | REMOVED |
| --- | --- | --- |
| 0 | 0 | 0 |

**None so far.** The brief asks for no work that runs without a user. Every setup write happens in the owner's own
request, and the guide's ticks are read when the shell asks for them, so nothing runs on a schedule.

| # | Change | Background work | When it runs | What it touches | On failure | Who is told | Requirement | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | none | — | — | — | — | — | BRIEF.md:169–181 |

## Not background work, noted so it is not missed

- **Existing clinics counted as set up (D7)** — a one-time fill done with the database change itself, not a job:
  [db-changes.md › organization_setting](db-changes.md#organization_setting--changed).
- **Invitations (setup step 7)** — the invitation email already goes out through the built invitation flow (launch
  routes-final §2.C); setup sends nothing of its own.

## Decided (Step 4)

- **No "finish setting up" reminder email in this iteration** (D21) — the header launcher reminds the managers on
  every room. A later iteration can add the email with its own timing and unsubscribe rules.
