# Route changes — feat-clinic-setup-2026-10-13-sltd

The iteration's proposed routes, in one file (`be-iteration-planning` › Route changes). Proposals only —
kickoff confirms each route when it builds it and records any change in `AS-BUILT.md`; the built truth is
`docs/routes.txt`.

Status: **Step 6, 2026-10-13** — the quick setup (D26–D28), both sub-domains final (D24, D30); paths follow D22 (`onboarding-setup`); access D19; confirmed per sub-domain at Step 5. Mode incremental (Baseline `launch-2026-09-30-jxmr`) · Intake mode `brief` ·
Intake hash `790d068ffc3b`. What exists is the launch's route review (`launch-2026-09-30-jxmr/plans/routes-final.md`,
§1–§12 — D9), not the drop's `schema-routes.md` wording. **Change** is against that: `NEW` · `CHANGED` · `REUSED`
(the same route as built, called by setup — no change).

## Counts

| Area | NEW | CHANGED | REUSED | Total |
| --- | --- | --- | --- | --- |
| Onboarding setup | 3 | 0 | 0 | 3 |
| Branches & places | 0 | 1 | 9 | 10 |
| Team | 0 | 0 | 4 | 4 |
| Offerings | 0 | 0 | 2 | 2 |
| Organization and its settings (platform) | 0 | 0 | 6 | 6 |
| **Total** | **3** | **1** | **21** | **25** |

## Onboarding setup (app domain, sub-domain `onboarding-setup` — D22)

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-1 | NEW | GET | `/api/v1/app/onboarding-setup` | `organization:update` — managers only (D19) | the setup: answered steps, skips, live or not, the 3 guide items with their ticks read from the records | BRIEF.md:50, 104–112, 169–171 | — |
| RC-2 | NEW | PATCH | `/api/v1/app/onboarding-setup` | `organization:update` | answer a step, skip or un-skip a guide item, "Explore first", hide or reopen the guide | BRIEF.md:51–52, 104–112, 229–230 | — |
| RC-3 | NEW | POST | `/api/v1/app/onboarding-setup/complete` | `organization:update` | go live — refused while the clinic type, the main branch or a service is missing | BRIEF.md:69–76, 222–224, 276 | — |

