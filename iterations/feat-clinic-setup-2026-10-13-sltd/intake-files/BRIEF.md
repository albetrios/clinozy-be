# Brief — Guided first-time clinic setup in a drawer on any room, with a setup guide in the app shell until the clinic is ready

<!--
Written 2026-10-13 from the user's answers in the planning conversation (shape: a drawer of steps ·
Explore first allowed · scope complete · /onboarding shortened · setup progress kept with the clinic's
settings · suggested services per specialty · clinics that are already ready count as set up · placed as
a brief on the launch). Revised the same day: setup belongs to the app shell, not to Today ("Not in today
but in common — if we change the default path it should handle easily"), and the guide follows current
practice ("follow what trending tech companies are following": a setup launcher in the app chrome with its
progress, opening one drawer that holds the steps and the checklist). Screens are named by their Slug in
_index.md (the shell by shell.md); entities as schema-routes.md names them.
-->

## What changes

A new clinic is unusable on its first day. Creating the clinic makes only the clinic itself, its roles and
the owner's membership; there is no branch, no service and no doctor. Today renders, but "New booking"
fails with "No open branch to book at". A bill needs a branch and a service. A patient needs a home branch.
Nothing tells the owner this, and nothing asks for it.

This change asks for what a new clinic needs **one step at a time**, the first time an Owner or Admin lands
in the clinic — on whichever room the clinic opens on. After that, a setup guide in the app shell tracks what
is left until the clinic is ready. Nothing of it belongs to one room: the clinic's default room (its role home,
Today now) can change and setup keeps working.

```
 Sign up / Google      /onboarding (shortened)          first landing in the clinic         clinic is usable
 ───────────────►  ┌────────────────────────────┐   ┌──────────────────────────────┐   ┌──────────────────────────┐
                   │ Welcome → Your name →      │   │ CLINIC SETUP drawer over the │   │ any room + the shell's   │
                   │ Clinic name → Done         │──►│ room it opens on (any room)  │──►│ "Setup 5/13" launcher    │
                   │ (account only)             │   │ 7 steps · ~3 minutes         │   │ until all done (or hidden)│
                   └────────────────────────────┘   └──────────────────────────────┘   └──────────────────────────┘
```

### 1. Clinic setup, a drawer in the app shell (screen: shell — every room)

- **When it opens on its own:** for a member who can manage the clinic (Owner, Admin), the first time they land
  in the clinic — on whichever room it opens on — while the clinic's essentials are not done and nobody has
  chosen "Explore first". It opens once per clinic, not on every visit.
- **Not tied to a room:** the drawer, the launcher (§2) and the members' notice (§3) belong to the app shell. The
  clinic's default room (its role home — Today now) can change, and nothing about setup changes with it.
- **What it is:** the design's right drawer (`_patterns.md` › Right drawer), a light form 560px wide and a
  full-screen sheet on a phone. It uses the design's step cards (`_patterns.md` › Step cards): one step open
  at a time, finished steps folded into a ✓ peek, and each open step ending in "Next: <step> →".
  - The room underneath stays as it is.
  - The drawer has its own address that rides on any room, as Settings' does, so a refresh, a shared link or a
    different default room reopens the same step.
- **Header:** "Set up <clinic name>", sub-line "About 3 minutes · Step <n> of 7", and a progress bar.
- **Saved as you go:** "Next" saves that step to the clinic. Answers already saved are never asked again, so
  setup resumes on any device at the first unanswered step.
- **Closing it** (×, Esc, backdrop or "Explore first" on the welcome step) is "Explore first". The drawer
  does not open on its own again; the shell's launcher offers "Continue setup".

