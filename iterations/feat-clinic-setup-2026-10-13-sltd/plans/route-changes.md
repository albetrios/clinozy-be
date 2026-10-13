# Route changes — feat-clinic-setup-2026-10-13-sltd

The iteration's proposed routes, in one file (`be-iteration-planning` › Route changes). Proposals only —
kickoff confirms each route when it builds it and records any change in `AS-BUILT.md`; the built truth is
`docs/routes.txt`.

Status: **Step 1 draft, 2026-10-13.** Mode incremental (Baseline `launch-2026-09-30-jxmr`) · Intake mode `brief` ·
Intake hash `120675462365`. What exists is the launch's route review (`launch-2026-09-30-jxmr/plans/routes-final.md`,
§1–§12 — D9), not the drop's `schema-routes.md` wording. **Change** is against that: `NEW` · `CHANGED` · `REUSED`
(the same route as built, called by setup — no change).

## Counts

| Area | NEW | CHANGED | REUSED | Total |
| --- | --- | --- | --- | --- |
| Clinic setup | 3 | 0 | 0 | 3 |
| Branches & places | 0 | 1 | 9 | 10 |
| Team | 0 | 0 | 4 | 4 |
| Offerings | 0 | 0 | 2 | 2 |
| Organization and its settings (platform) | 0 | 0 | 6 | 6 |
| **Total** | **3** | **1** | **21** | **25** |

## Clinic setup

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-1 | NEW | GET | `/api/v1/app/clinic-setup` | managers (`organization:update`) — open: or every member (db-changes › Open 2) | the setup status: answered steps, skipped items, deferred / completed / hidden, and each guide item's done flag read from the records | BRIEF.md:40–41, 105, 179–181 |
| RC-2 | NEW | PATCH | `/api/v1/app/clinic-setup` | `organization:update` | answer a step, skip or un-skip an item, defer ("Explore first"), hide or reopen the guide | BRIEF.md:42–44, 101–104, 243–244 |
| RC-3 | NEW | POST | `/api/v1/app/clinic-setup/complete` | `organization:update` | complete the essentials — refused while one is missing | BRIEF.md:190, 235–240, 289 |

## Branches & places (launch routes-final §1)

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-4 | CHANGED | POST | `/api/v1/app/branches` | `branch:create` | create a branch — a clinic's first branch becomes main by itself | BRIEF.md:156–160, 290 · users.md:132 |
| RC-5 | REUSED | GET | `/api/v1/app/branches/my` | any member | the members' notice ("still being set up"), the booking guard | BRIEF.md:128–131 |
| RC-6 | REUSED | PATCH | `/api/v1/app/branches/{branch_id}` | `branch:update` | setup step 4 (hours), step 5 (default doctor / therapist), the guide's GST and links | BRIEF.md:56–60 |
| RC-7 | REUSED | GET | `/api/v1/app/branches/{branch_id}/rooms` | any member | the branch drawer's Places & days | BRIEF.md:137–138 |
| RC-8 | REUSED | POST | `/api/v1/app/branches/{branch_id}/rooms` | `branch:create` | add a room | BRIEF.md:137–138 |
| RC-9 | REUSED | PATCH · DELETE | `/api/v1/app/branches/{branch_id}/rooms/{branch_room_id}` | `branch:update` · `branch:delete` | rename, switch off, remove a room | BRIEF.md:137–138 |
| RC-10 | REUSED | GET · POST | `/api/v1/app/branches/{branch_id}/machines` | any member · `branch:create` | list, add a machine | BRIEF.md:137–138 |
| RC-11 | REUSED | PATCH · DELETE | `/api/v1/app/branches/{branch_id}/machines/{branch_machine_id}` | `branch:update` · `branch:delete` | rename, switch off, remove a machine | BRIEF.md:137–138 |
| RC-12 | REUSED | GET · POST | `/api/v1/app/branches/{branch_id}/holidays` | any member · `branch:create` | list, add a holiday | BRIEF.md:137–138 |
| RC-13 | REUSED | DELETE | `/api/v1/app/branches/{branch_id}/holidays/{branch_holiday_id}` | `branch:delete` | remove a holiday | BRIEF.md:137–138 |

## Team (launch routes-final §2, §12)

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-14 | REUSED | PATCH | `/api/v1/tenancy/organization/memberships/{membership_id}` | `membership:update` (the owner's extra roles: the owner only, D81 (4)) | step 4 (the owner's hours), step 5 (Doctor or Therapist as an extra role) | BRIEF.md:56–60, 241–242 |
| RC-15 | REUSED | POST | `/api/v1/tenancy/organization/memberships` | `membership:create` | step 7 — one invitation per row, a real role, the main branch | BRIEF.md:64–65, 249–251 |
| RC-16 | REUSED | GET | `/api/v1/app/roles` | any member | step 7's role picker; finding the Doctor / Therapist role for step 5 | BRIEF.md:64 |
| RC-17 | REUSED | GET | `/api/v1/app/memberships` | any member | the guide's "A doctor to book" and "Invite your team" (with `holds=`) | BRIEF.md:117–118 |

## Offerings (launch routes-final §3)

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-18 | REUSED | POST | `/api/v1/app/offerings` | `offering:create` | step 6 — one service per ticked row | BRIEF.md:61–63, 76–81 |
| RC-19 | REUSED | GET | `/api/v1/app/offerings` | any member | step 6 shows what already exists (never asked twice) | BRIEF.md:245–246 |

## Organization and its settings (platform — tenancy)

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-20 | REUSED | GET | `/api/v1/tenancy/organization` | any member | prefill: clinic name, specialties, timezone, logo | BRIEF.md:48–58 |
| RC-21 | REUSED | PATCH | `/api/v1/tenancy/organization` | `organization:update` | step 1 (specialties), step 4 (timezone, when changed), Settings › Clinic | BRIEF.md:50, 56–58, 139–142 |
| RC-22 | REUSED | GET | `/api/v1/tenancy/organization/settings` | `organization:read` | Settings › Clinic | BRIEF.md:139–142 |
| RC-23 | REUSED | PATCH | `/api/v1/tenancy/organization/settings` | `organization:update` | Settings › Clinic — day float, reminder hour, lead hold, retarget | BRIEF.md:139–142 |
| RC-24 | REUSED | PUT | `/api/v1/tenancy/organization/logo` | `organization:update` | the guide's "Clinic logo" (Settings › General, as built) | BRIEF.md:124 |
| RC-25 | REUSED | POST | `/api/v1/users/me/onboarding/complete` | signed in | the shortened /onboarding still marks the account onboarded | BRIEF.md:144–154 |

## Before → after

| # | Route | What changes | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| RC-4 | `POST /api/v1/app/branches` | behaviour | a branch is main only when the request sends `is_main: true`; a clinic can have no main branch | a clinic's first branch becomes main by itself; a later one stays as sent (a second main is still a `409`) | BRIEF.md:156–160 — the design's rule (users.md:132), never built |

## Findings

- **No route serves a clinic's setup progress today** — RC-1 to RC-3 are new; where they live (the app domain,
  reading the tenancy settings through its service) is a Step 4 question.
- **`schema-routes.md` names no setup operation** (it is a brief) — RC-1 to RC-3 trace to `BRIEF.md` only.
