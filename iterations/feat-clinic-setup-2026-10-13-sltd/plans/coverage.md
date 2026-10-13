# Coverage — feat-clinic-setup-2026-10-13-sltd

Status: **Step 3, 2026-10-13.** Every row is `open` until Steps 4–6 give it a requirement, a feature and an
acceptance, or put it out of scope with the decision that did.

Mode: incremental (Baseline `launch-2026-09-30-jxmr`) · Intake mode `brief` · Intake hash `d5f100464051` ·
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

Line numbers are `BRIEF.md` as re-placed on 2026-10-13 (Intake hash `d5f100464051` — setup moved from Today into
the app shell, D11; the guide's launcher, D12).

| # | Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | BRIEF.md:37–39 | the drawer opens by itself — Owner / Admin, the first landing in the clinic on whichever room it opens on, essentials missing, nobody deferred | | | BRIEF.md:296 | open |
| C2 | BRIEF.md:40–41, 271–272 | not tied to a room — the shell owns the drawer, the launcher and the notice; the default room (role home) may change | | | BRIEF.md:298 | open |
| C3 | BRIEF.md:42–47 | the design's right drawer, a full-screen sheet on a phone, step cards, its own address riding on any room | | | BRIEF.md:300 | open |
| C4 | BRIEF.md:48 | header "Set up <clinic>", "About 3 minutes · Step n of 7", progress bar | | | BRIEF.md:301 | open |
| C5 | BRIEF.md:49–50 | saved as you go; answers never asked twice; resumes on any device | | | BRIEF.md:301 | open |
| C6 | BRIEF.md:51–52, 273–274 | closing = "Explore first"; never opens by itself again | | | BRIEF.md:313 | open |
| C7 | BRIEF.md:57–58 | step 0 — welcome | | | BRIEF.md:296 | open |
| C8 | BRIEF.md:59–60 | step 1 — specialties (1–6) | | | — | open |
| C9 | BRIEF.md:61–64 | steps 2–3 — main branch address and contact; creates the main branch with the owner on its team | | | BRIEF.md:303 | open |
| C10 | BRIEF.md:65–67 | step 4 — hours; the owner's hours too; timezone | | | BRIEF.md:305 | open |
| C11 | BRIEF.md:68–69, 269–270 | step 5 — the owner as doctor / therapist (extra role, branch default) | | | BRIEF.md:307 | open |
| C12 | BRIEF.md:70–72, 86–91 | step 6 — starter services per specialty, at least one | | | BRIEF.md:308 | open |
| C13 | BRIEF.md:73–74, 279–281 | step 7 — invitations with a real role to the main branch; failures listed | | | BRIEF.md:310 | open |
| C14 | BRIEF.md:75–82 | Ready — tiles, "How did you hear about us?", "Book your first appointment" over the room, "Done" | | | BRIEF.md:312 | open |
| C15 | BRIEF.md:83–85 | each step says why it is asked | | | BRIEF.md:301 | open |
| C16 | BRIEF.md:93–116 | the guide follows current practice: one drawer holds the steps and the checklist | | | BRIEF.md:317 | open |
| C17 | BRIEF.md:117–120 | the header's "Setup" launcher — progress ring and count, every room, Owner / Admin; the ring alone on a phone | | | BRIEF.md:313 | open |
| C18 | BRIEF.md:121 | the account menu ("Setup guide") and the command menu ("Continue setup") | | | BRIEF.md:319 | open |
| C19 | BRIEF.md:122–123 | create actions that need a branch open setup at the branch step, on any room | | | BRIEF.md:315 | open |
| C20 | BRIEF.md:124–127 | recommended items, Skip; when all done a ✓ "Set up" for 7 days, "Your clinic is ready" | | | BRIEF.md:317 | open |
| C21 | BRIEF.md:128 | "Hide setup guide"; the menus still open it | | | BRIEF.md:319 | open |
| C22 | BRIEF.md:129–150 | 14 guide items, each ticked from real records | | | BRIEF.md:317 | open |
| C23 | BRIEF.md:152–156 | the members' notice in the shell, every room, while there is no open branch | | | BRIEF.md:320 | open |
| C24 | BRIEF.md:162–163 | branch drawer "Places & days" — rooms, machines, holidays | | | BRIEF.md:325 | open |
| C25 | BRIEF.md:164–167 | Settings › Clinic — specialties, timezone, day float, reminder hour, lead hold, retarget | | | BRIEF.md:327 | open |
| C26 | BRIEF.md:169–179 | /onboarding shortened; invite and questions out | | | BRIEF.md:329 | open |
| C27 | BRIEF.md:181–185 | a clinic's first branch becomes main | | | BRIEF.md:324 | open |
| C28 | BRIEF.md:187–203 | setup states | | | — | open |
| C29 | BRIEF.md:205–219 | when each step writes | | | — | open |
| C30 | BRIEF.md:257–259 | who: `organization:update`; each write its own code; never in View-as | | | BRIEF.md:320 | open |
| C31 | BRIEF.md:260–262 | scope: the clinic, not a person | | | — | open |
| C32 | BRIEF.md:263–268 | essentials; completion refused while one is missing | | | BRIEF.md:323 | open |
| C33 | BRIEF.md:277–278 | safe to repeat; a second main is read back | | | BRIEF.md:303 | open |
| C34 | BRIEF.md:282–283 | clinics already ready count as set up | | | BRIEF.md:322 | open |
| C35 | BRIEF.md:284 | a personal workspace never shows setup | | | — | open |
| C36 | BRIEF.md:285–290 | accessible: focus, announcements, keys, phone, en + es | | | BRIEF.md:330 | open |
| C37 | BRIEF.md:291–292 | measured: analytics events, never patient data | | | — | open |
| C38 | BRIEF.md:332–342 | out of scope | | | — | open |

## Delta

Step 2, 2026-10-13 — MODE incremental, Intake mode `brief`: `BRIEF.md` is the change list.

**The diff.** `pnpm iteration:diff launch-2026-09-30-jxmr feat-clinic-setup-2026-10-13-sltd` — in both repositories:
`+ added (1): BRIEF.md`; screens unchanged; `PRD.md`, `schema-routes.md` and the prototype unchanged; no entity,
field, enum, route or operation changed. Nothing changed but the brief — **no finding**.

**Classified** (the brief's changes, against what the launch built):

| Change | Kind | Where |
| --- | --- | --- |
| Setup drawer in the app shell (any room), its 7 steps and Ready | new surface | the shell — every room (frontend); three new setup routes (backend) |
| The "Setup" launcher in the header + the checklist in the drawer | new surface | the shell — every room |
| Members' notice while no branch is open | new surface (small) | the shell — every room |
| Create actions that need a branch open setup | behaviour | every room's "New booking", Walk-in, new patient, new bill, receive payment |
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
| Landing · Splash exit (fe) | Leads; a fixed 3.7 s splash | the role home; the splash leaves when boot resolves (≥ 2,050 ms) | launch — D25, Q-S1 | the role home decides the room (Today now) — setup does not depend on it (D11); the drawer opens after the splash (F14) |
| Account menu · Settings (fe) | identity, Status, Appearance, Log out; no Settings | plus the platform rows; Settings as a 1040px record drawer | launch — §3.2, D126 | homes for "Setup guide" (account menu) and the Clinic section (Settings); Settings' hash address over any room is the model for the setup drawer's address (D11) — resolves F21 |
| Drawer step summaries and peeks · Open step circle (fe) | raw figures; near-black circle | values with units; the stone tone | launch — L-30c, L-35 | setup's peeks read "Mon–Sat · 10:00–19:00", "₹500" like every drawer |
| Dirty close (fe) | silent | "Discard changes?" guard | launch — Q-P1 | only the open step's unsaved edits can be lost — saved steps never are |
| Quick-create New offering (fe) | steps that never open | three working steps | launch — §7.3 | step 6's "+ Add your own" can reuse it |
| Empty states · No clinic room open (fe) | "No … matches" only | the design's unreachable copy + "New …"; `ClinicHomeEmpty` | launch — R26, D101 | the members' notice is a new state beside these |

Every other Standing deviation (money, stock, medical, tasks, messaging, patient file …) is untouched by this change.

## Reconciliation

Step 3, 2026-10-13. MODE incremental, `brief`: the brief is reconciled against the carried-forward `PRD.md` and
`schema-routes.md`, the screens and the prototype, and what the launch built. Only an approved source settles a row —
`PRD.md` for scope, `schema-routes.md` for data, value lists, limits and URLs, the launch's route review and build for
what exists (D9), a decision in [decisions.md](decisions.md). **Anything only the screens or the prototype say gets no
verdict: it is a question for Step 4** (Q1–Q10 below, each with a proposed default), and every change-file entry that
rests on it is marked *pending your answer*.

| # | Item | The brief / screens say (file:line) | PRD · schema-routes · build say (file:line) | Verdict | Action |
| --- | --- | --- | --- | --- | --- |
| F1 | Starter service names and specialty | one starter list per specialty, Consultation ticked (BRIEF.md:86–91) | `name` 1–120, unique per org; `specialty` one value (schema-routes.md:565, 567); a repeat name is a conflict (schema-routes.md:1739; launch §12 `offering_name_taken`) | **schema-routes + build win** | each starter row sets one specialty; with more than one specialty chosen, a row's name carries it ("Skin consultation"); a name the clinic already has shows as existing and is never sent again. The list itself → **Q6** |
| F2 | A second main branch | "a second main is read back, not an error" (BRIEF.md:277–278) | "conflict (… only one main)" (schema-routes.md:1754); `409` (launch routes-final §1.A.9) | **build wins** — the server keeps the `409` | the client reads the existing main back and counts the step done (RC-4 changes only the first-branch rule) |
| F3 | Branch name prefill | branch name = clinic name (BRIEF.md:61) | branch `name` 1–60 (schema-routes.md:161), clinic `name` 1–120 (schema-routes.md:146) | **schema-routes wins** | the prefill is the clinic name cut to 60 characters, editable |
| F4 | Invited staff hours | the owner's hours follow the branch (BRIEF.md:229–231) | branch 10:00–20:00 (schema-routes.md:173–174), staff 10:00–19:00 (schema-routes.md:202–203) — both approved, different | **defaults unchanged** | sending the branch's days and hours with each step-7 invitation is new behaviour → **Q4** |
| F5 | schema-routes has no Organization write, no settings, no room / machine / holiday records, no invitations, no main / extra roles | the brief uses all of them (BRIEF.md:59, 162–167, 73–74, 269–270) | the launch built them (routes-final §1–§2, §12; AS-BUILT Standing deviations D4, D5, D28) | **build wins (D9)** | plan against the built routes (route-changes RC-6 … RC-24) |
| F6 | The drawer's address | its own address riding on any room (BRIEF.md:46–47) | every `dialog-over` route is addressable (schema-routes.md:116); the build's drawers are URL dialogs (fe D24) and Settings rides on any room as `#settings/…` (fe D126) | **settled — D11** | the setup drawer gets a room-independent address like Settings'; the exact form is the frontend's (KICKOFF) |
| F7 | Drawer width | 560px (BRIEF.md:42) | — (the design's sizing rule `_patterns.md:28` is a screen-pattern file: 680px with price fields or chip groups over 5 options, 840px with an items table) | **no verdict — screen-only** | → **Q1** |
| F8 | Steps that depend on each other | "Next" saves; step 6 needs one service (BRIEF.md:49–50, 308) | — (the design's step cards never block, `_patterns.md:40–49`; the one locked-step precedent is New lead, leads.md:252) | **no verdict — screen-only** | → **Q2** |
| F9 | Focus on each step | focus moves to the step's title (BRIEF.md:286) | the build traps focus in drawers and returns it to the opener (fe Standing deviation "Focus", §7.2) | **settled — brief + build** | the setup drawer traps focus, moves it to each step's title, returns it on close |
| F10 | Progress colour | a progress bar and ring (BRIEF.md:48, 117) | — (theme: progress fill green `#287c42`, 200 ms ease, preset.md:19–21, 189–193) | **AMBER default** | the theme's progress green → **AMBER group (Q11)** |
| F11 | Starter-row details beyond the data | name, minutes, price, GST editable (BRIEF.md:70–72) | data limits settled: category list (schema-routes.md:1330–1337), duration 5–480, sessions 1–99 (schema-routes.md:571–572), GST one of 0 · 5 · 12 · 18 · 28 (schema-routes.md:576) | **data: schema-routes wins** · screen parts: no verdict | GST inclusive / exclusive default, lowest price = 85% of the offer price rounded to ₹50, the Consultation quick-fill (20 min) (offerings.md:73–75, 240) → **AMBER group (Q11)** |
| F12 | Consultation category and price | Consultation ticked (BRIEF.md:87) | `consultation` is a category (schema-routes.md:1333); consultation bills list only consultation-category services (payments.md:327) | **category: schema-routes wins** | Consultation rows are category `consultation`; the price → **Q6** |
| F13 | "A doctor to book" | a member with the Doctor role (BRIEF.md:139, 263–268) | `doctorId` is any user — no role (schema-routes.md:335); the build books any live member (`appointments.service.ts:80–89`); the design's picker also lists therapists (appointments.md:74) | **no verdict — the essential's meaning is a product call** | → **Q3** |
| F14 | Splash and the "All set" words | the drawer opens on first landing (BRIEF.md:37–39) | the build's splash leaves when boot resolves (fe "Splash exit", D25); its ticker ends on "All set" (splash.md:97) | **settled — build** | the drawer opens after the splash; the done state reads "Your clinic is ready" (BRIEF.md:126–127), never "All set" |
| F15 | Cash drawer float | a guide item and a Settings field (BRIEF.md:146, 166) | stored but read by nothing — the day opens on the carried or recounted cash (be B25, fe D156; `app.container.ts:74`) | **build wins** — the field has no effect | dropping the item and the field → **Q5** (*pending your answer* in db-changes) |
| F16 | A patient's home branch | "a patient needs a home branch" (BRIEF.md:18) | required in the build (routes-final §7.A); optional in the design (patients.md:49) | **build wins (D9)** | setup's main branch is every patient's home branch until a second opens |
| F17 | Save and error copy | — | the design's shared copy ("Saving…", "Not saved · your changes are kept", the failed-save toast) (`_patterns.md:285`) | **settled — reuse** | the setup drawer uses the shared copy as is |
| F18 | Default opening hours | 10:00–20:00 (BRIEF.md:65) | branch 10:00–20:00 (schema-routes.md:173–174); the design's drawer 10:00–19:00 (users.md:144–145, screen-only) | **schema-routes wins** | step 4 defaults to Mon–Sat 10:00–20:00 |
| F19 | City and State | address fields (BRIEF.md:61–62) | `city` required, no default (schema-routes.md:167); `state` default "Gujarat" (schema-routes.md:168); the design's "Surat" is screen-only (users.md:137) | **schema-routes wins** | City empty and required; State prefilled "Gujarat" |
| F20 | Places & days in the branch drawer | a "Places & days" step (BRIEF.md:162–163) | — (the build's drawer has 3 steps; a room, machine or holiday needs the branch to exist, routes-final §1.C–§1.E) | **no verdict — screen-only placement** | a fourth step, shown when editing an existing branch → **AMBER group (Q11)** |
| F21 | Homes for the new entry points | account menu, ⌘K, Settings › Clinic (BRIEF.md:121, 164) | the build's account menu carries extra rows (fe §3.2); Settings is the platform's 1040px drawer (fe D126); ⌘K has an Actions group (`_patterns.md:203`) | **settled — build** | "Setup guide" in the account menu, "Continue setup" in ⌘K's Actions (Owner / Admin), a Clinic section in Settings |
| F22 | Setup tied to a room | the first brief put the drawer and the card on Today | the route map's role home decides the room (schema-routes.md:114) and can change | **settled — D11** | setup belongs to the shell; the brief was re-placed (Intake hash `d5f100464051`) |
| F23 | The launcher's place in the header | right cluster, before the branch picker (BRIEF.md:96–99, 117–120) | — (the header's slots, shell.md:14–27, have none for it) | **D12 decides the pattern; its exact slot is screen-only** | between the search and the branch picker; on a phone the ring alone → **AMBER group (Q11)** |
| F24 | Create actions with no open branch | they open setup at the branch step (BRIEF.md:122–123) | today they fail in the form ("No open branch to book at"); the server refuses a booking, patient or bill without a branch (routes-final §6, §7.A, §8) | **settled — brief** | a frontend guard in the shell; the server keeps refusing (no backend change) |

### Questions for Step 4 (from the rows above and the change files' Open items)

| Q | Question | Proposed default | From |
| --- | --- | --- | --- |
| Q1 | The setup drawer's width | 680px (light steps), with step 6's rows wrapping inside it | F7 |
| Q2 | Can a later step open before the earlier ones are saved? | no — later steps stay locked until the one before is saved (the New lead precedent) | F8 |
| Q3 | What counts as "someone to book"? | a member holding Doctor **or** Therapist | F13 |
| Q4 | Do step-7 invitations carry the branch's days and hours? | yes | F4 |
| Q5 | Drop the cash-drawer float (guide item + Settings field)? | yes — it changes nothing today | F15 |
| Q6 | The starter services per specialty — names, minutes, prices, GST | a short list per specialty (to be shown for your edits) | F1, F11, F12 |
| Q7 | Who may read the setup progress? | managers only (`organization:update`); members need only `/branches/my` | db-changes Open 2 |
| Q8 | The 7-day "✓ Set up" — a stored time or worked out from the records? | stored (`setup_guide_done_at`), set by the write that completes the last item | db-changes Open 1 |
| Q9 | A "finish setting up" reminder email for an unfinished setup? | no — out of this iteration | worker-changes Open |
| Q10 | Where do the three setup routes live? | the app domain (a `clinic-setup` sub-domain with no table of its own), reading the tenancy settings through their service | route-changes Findings |
| Q11 | The AMBER group, confirmed together | progress green (F10); New-offering defaults for starter rows (F11); Places & days as a fourth step when editing (F20); launcher before the branch picker (F23); D10 step cards | F10, F11, F20, F23, D10 |
