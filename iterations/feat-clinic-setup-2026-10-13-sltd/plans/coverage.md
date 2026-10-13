# Coverage — feat-clinic-setup-2026-10-13-sltd

Status: **Step 1 draft, 2026-10-13.** Every row is `open` until Steps 4–6 give it a requirement, a feature and an
acceptance, or put it out of scope with the decision that did.

Mode: incremental (Baseline `launch-2026-09-30-jxmr`) · Intake mode `brief` · Intake hash `120675462365` ·
Schema-routes `5f90325208e1` (unchanged from the Baseline).

## Intake read (Step 1)

The gate passed: 23 files — `BRIEF.md` received, 22 carried forward byte-for-byte from the Baseline (their own
coverage is the launch's `plans/coverage.md`, 517 rows, every one covered or out of scope). For this change:

| File | Read in full | Kind | What it gives this plan |
| --- | --- | --- | --- |
| `BRIEF.md` | yes (main session) | the change list | every row below |
| `PRD.md` | yes (main session) | product | roles (PRD.md:15–26), "Owner / Admin runs the clinic … branches" (PRD.md:24), empty states (PRD.md:232), mobile not designed (PRD.md:224 — the launch built it) |
| `users.md` | yes (main session) | screen spec | the Branch drawer (users.md:126–156, 176–188, 281–288), "the first branch becomes main" (users.md:132), user drawer hours 10:00–19:00 (users.md:114–115) |
| `schema-routes.md` | yes (read-through, 1758 lines) | data and URL contract | Organization (138–152), Branch (154–182), User (184–209), Offering (557–579), enums `offering_specialty` (1339–1347), `role` (996–1007); no setup, onboarding or settings operation (findings below) |
| `today.md` | yes (main session) | screen spec | regions (today.md:13–21) — the guide card sits in the main column above the tiles; empty states (today.md:200–207); "New booking" → Leads (today.md:153, as built → `/leads/create`); the bill sample "Consultation ₹800 · GST exempt", "Chemical peel ₹3,500 · GST 18%" (today.md:263) |
| `shell.md` | yes (main session) | shared | clinic settings live in Users (shell.md:61); the one app-wide notice pattern is the bottom pill (shell.md:63); Account menu contents (shell.md:27) |
| `_patterns.md` | yes (main session) | shared | Right drawer — automatic width 560 / 680 / 840 (`_patterns.md:28`); step cards (40–49); toasts (231–238); states and save failures (278–291); the command menu's Actions group (203) |
| `offerings.md`, `appointments.md`, `leads.md`, `patients.md`, `patient-file.md`, `payments.md`, `tasks.md`, `medical.md`, `clinic-stock.md`, `splash.md`, `preset.md`, `design-brief-preset.md`, `_index.md`, `_report.md` | yes (read-through, 15 files) | screen specs, theme, index, report | starter-service facts (offerings.md:63–82, 240, 321; payments.md:147); first-use states (none); the splash's 3.7 s cover (splash.md:17, 46–48); theme progress colour and card tokens (preset.md:19–21, 70, 189–193); findings F7–F18 below |
| `support.js` | yes (read-through, 1911 lines) | generic runtime engine — **ignored** | "GENERATED from dc-runtime/src/*.ts — do not edit" (support.js:1): the `<x-dc>` template compiler and the `DCLogic` base class; no Clinozy strings, data or rules |
| `Clinozy.dc.html` | **partly** — 2.46 MB (~600k tokens). Read in full: tokens, CSS, splash, header, account menu, Today (1–679), the drawer and step-card template (876–946, 3754–3853), command menu, toasts, delete confirm (2668–2694), the booking form shell (2741–2870), Users with the branch and user drawers (1083–1219, 5143–5233), Offerings (5450–5529), Today's view model (5576–5608), the app's core logic (2965–4709). Keyword-scanned only: the other rooms' templates and logic (patients, payments, stock, medical, leads, appointments, tasks) — no setup, onboarding or branch-setup logic found | the prototype — every surface has a spec file | no setup or first-run state anywhere; the app opens on Leads (4494); Today has nothing between the greeting row and the tiles (576–654) — where the guide card goes; branch drawer defaults close 19:00, city "Surat" (5197); no rooms, machines or holidays editors; specialty has no UI (`OF_SPECS` 3547 unused); findings F18–F21 below. The file is unchanged from the Baseline, whose planning covered it (launch `coverage.md`) |

## Coverage

| # | Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | BRIEF.md:31–33 | the drawer opens by itself — Owner / Admin, first landing, essentials missing, not deferred | | | BRIEF.md:266 | open |
| C2 | BRIEF.md:34–38 | a right drawer, 560px, full-screen sheet on a phone, step cards, its own address | | | BRIEF.md:268 | open |
| C3 | BRIEF.md:39 | header "Set up <clinic>", "About 3 minutes · Step n of 7", progress bar | | | BRIEF.md:268 | open |
| C4 | BRIEF.md:40–41 | saved as you go; answers never asked twice; resumes on any device | | | BRIEF.md:268 | open |
| C5 | BRIEF.md:42–44, 243–244 | closing = "Explore first"; never opens by itself again | | | BRIEF.md:280 | open |
| C6 | BRIEF.md:48 | step 0 — welcome | | | BRIEF.md:266 | open |
| C7 | BRIEF.md:50 | step 1 — specialties (1–6) | | | — | open |
| C8 | BRIEF.md:52–55 | steps 2–3 — main branch address and contact; creates the main branch with the owner on its team | | | BRIEF.md:270 | open |
| C9 | BRIEF.md:56–58 | step 4 — hours; the owner's hours too; timezone | | | BRIEF.md:272 | open |
| C10 | BRIEF.md:59–60, 241–242 | step 5 — the owner as doctor / therapist (extra role, branch default) | | | BRIEF.md:274 | open |
| C11 | BRIEF.md:61–63, 76–81 | step 6 — starter services per specialty, at least one | | | BRIEF.md:275 | open |
| C12 | BRIEF.md:64–65, 249–251 | step 7 — invitations with a real role to the main branch; failures listed | | | BRIEF.md:277 | open |
| C13 | BRIEF.md:66–72 | Ready — tiles, "How did you hear about us?", "Book your first appointment" | | | BRIEF.md:279 | open |
| C14 | BRIEF.md:73–75 | each step says why it is asked | | | BRIEF.md:268 | open |
| C15 | BRIEF.md:83–97 | the setup guide card on Today | | | BRIEF.md:283 | open |
| C16 | BRIEF.md:98–100 | "Continue setup"; "New booking" with no open branch opens setup | | | BRIEF.md:280, 282 | open |
| C17 | BRIEF.md:101–103 | recommended items, Skip, "All set" for 7 days | | | BRIEF.md:283 | open |
| C18 | BRIEF.md:104 | Hide; reopen from the account menu and ⌘K | | | BRIEF.md:285 | open |
| C19 | BRIEF.md:105–126 | 14 guide items, each ticked from real records | | | BRIEF.md:283 | open |
| C20 | BRIEF.md:128–131 | the members' notice while there is no open branch | | | BRIEF.md:286 | open |
| C21 | BRIEF.md:137–138 | branch drawer "Places & days" — rooms, machines, holidays | | | BRIEF.md:291 | open |
| C22 | BRIEF.md:139–142 | Settings › Clinic — specialties, timezone, day float, reminder hour, lead hold, retarget | | | BRIEF.md:293 | open |
| C23 | BRIEF.md:144–154 | /onboarding shortened; invite and questions out | | | BRIEF.md:295 | open |
| C24 | BRIEF.md:156–160 | a clinic's first branch becomes main | | | BRIEF.md:290 | open |
| C25 | BRIEF.md:162–177 | setup states | | | — | open |
| C26 | BRIEF.md:179–193 | when each step writes | | | — | open |
| C27 | BRIEF.md:229–231 | who: `organization:update`; each write its own code; never in View-as | | | BRIEF.md:286 | open |
| C28 | BRIEF.md:232–234 | scope: the clinic, not a person | | | — | open |
| C29 | BRIEF.md:235–240 | essentials; completion refused while one is missing | | | BRIEF.md:289 | open |
| C30 | BRIEF.md:247–248 | safe to repeat; a second main is read back | | | BRIEF.md:270 | open |
| C31 | BRIEF.md:252–253 | clinics already ready count as set up | | | BRIEF.md:288 | open |
| C32 | BRIEF.md:254 | a personal workspace never shows setup | | | — | open |
| C33 | BRIEF.md:255–260 | accessible: focus, announcements, keys, phone, en + es | | | BRIEF.md:296 | open |
| C34 | BRIEF.md:261–262 | measured: analytics events, never patient data | | | — | open |
| C35 | BRIEF.md:298–308 | out of scope (8 items) | | | — | open |

## Delta

Step 2, 2026-10-13 — MODE incremental, Intake mode `brief`: `BRIEF.md` is the change list.

**The diff.** `pnpm iteration:diff launch-2026-09-30-jxmr feat-clinic-setup-2026-10-13-sltd` — in both repositories:
`+ added (1): BRIEF.md`; screens unchanged; `PRD.md`, `schema-routes.md` and the prototype unchanged; no entity,
field, enum, route or operation changed. Nothing changed but the brief — **no finding**.

**Classified** (the brief's changes, against what the launch built):

| Change | Kind | Where |
| --- | --- | --- |
| Setup drawer over Today, its 7 steps and Ready | new surface | Today (frontend); three new setup routes (backend) |
| Setup guide card on Today | new surface | Today |
| Members' notice while no branch is open | new surface (small) | Today |
| Places & days in the branch drawer | structural — a fourth step | Users › Branches |
| Settings › Clinic | new surface | Settings (frontend) |
| /onboarding shortened | structural — steps removed | /onboarding (frontend) |
| First branch becomes main | behaviour | branch create (backend) |
| Setup progress columns + the one-time fill | data | `tenancy.organization_settings` (backend) |

**The Baseline's Standing deviations this change touches** — plan against what was built:

| Item (repository) | Design says | Built as | Since | What it means here |
| --- | --- | --- | --- | --- |
| Staff accounts (be) · Users (fe) | a user with a password | an invitation by email; "Invited" with Resend | launch — D4 · D17 | setup step 7 sends invitations, never passwords |
| Roles (be) · Marketing role (fe) | a fixed list of 9; no Marketing in the prototype | Owner plus eight seeded, editable roles, several per person; Marketing listed | launch — D5 · Q-U2 | step 5 adds Doctor / Therapist as an **extra** role (main stays Owner); step 7's roles are the clinic's real roles |
| Rooms and machines (be) | a fixed room list, no machines | `app.branch_rooms`, `app.branch_machines` per branch; a booking may name both | launch — D28 | the Places & days editors and the guide's room / machine items have records to write |
| Access model (be) | role × section matrix | per-resource permission codes | launch | setup gates on `organization:update`; each write keeps its own code |
| Branch field names · Branch access (be) | `addressLine1`, `pin`, a user's `branchIds` | `address_line_one`, `postal_code`; `app.branch_members` | launch | the owner is put on the main branch's members at create |
| Branch required fields (fe) | name and address line only | name, address, area, city, six-digit PIN, phone, email | launch — D157 | setup steps 2–3 ask exactly these |
| Main branch (fe) | a Main switch in the drawer | read-only — "one per clinic, set when it opened" | launch — D157 | **the backend never sets it** (the client must send `is_main`) — RC-4 makes it true |
| New branch City and State (fe) | "Surat / Gujarat" | copied from the main branch | launch — L-31d | setup's main branch has none to copy — City is asked, State prefilled "Gujarat" |
| Offering default staff (be) | `defaultDoctorId`, `room` on an offering | none | launch — O6 | starter services set no doctor or room |
| Offer pricing when billing (be) | the drawer prices a line | the server applies the best live offer | launch — D81 (6) | none — setup creates no offers |
| Day close opening (be) · Day close default float (fe) | a configured `default_float` | the carried or recounted cash only | launch — B25 · D156 | **`default_day_float` is stored but read by nothing** (`app.container.ts:74` passes it; no rule uses it) — the guide's "Cash drawer float" and Settings › Clinic's float field would set a value with no effect → Step 4 proposes dropping both |
| Focus (fe) | not moved | trapped in drawers and confirms, returned to the opener | launch — §7.2 | the setup drawer does the same, and moves focus to each step's title (BRIEF.md:256) — resolves F9 for the build |
| Routes (fe) | one page switching rooms | URL-driven dialog routes | launch — D24 | the setup drawer has its own address, like every drawer |
| Landing · Splash exit (fe) | Leads; a fixed 3.7 s splash | the role home; the splash leaves when boot resolves (≥ 2,050 ms) | launch — D25, Q-S1 | an Owner lands on Today; the drawer opens after the splash (F14) |
| Account menu · Settings (fe) | identity, Status, Appearance, Log out; no Settings | plus the platform rows; Settings as a 1040px record drawer | launch — §3.2, D126 | homes for "Setup guide" (account menu) and the Clinic section (Settings) — resolves F21 |
| Drawer step summaries and peeks · Open step circle (fe) | raw figures; near-black circle | values with units; the stone tone | launch — L-30c, L-35 | setup's peeks read "Mon–Sat · 10:00–19:00", "₹500" like every drawer |
| Dirty close (fe) | silent | "Discard changes?" guard | launch — Q-P1 | only the open step's unsaved edits can be lost — saved steps never are |
| Quick-create New offering (fe) | steps that never open | three working steps | launch — §7.3 | step 6's "+ Add your own" can reuse it |
| Empty states · No clinic room open (fe) | "No … matches" only | the design's unreachable copy + "New …"; `ClinicHomeEmpty` | launch — R26, D101 | the members' notice is a new state beside these |

Every other Standing deviation (money, stock, medical, tasks, messaging, patient file …) is untouched by this change.

## Reconciliation

Step 3. First findings from Step 1 (each gets a verdict there — the launch's route review wins for what exists, D9):

| # | Finding | Evidence |
| --- | --- | --- |
| F1 | Offering names are unique in a clinic, and `specialty` is one value per offering — two specialties cannot both start with a plain "Consultation" | schema-routes.md:565, 567, 1739 · launch §12 (`offering_name_taken`) · BRIEF.md:76–81 |
| F2 | A second main branch is a `409` (as built) — "read back, not an error" is the client's handling, not a server change | schema-routes.md:163, 1754 · launch routes-final §1.A.9 · BRIEF.md:247–248 |
| F3 | Branch name 1–60 characters, clinic name 1–120 — the prefill must be cut to fit | schema-routes.md:146, 161 · BRIEF.md:52 |
| F4 | Staff hours default 10:00–19:00, branch hours 10:00–20:00 — the brief syncs only the owner; invitations from step 7 could carry the branch's hours | schema-routes.md:173–174, 202–203 · BRIEF.md:203–206 |
| F5 | `schema-routes.md` has no Organization write, no settings fields, no rooms / machines / holidays as records, no invitations, no main / extra roles — all exist in the launch as built (route review §1–§2, §12; AS-BUILT Standing deviations), so the plan follows the build | schema-routes.md:138–152, 1156–1162, 184–209 · D9 |
| F6 | No `/settings` route and no dialog over `/today` in the route map; the setup drawer's address and Settings › Clinic are frontend decisions (the Settings hash modal exists in the build) | schema-routes.md:21, 116 · BRIEF.md:38 |
| F7 | Drawer width: the design sizes a drawer by its content — 560px only for ≤ 8 fields with no price field and no chip group over 5 options; 680px otherwise; 840px with an items table. Setup has prices, 6 specialty chips, 7 weekday chips and step 6's editable rows → 680 or 840, not 560 | `_patterns.md:28` · BRIEF.md:34 |
| F8 | The design's step cards never block "Next" and any header opens any step; setup's "Next" saves and steps depend on each other (step 3 needs step 2; step 6 needs one service). The design's one locked-step precedent is New lead's step 2 ("After contact") | `_patterns.md:40–49` · leads.md:252 · BRIEF.md:40–41, 275 |
| F9 | Every drawer spec says nothing is auto-focused; the brief moves focus to each step's title | offerings.md:143 · patients.md:103 · BRIEF.md:256 |
| F10 | Progress bar colour: the theme's progress fill is the green `#287c42` (chart-1), 200 ms ease, radius 999px; the splash's ink bar is the splash's own | preset.md:19–21, 189–193 · splash.md:21 |
| F11 | Starter services: the Offering drawer's category (Consultation · Treatment · Package · LHR · Product), quick fills (Consultation 20 min, sky), GST Inclusive / Exclusive (default Exclusive), lowest price = 85% of the offer price rounded to ₹50; each starter row must also set its `specialty` | offerings.md:63–82, 240, 321 · schema-routes.md:567 |
| F12 | Consultation must be category Consultation for consultation bills; the design prices it ₹300 (payments.md:147) and ₹800 (today.md:263) | payments.md:147, 327 · today.md:263 · appointments.md:71 |
| F13 | "A doctor to book": the booking form's doctor picker also lists therapists — answering "Yes, as a therapist" may already make the clinic bookable | appointments.md:74, 364 · BRIEF.md:115, 237–240 |
| F14 | The splash covers the app (z 999) until 3.7 s (0.5 s reduced motion) and holds offline — the drawer opens after it; its ticker ends on "All set", the same words as the guide's done state | splash.md:17, 46–48, 84, 97 · BRIEF.md:103 |
| F15 | Cash drawer float: the design has no setting for it (only "Accept ₹X" at the gate); the build has `organization_settings.default_day_float`, while the launch's Standing deviations say the opening is carried or recounted cash, not a configured float (B25) — Step 2 checks which is true | payments.md:191, 327 · schema-routes.md:708, 1425 · launch AS-BUILT (B25) |
| F16 | Patients: the design makes Home branch optional (hidden with one branch); the build requires `home_branch_id` — the build wins (D9), and setup's main branch is what every patient gets | patients.md:49 · launch routes-final §7.A |
| F18 | Default hours: the design's branch drawer opens 10:00–19:00 (users.md:144–145, prototype 5197), the server's branch default is 10:00–20:00, staff default 10:00–19:00 — the brief's step 4 says 20:00; 19:00 would match the design's drawer and every invited member's default | users.md:144–145 · schema-routes.md:173–174, 202–203 · BRIEF.md:56 |
| F19 | The design's new-branch City defaults to "Surat"; the brief prefills only the branch name (from the clinic name) | users.md:137, 363 · prototype 5197 · BRIEF.md:52 |
| F20 | "Places & days" as a fourth branch-drawer step: the prototype merges more than 3 titled sections into at most 3 steps (3823) — the build's branch drawer has 3 steps; a fourth step changes its step names | prototype 3823 · users.md:283 · BRIEF.md:137 |
| F21 | Entry points the design has no slot for: "Setup guide" in the account menu and ⌘K, "Settings › Clinic" — the design's closest fit is new account-menu rows between Appearance and Log out (shell.md:58, 62); the members' notice can reuse the one app-wide pill (shell.md:63) | shell.md:27, 58–63 · `_patterns.md:203` · BRIEF.md:104, 128–131 |
| F17 | Copy the setup drawer reuses as is: "Saving…", "Not saved · your changes are kept", "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry", "View only · your role can’t change this" | `_patterns.md:285` · users.md:435–436 |