## Branches & places (launch routes-final §1)

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-4 | CHANGED | POST | `/api/v1/app/branches` | `branch:create` | create a branch — a clinic's first branch becomes main by itself | BRIEF.md:146–150, 277 · users.md:132 | `POST /api/v1/app/branches` as planned — AS-BUILT #2 |
| RC-5 | REUSED | GET | `/api/v1/app/branches/my` | any member | the members' notice ("still being set up") and the shell's "needs a branch" guard on every room | BRIEF.md:117–121 | as built (launch) |
| RC-6 | REUSED | PATCH | `/api/v1/app/branches/{branch_id}` | `branch:update` | setup step 3 (the branch's default doctor / therapist); hours, GST and links later from the branch drawer | BRIEF.md:65–68, 131–133 | as built (launch) |
| RC-7 | REUSED | GET | `/api/v1/app/branches/{branch_id}/rooms` | any member | the branch drawer's Places & days | BRIEF.md:131–133 | as built (launch) |
| RC-8 | REUSED | POST | `/api/v1/app/branches/{branch_id}/rooms` | `branch:create` | add a room | BRIEF.md:131–133 | as built (launch) |
| RC-9 | REUSED | PATCH · DELETE | `/api/v1/app/branches/{branch_id}/rooms/{branch_room_id}` | `branch:update` · `branch:delete` | rename, switch off, remove a room | BRIEF.md:131–133 | as built (launch) |
| RC-10 | REUSED | GET · POST | `/api/v1/app/branches/{branch_id}/machines` | any member · `branch:create` | list, add a machine | BRIEF.md:131–133 | as built (launch) |
| RC-11 | REUSED | PATCH · DELETE | `/api/v1/app/branches/{branch_id}/machines/{branch_machine_id}` | `branch:update` · `branch:delete` | rename, switch off, remove a machine | BRIEF.md:131–133 | as built (launch) |
| RC-12 | REUSED | GET · POST | `/api/v1/app/branches/{branch_id}/holidays` | any member · `branch:create` | list, add a holiday | BRIEF.md:131–133 | as built (launch) |
| RC-13 | REUSED | DELETE | `/api/v1/app/branches/{branch_id}/holidays/{branch_holiday_id}` | `branch:delete` | remove a holiday | BRIEF.md:131–133 | as built (launch) |

## Team (launch routes-final §2, §12)

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-14 | REUSED | PATCH | `/api/v1/tenancy/organization/memberships/{membership_id}` | `membership:update` (the owner's extra roles: the owner only, D81 (4)) | setup step 3 — Doctor or Therapist as an extra role, the branch's days and hours as the owner's | BRIEF.md:65–68, 225–226 | as built (launch) |
| RC-15 | REUSED | POST | `/api/v1/tenancy/organization/memberships` | `membership:create` | the guide's "Invite your team" — one invitation per row, a real role, the main branch, the branch's days and hours (D16) | BRIEF.md:107–109 | as built (launch) |
| RC-16 | REUSED | GET | `/api/v1/app/roles` | any member | the invite role picker; finding Doctor / Therapist for step 3 | BRIEF.md:65–68, 107–109 | as built (launch) |
| RC-17 | REUSED | GET | `/api/v1/app/memberships` | any member | the guide's "Invite your team" / "Invite your doctor" (with `holds=`) | BRIEF.md:107–109 | as built (launch) |

## Offerings (launch routes-final §3)

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-18 | REUSED | POST | `/api/v1/app/offerings` | `offering:create` | "Go live" — one Consultation per chosen specialty; the guide's "Add your treatments" — one service per ticked row | BRIEF.md:69–76, 105–106 | as built (launch) |
| RC-19 | REUSED | GET | `/api/v1/app/offerings` | any member | no duplicate Consultation; the guide shows what already exists | BRIEF.md:73–76, 231–234 | as built (launch) |

## Organization and its settings (platform — tenancy)

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-20 | REUSED | GET | `/api/v1/tenancy/organization` | any member | prefill: clinic name (branch name), specialties | BRIEF.md:57–64 | as built (launch) |
| RC-21 | REUSED | PATCH | `/api/v1/tenancy/organization` | `organization:update` | setup step 1 (specialties); Settings › Clinic (specialties, timezone) | BRIEF.md:57–58, 127–130 | as built (launch) |
| RC-22 | REUSED | GET | `/api/v1/tenancy/organization/settings` | `organization:read` | Settings › Clinic | BRIEF.md:127–130 | as built (launch) |
| RC-23 | REUSED | PATCH | `/api/v1/tenancy/organization/settings` | `organization:update` | Settings › Clinic — reminder hour, lead hold, retarget (no day float, D17) | BRIEF.md:127–130 | as built (launch) |
| RC-24 | REUSED | PUT | `/api/v1/tenancy/organization/logo` | `organization:update` | Settings › Clinic links to the logo (Settings › General, as built) | BRIEF.md:127–130 | as built (launch) |
| RC-25 | REUSED | POST | `/api/v1/users/me/onboarding/complete` | signed in | the shortened /onboarding still marks the account onboarded | BRIEF.md:135–144 | as built (launch) |

## Before → after

| # | Route | What changes | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| RC-4 | `POST /api/v1/app/branches` | behaviour | a branch is main only when the request sends `is_main: true`; a clinic can have no main branch | a clinic's first branch becomes main by itself; a later one stays as sent (a second main is still a `409`) | BRIEF.md:146–150 — the design's rule (users.md:132), never built |

## Findings

- **No route serves a clinic's setup progress today** — RC-1 to RC-3 are new; they live in the app domain's
  `onboarding-setup` sub-domain and store through the tenancy settings service (D22).
- **`schema-routes.md` names no setup operation** (it is a brief) — RC-1 to RC-3 trace to `BRIEF.md` only.