```
 #  Step (the question)            Fields — prefilled / default                          Saved by "Next"
 ── ────────────────────────────── ───────────────────────────────────────────────────── ──────────────────────────────
 0  "Let's get <clinic> ready"     what you'll need: address, hours, a few prices;       setup started
                                   [Start] · Explore first
 1  What kind of clinic is it?     specialties chips Skin Hair Dental Gynac Physio        Organization.specialties
                                   General — 1 to 6
 2  Where is your main branch?     name (= clinic name), address line 1, line 2,         kept until step 3
                                   area, city, state ("Gujarat"), PIN (6 digits)          (a Branch needs phone + email)
 3  How do patients reach you?     phone (+91), email (the owner's), GSTIN —             a new Branch, main, with the
                                   optional, "add later"                                  owner on its team
 4  When are you open?             working days Mon–Sat · opens 10:00 · closes 20:00 ·   Branch hours + the owner's own
                                   ☑ "These are my working hours too" ·                  working hours (+ the clinic's
                                   "All times are India time · Change"                    timezone if changed)
 5  Do you see patients yourself?  ◉ Yes, as a doctor · ○ Yes, as a therapist · ○ No     the owner's extra role + the
                                                                                          branch's default doctor/therapist
 6  What do you offer?             a starter list for the chosen specialties —            each ticked Offering
                                   Consultation ticked; name, minutes, price and GST      (at least one)
                                   editable on each row; "+ Add your own"
 7  Who works with you?            rows of email + role (Doctor, Front desk, Therapist,   an invitation per row, to the
    (skippable)                    Counsellor, Pharmacist, Accountant, Marketing, Admin)   main branch
 ✓  Your clinic is ready           tiles Branch · Hours · Services · Team;                setup completed
                                   optional "How did you hear about us?";
                                   [Book your first appointment] · [Done]
```

- **The welcome step** says what will be asked and roughly how long it takes.
- **The Ready step's "Book your first appointment"** opens the shared booking form over the room underneath;
  "Done" closes the drawer on that room.
- **Each step says why it is asked**, in one line under its title:
  - Hours: "Patients can be booked only inside these hours."
  - Services: "Bills and bookings are made from these."
- **Starter services** come from a built-in list per specialty, with a typical name, duration, price and GST %
  that the owner edits before saving. Consultation is always offered and ticked. The list itself is confirmed
  at planning; prices are suggestions only, and nothing is saved until "Next".
  - Clinical consultations carry 0% GST.
  - Cosmetic procedures carry 18% GST.
  - The owner can change either rate.

### 2. The setup guide in the app shell (screen: shell — every room)

Current products keep onboarding out of any one page: a **launcher in the app chrome** shows the progress on every
screen and opens **one side drawer** that holds both the remaining steps and the checklist (Stripe's setup guide,
Linear's onboarding checklist). Clinozy does the same, for members who can manage the clinic.

```
 header (every room):  logo · sections · tabs ……… [⌘K search]  │ ◔ Setup 5/14 │ [branch] (avatar)
                                                                 └ progress ring + count; phone: the ring alone

 the drawer after the essentials (same address as the steps):
 ┌ Set up Sunrise Skin ─────────────────────────────── × ┐
 │ 5 of 14 done ━━━━━━━━━──────────────                  │
 │ ESSENTIALS                                   ✓ done   │
 │  ✓ Clinic type ✓ Main branch ✓ Hours ✓ Services ✓ Doctor
 │ NEXT UP                                               │
 │  ○ Invite your team           front desk, doctors   [Invite]
 │  ○ Add rooms                  so treatments get one [Add]   · Skip
 │  ○ Book your first appointment                      [Book]
 │  ○ Holidays · GST · logo · links · machines …  (each [Open] · Skip)
 │                                     Hide setup guide  │
 └───────────────────────────────────────────────────────┘
```

- **The launcher:** a compact "Setup" button with a progress ring and "<done>/<total>" in the header's right
  cluster, on every room, for Owner and Admin, until every item is done or skipped, or the guide is hidden. On a
  phone it is the ring alone. It opens the drawer: before the essentials are done, at the first unanswered step;
  after, on the checklist.
- **Also reachable** from the account menu ("Setup guide") and the command menu ("Continue setup").
- **Create actions that need a branch** — "New booking", "Walk-in", a new patient, a new bill, receiving a payment
  — open the drawer at the branch step while the clinic has no open branch, wherever they are, instead of failing.
- **After the essentials are done**, the checklist lists the recommended items. Each one opens the screen that
  does it, and each can be marked "Skip" where the table says so.
- **When every item is done or skipped**, the launcher shows a ✓ "Set up" for 7 days and then goes; the drawer
  reads "Your clinic is ready".
- **"Hide setup guide"** removes the launcher at once. The account menu and the command menu still open it.
- **Every tick is read from the clinic's real records.** Nothing is a checkbox the owner ticks by hand, except
  Skip.

```
 Group        Item                          Done when                                     Opens                     Skip?
 ───────────  ────────────────────────────  ────────────────────────────────────────────  ────────────────────────  ─────
 Essentials   Clinic type                   answered in setup                              setup step 1              no
              Main branch                   an open main Branch exists                     setup steps 2–3           no
              Opening hours                 answered in setup                              setup step 4              no
              Services                      ≥ 1 active Offering                            setup step 6              no
              A doctor to book              ≥ 1 active member holding the Doctor role      setup step 5 / invite     no
 Recommended  Invite your team              ≥ 1 member besides the owner (invited or       invite drawer             yes
                                            active)
              Add rooms                     ≥ 1 room at an open branch                     rooms editor (new)        yes
              Add machines                  ≥ 1 machine at an open branch                  machines editor (new)     yes
              Holidays                      ≥ 1 holiday this year or later                 holidays editor (new)     yes
              GST on invoices               the main Branch has a GSTIN                    branch drawer             yes
              Cash drawer float             the day float confirmed                        Clinic settings (new)     yes
              Clinic logo                   a logo uploaded                                Settings › General        yes
              Review & maps links           the main Branch has a review link              branch drawer             yes
              Book your first appointment   ≥ 1 Appointment exists                         New booking               no
```

### 3. Members who cannot manage the clinic (screen: shell — every room)

They never see the drawer, the launcher or the guide. While the clinic has no open branch, the shell shows one
quiet notice on every room, in the design's one app-wide notice pattern (`shell.md` › System banner): "Your clinic
is still being set up — bookings open once it's ready."

### 4. Screens that exist only in the API today (screens: users, shell › Settings)

So that every guide item opens a working screen:

- **Rooms, machines and holidays** of a branch: the branch drawer (Users › Branches) gains a "Places & days"
  step. It lists rooms and machines (add, rename, switch off, remove) and holidays (date + label; add, remove).
- **Clinic settings:** a new "Clinic" section in Settings (organization). It holds:
  - Specialties and timezone (Organization).
  - The day's opening cash float, the booking-reminder hour, how long a lead is held, and when to retarget
    (the clinic's settings).

### 5. /onboarding, shortened (the account wizard before the clinic exists)

```
 BEFORE  Welcome → Your name → Questions → Clinic name → Invite → Done
                               └ team size, use case, referral:   └ invites get a made-up "Member" role
                                 generic options, analytics only     and no branch
 AFTER   Welcome → Your name → Clinic name → Done                  (~30 seconds)
         Invite → setup step 7, with real roles and the main branch.
         "How did you hear about us?" → the Ready step (optional). Team size and use case are dropped:
         setup asks for the real thing.
```

### 6. The first branch becomes main by itself (entity: Branch)

The design already says it (users.md › Branches: "if none is left main, the first branch becomes main"), but it
was never built. A clinic's first Branch becomes its main branch even when the request does not say so, whether
it comes from setup or from Users › Branches.

### 7. Setup states

```
        Owner/Admin lands (any room)            Start, or any step saved
  NOT STARTED ──────────────────────► OFFERED ──────────────────────► IN PROGRESS ──┐
                                        │ Explore first / close         │ close       │ last essential saved
                                        ▼                               ▼             ▼
                                     DEFERRED ◄──────── (resume any time) ─────  ESSENTIALS DONE  (when, by whom)
                                        └── launcher · menu · ⌘K · "New booking" ──►     │
                                                                         all done ┌──────┴──────┐ Hide
                                                                                  ▼             ▼
                                                                            GUIDE DONE     GUIDE HIDDEN
                                                                       ("Your clinic is   (reopen: account menu, ⌘K)
                                                                        ready"; ✓ 7 days)
  A clinic created before this ships that already has an open main branch and a service → ESSENTIALS DONE;
  it is never offered setup.
```

### 8. When each step writes to the server

```
  Browser (setup drawer)                       clinozy-be
  open drawer ───────────────────────────────► read setup status → answered steps, what exists
  step 1  ───────────────────────────────────► save the clinic's specialties + step answered
  step 2  → kept in the browser until step 3
  step 3  ───────────────────────────────────► create the main Branch (safe to repeat; a main that already
                                                exists is read back and counted as done)
  step 4  ───────────────────────────────────► save the branch hours + the owner's working hours
  step 5  ───────────────────────────────────► add the owner's extra role + the branch's default doctor
  step 6  ───────────────────────────────────► create each ticked Offering (each safe to repeat)
  step 7  ───────────────────────────────────► send each invitation (all sent; failures listed, resend later)
  Ready   ───────────────────────────────────► mark setup complete → refresh the session, branches, the room
```

## Why

- **Time to first value.** Today, a new clinic owner meets an empty Today and a booking form that fails, with
  no hint of what is missing. Big-product onboarding (Shopify, Stripe, Square, Linear) separates the account
  from the workspace setup. It asks only the essentials, one at a time, with sensible defaults. It never
  traps the user, tracks the rest as a checklist read from real data, and ends at a first real action.
- **For whom:** a clinic owner (or an Admin they appoint) on day one. Staff who join later get a clinic that
  already works.
- **It also removes two wrong defaults:**
  - Invitations sent from /onboarding get a made-up "Member" role with no branch.
  - Branches open 10:00–20:00 while staff hours default to 10:00–19:00, so evening slots fail. Setup syncs
    the owner's hours to the branch's.

## Affected screens, entities and routes

- Screens: the app shell on every room (setup drawer, the "Setup" launcher, the members' notice; account menu
  and command menu entries) · users (branch drawer: Places & days) ·
  offerings (services created by setup, no screen change) · the account wizard `/onboarding` and Settings
  (organization › Clinic) — app surfaces outside `_index.md`
- Entities:
  - Organization: specialties, timezone, and the clinic's setup progress, which is new and kept with the
    clinic's settings.
  - Branch: the first-is-main rule, plus rooms, machines and holidays.
  - User: the membership's roles and working hours.
  - Offering.
  - Appointment: read only, for the first-booking item.
- Routes:
  - every `/organization/:organizationSlug/…` room — the drawer's own address rides on whichever is open; the
    clinic's default room (`schema-routes.md` route map, role home) is not changed and not relied on.
  - `/organization/:organizationSlug/users/branches` (the branch drawer).
  - `/onboarding`.
  - New API routes for setup status and progress, and a change to branch creation (first branch → main) —
    proposed at planning.

## Rules

- **Who:** only members holding `organization:update` (Owner, Admin) see the drawer and the guide, and
  save setup. Each step's write still needs its own permission: branch create/update, offering create,
  membership create/update. A View-as preview never shows setup.
- **Scope:** setup belongs to the clinic (Organization), not to a person. Two admins see the same progress;
  whoever finishes the last essential completes it. It is kept with the clinic's settings, not in a new
  record.
- **Essentials:**
  - Clinic type, main branch, opening hours, at least one service, and a member who can be booked as a
    doctor.
  - Setup cannot be marked complete while one is missing; the server refuses it.
  - If the owner answers "No" in step 5 and skips step 7, setup still completes, but "A doctor to book"
    stays open at the top of the guide, and "New booking" says a doctor is needed.
- **Owner as doctor:** the owner keeps Owner as their main role, and Doctor or Therapist is added as an extra
  role (launch D81 (4) allows this). They become the main branch's default doctor or therapist.
- **Not tied to a room:** setup reads no room's state and sits in no room's code; the drawer opens over whichever
  room is showing, and changing the clinic's default room (role home) needs no change to setup.
- **Never trapped:** "Explore first" is always available. Closing the drawer is "Explore first", and the
  drawer never opens on its own twice.
- **Never asked twice:** a step whose answer is already saved is shown done. Data entered elsewhere counts —
  a branch made in Users › Branches completes "Main branch".
- **Safe to repeat:** every write can be retried without making a second branch, service or invitation. A
  second "main" branch is read back, not an error.
- **Invitations:** each invitation needs one of the clinic's roles (never a made-up role) and goes to the
  main branch. A failed address does not block the rest. Failures are listed on the step and can be resent
  from Users.
- **Existing clinics:** a clinic with an open main branch and at least one active service when this ships
  counts as set up. It never sees the drawer, and its guide shows only if an Owner/Admin opens it.
- **A personal workspace** has no branches (launch D44) and never shows setup.
- **Accessible:**
  - On each step, focus moves to the step's title, and progress is announced.
  - Enter = Next; Esc = close (Explore first).
  - Every control is reachable by keyboard.
  - The phone layout is the full-screen sheet.
  - All text is translated (en, es).
- **Measured:** setup started, each step completed or skipped, setup completed, guide hidden, and the time
  from clinic created to first appointment. These go to product analytics, never with patient data.

## Acceptance criteria

- [ ] A new clinic's Owner who lands in the clinic for the first time sees the setup drawer open over the room
      it opened on (Today now), at the welcome step.
- [ ] With the clinic's default room changed (for example to Appointments), the same first landing opens the
      same drawer over that room — no setup code changes.
- [ ] The drawer's address opens the same step over any room (a refresh, a shared link).
- [ ] Each step opens alone, with its fields prefilled as described. "Next" saves it, and a refresh reopens
      the drawer at the first unanswered step.
- [ ] After step 3 the clinic has exactly one open main branch, with the owner on its team. Repeating the step
      creates no second branch.
- [ ] After step 4 the branch's hours and the owner's own working hours match. A booking at the last open
      hour succeeds.
- [ ] Answering "Yes, as a doctor" in step 5 makes the owner bookable as a doctor at the main branch.
- [ ] Step 6 offers a starter list for each chosen specialty and refuses to continue with nothing ticked. Each
      ticked row becomes one service.
- [ ] Step 7 sends one invitation per row with the chosen role, to the main branch. One bad address does not
      block the others.
- [ ] The Ready step's "Book your first appointment" opens the booking form, and the booking can be saved.
- [ ] Closing the drawer at any step leaves the room usable, with the header's "Setup" launcher showing the
      progress on every room. The drawer does not open on its own again.
- [ ] With no open branch, "New booking" (and Walk-in, a new patient, a new bill, receiving a payment) opens the
      setup drawer at the branch step instead of failing, on whichever room it is pressed.
- [ ] The setup guide ticks each item from the clinic's real records. A branch created in Users › Branches
      ticks "Main branch".
- [ ] "Hide setup guide" removes the launcher. The account menu and the command menu still open the drawer.
- [ ] A Front desk member never sees the drawer, the launcher or the guide. While there is no open branch they
      see the one-line notice on every room.
- [ ] A clinic that already had a main branch and a service before this shipped never sees the drawer.
- [ ] The server refuses to complete setup while an essential is missing.
- [ ] A clinic's first branch becomes main even when the request does not say so.
- [ ] The branch drawer can add, rename, switch off and remove rooms and machines, and add and remove
      holidays.
- [ ] Settings › Clinic saves specialties, timezone, day float, reminder hour, lead hold days and retarget
      days.
- [ ] /onboarding asks only Welcome → Your name → Clinic name → Done, and sends no invitations.
- [ ] Every step works by keyboard alone and at 390px wide, and passes the accessibility checks.

## Out of scope

- Billing plan or subscription choice during setup (the Billing settings already cover it).
- Importing patients, services or stock from a file or another system.
- Messaging setup (WhatsApp sending stays queued only — launch D77, D87). Message templates can be added
  later from Leads.
- Medical store and clinic stock setup (suppliers, medicines, stock items, vendors).
- Task rule automation settings (they already default to on, handled by hand).
- A guided product tour or coach-marks over the rest of the app.
- Changing the clinic's currency (INR only) or adding branch-level timezones.
- Any change for invitees joining an already set-up clinic.
