# Brief — A 3-tap clinic setup in a drawer on any room, then a short guide behind the profile icon

<!--
Written 2026-10-13 from the user's answers in the planning conversation, revised twice the same day.
(1) Setup belongs to the app shell, not to Today: "Not in today but in common — if we change the default path it
    should handle easily".
(2) Quicker: "onboarding should be quicker — skip complex settings" → 3 taps (clinic type → where → do you see
    patients), everything else a default or later; PIN-code autofill from a bundled list; a short guide ("short would
    be better") with the deeper setup behind the profile icon. Ideas for later iterations are listed, not planned.
Screens are named by their Slug in _index.md (the shell by shell.md); entities as schema-routes.md names them.
-->

## What changes

A new clinic is unusable on its first day. Creating the clinic makes only the clinic itself, its roles and
the owner's membership; there is no branch, no service and no doctor. Today renders, but "New booking"
fails with "No open branch to book at". A bill needs a branch and a service. A patient needs a home branch.
Nothing tells the owner this, and nothing asks for it.

This change asks **three things, one at a time** — what kind of clinic, where it is, and whether the owner sees
patients — the first time an Owner or Admin lands in the clinic, on whichever room it opens on. Everything else is a
sensible default shown as one editable line, or comes later. When the three are answered the clinic is **live**: it
has a main branch, a Consultation to book and bill, and someone to book. A short guide behind the profile icon then
offers the next three things; the deeper settings live in Settings › Clinic with their defaults. Nothing of it belongs
to one room: the clinic's default room (its role home, Today now) can change and setup keeps working.

```
 Sign up / Google      /onboarding (shortened)        first landing in the clinic          live
 ───────────────►  ┌──────────────────────────┐   ┌──────────────────────────────┐   ┌──────────────────────────────┐
                   │ Welcome → Your name →    │   │ SETUP drawer over the room   │   │ any room · avatar ◔ ring     │
                   │ Clinic name → Done       │──►│ it opens on — 3 taps, ~60 s  │──►│ account menu: Finish setup   │
                   │ (account only)           │   │ then "You're live"           │   │ 1 of 3 · Clinic settings     │
                   └──────────────────────────┘   └──────────────────────────────┘   └──────────────────────────────┘
```

### 1. Clinic setup — three taps in a drawer in the app shell (screen: shell — every room)

- **When it opens on its own:** for a member who can manage the clinic (Owner, Admin), the first time they land in
  the clinic — on whichever room it opens on — while the setup is not complete and nobody has chosen "Explore
  first". It opens once per clinic, not on every visit.
- **Not tied to a room:** the drawer, the avatar's ring (§2) and the members' notice (§3) belong to the app shell.
  The clinic's default room can change and nothing about setup changes with it.
- **What it is:** the design's right drawer (`_patterns.md` › Right drawer), a light form 560px wide, a full-screen
  sheet on a phone, with the design's step cards (`_patterns.md` › Step cards): one step open at a time, a finished
  step folded into a ✓ peek, "Next: <step> →"; a later step opens only after the one before is saved.
  - The room underneath stays as it is.
  - The drawer has its own address that rides on any room, as Settings' does, so a refresh, a shared link or a
    different default room reopens the same step.
- **Header:** "Set up <clinic name>", sub-line "About a minute · Step <n> of 3", and a progress bar.
- **Saved as you go:** "Next" saves the step. Answers already saved are never asked again; setup resumes on any device.
- **Closing it** (×, Esc, backdrop or "Explore first") is "Explore first": the drawer does not open on its own again;
  the account menu's "Finish setup" reopens it.

```
 #  Step (the question)            What it asks — prefilled / default                     Saved by "Next"
 ── ────────────────────────────── ────────────────────────────────────────────────────── ──────────────────────────────
 1  What kind of clinic is it?     specialty chips Skin Hair Dental Gynac Physio General   the clinic's specialties
                                   (1 to 6, one tap each)
 2  Where is your clinic?          PIN code (6 digits) → area, city and state filled in    a new main Branch, the owner
                                   from a list bundled with the app (editable);            on its team, the hours as
                                   address line; phone (+91; the owner's, if known);       shown
                                   email (the owner's); branch name = the clinic name
                                   (up to 60 characters, editable) —
                                   one line "Open Mon–Sat · 10:00–20:00 · Change"
 3  Do you see patients yourself?  ◉ Yes, as a doctor · ○ Yes, as a therapist · ○ No      the owner's extra role and
                                                                                          working hours = the branch's;
                                                                                          the branch's default doctor /
                                                                                          therapist
 ✓  You're live                    "We set up: Adajan branch · Consultation ₹500 ·        setup completed
                                   you as doctor" — [Book your first appointment] · [Done]
```

- **Created for the owner on "Go live"** (the end of step 3), so the clinic can book and bill at once: one
  Consultation per chosen specialty, priced from the starter list (`plans/decisions.md` › Starter services) — named
  "Consultation" with one specialty, "<Specialty> consultation" with more — unless the clinic already has a
  consultation of that name. Each is editable later in Offerings.
- **"Book your first appointment"** opens the shared booking form over the room underneath; "Done" closes the drawer.
- **Each step says why it is asked**, in one line under its title ("Bookings and bills need a place").
- **Not asked in setup** (defaults, or later): opening hours beyond the one line, GSTIN, services beyond the
  Consultation, the team, rooms, machines, holidays, logo, review and maps links, reminder and lead settings.

### 2. The short guide and the deeper setup — behind the profile icon (screen: shell — every room)

Current products keep the visible checklist tiny and put the deeper setup behind the profile menu. Clinozy does the
same, for members who can manage the clinic.

```
 avatar (profile icon): a small progress ring while the guide is unfinished
   └ account menu
       ◔ Finish setup · 1 of 3   →  the setup drawer, showing the 3 items (or the 3 steps while not live)
       ⚙ Clinic settings         →  Settings › Clinic — the deeper setup, every value with its default

 the drawer after "live":
 ┌ Finish setting up Sunrise Skin ───────────── × ┐
 │ 1 of 3 done ━━━━━━━━──────────────             │
 │  ✓ Consultation added                          │
 │  ○ Add your treatments   pick from the starter list   [Add] · Skip
 │  ○ Invite your team      doctors, front desk          [Invite] · Skip
 │  ○ Book your first appointment                        [Book]
 │                                Hide this guide │
 └────────────────────────────────────────────────┘
```

- **Three items**, each ticked from the clinic's real records, never by hand (except Skip):
  - **Add your treatments** — done with two or more active services; opens the starter list for the chosen
    specialties (names, minutes, prices, GST — `plans/decisions.md` › Starter services), each ticked row a service.
  - **Invite your team** — done with one member besides the owner (invited or active); reads **"Invite your
    doctor"** while nobody can be booked (the owner answered "No" in step 3); each invitation carries a real role,
    the main branch, and the branch's days and hours as the member's working hours.
  - **Book your first appointment** — done with the first appointment.
- **The ring and the row** show until all three are done or skipped, or the guide is hidden; then the avatar is plain
  and the "Finish setup" row goes. "Clinic settings" stays.
- **Create actions that need a branch** — "New booking", "Walk-in", a new patient, a new bill, receiving a payment —
  open the setup drawer at step 2 while the clinic has no open branch, wherever they are, instead of failing.
- **The command menu** has "Finish setup" while the guide is unfinished.

### 3. Members who cannot manage the clinic (screen: shell — every room)

They never see the drawer, the ring or the guide. While the clinic has no open branch, the shell shows one quiet
notice on every room, in the design's one app-wide notice pattern (`shell.md` › System banner): "Your clinic is still
being set up — bookings open once it's ready."

### 4. The deeper setup — Settings › Clinic, and the branch drawer (screens: users, shell › Settings)

So that every setting setup skipped has a home, with its default already in place:

- **Settings › Clinic** (a new section of the organization's Settings, reached from "Clinic settings"): the clinic's
  specialties and timezone; the booking-reminder hour, how long a lead is held, and when to retarget (each with its
  default); links to the branches for hours, holidays, rooms and machines, GST and review links; the logo (Settings ›
  General, as built).
- **The branch drawer** (Users › Branches) gains a "Places & days" step on an existing branch: rooms and machines (add,
  rename, switch off, remove) and holidays (date + label; add, remove).
- The cash-drawer float is not shown anywhere: nothing reads it today.

### 5. /onboarding, shortened (the account wizard before the clinic exists)

```
 BEFORE  Welcome → Your name → Questions → Clinic name → Invite → Done
                               └ team size, use case, referral:   └ invites get a made-up "Member" role
                                 generic options, analytics only     and no branch
 AFTER   Welcome → Your name → Clinic name → Done                  (~30 seconds)
         Inviting moves to the short guide, with real roles and the main branch.
         "How did you hear about us?" → the "You're live" step (optional). Team size and use case are dropped.
```

### 6. The first branch becomes main by itself (entity: Branch)

The design already says it (users.md › Branches: "if none is left main, the first branch becomes main"), but it
was never built. A clinic's first Branch becomes its main branch even when the request does not say so, whether
it comes from setup or from Users › Branches.

### 7. Setup states

```
        Owner/Admin lands (any room)          Next, or any step saved
  NOT STARTED ───────────────────► OFFERED ──────────────────────► IN PROGRESS ──┐
                                     │ Explore first / close         │ close       │ step 3 + Go live
                                     ▼                               ▼             ▼
                                  DEFERRED ◄─────── (resume any time) ─────── LIVE (completed — when, by whom)
                                     └── "Finish setup" · ⌘K · "New booking" ──►     │ the 3-item guide
                                                                   all three done ┌──┴──────────┐ Hide
                                                                                  ▼             ▼
                                                                            GUIDE DONE     GUIDE HIDDEN
                                                                         (ring and row go) (Clinic settings stays)
  A clinic created before this ships that already has an open main branch and a service → LIVE; it is never
  offered setup.
```

### 8. When each step writes to the server

```
  Browser (setup drawer)                       clinozy-be
  open drawer ───────────────────────────────► read setup status → answered steps, what exists
  step 1  ───────────────────────────────────► save the clinic's specialties + step answered
  step 2  ───────────────────────────────────► create the main Branch with its hours (safe to repeat; a main that
                                                already exists is read back and counted as done)
  step 3  ───────────────────────────────────► the owner's extra role + working hours; the branch's default
                                                doctor / therapist; step answered
  Go live ───────────────────────────────────► create each missing Consultation · mark setup complete →
                                                refresh the session, branches and the room
```

## Why

- **Time to first value.** A new clinic owner meets an empty Today and a booking form that fails, with no hint of what
  is missing. Good onboarding asks only what cannot be defaulted, one thing at a time, never traps the user, shows
  defaults instead of asking, ends at a first real action, and keeps the rest out of the way behind the profile menu.
- **For whom:** a clinic owner (or an Admin they appoint) on day one, often on a phone. Staff who join later get a
  clinic that already works.
- **It also removes two wrong defaults:**
  - Invitations sent from /onboarding get a made-up "Member" role with no branch.
  - Branches open 10:00–20:00 while staff hours default to 10:00–19:00, so evening slots fail. Setup gives the owner
    and every invitation the branch's hours.

## Affected screens, entities and routes

- Screens: the app shell on every room (setup drawer, the avatar's ring, the account menu's "Finish setup" and
  "Clinic settings", the command menu, the members' notice) · users (branch drawer: Places & days) · offerings
  (services created by setup, no screen change) · the account wizard `/onboarding` and Settings (organization ›
  Clinic) — app surfaces outside `_index.md`
- Entities:
  - Organization: specialties, timezone, and the clinic's setup progress, which is new and kept with the clinic's
    settings.
  - Branch: the first-is-main rule, plus rooms, machines and holidays.
  - User: the membership's roles and working hours.
  - Offering: the Consultation created on "Go live"; the starter list.
  - Appointment: read only, for the first-booking item.
- Routes:
  - every `/organization/:organizationSlug/…` room — the drawer's own address rides on whichever is open; the clinic's
    default room (`schema-routes.md` route map, role home) is not changed and not relied on.
  - `/organization/:organizationSlug/users/branches` (the branch drawer).
  - `/onboarding`.
  - New API routes for setup status and progress, and a change to branch creation (first branch → main).

## Rules

- **Who:** only members holding `organization:update` (Owner, Admin) see the drawer, the ring and the guide, and save
  setup. Each step's write still needs its own permission (branch create / update, offering create, membership
  create / update). A View-as preview never shows setup.
- **Scope:** setup belongs to the clinic (Organization), not to a person. Two admins see the same progress; whoever
  completes it is recorded.
- **Live means:** the clinic type answered, an active main branch, and at least one active service. The server refuses
  to mark setup complete while one is missing. "Someone to book" is not required: when the owner answers "No", the
  guide's first item reads "Invite your doctor" and "New booking" says a doctor or therapist is needed.
- **Someone to book** is a member holding the Doctor or Therapist role (main or extra). The owner keeps Owner as main
  role; Doctor or Therapist is added as an extra role.
- **Not tied to a room:** setup reads no room's state and sits in no room's code; changing the clinic's default room
  needs no change to setup.
- **Never trapped:** "Explore first" is always available. Closing the drawer is "Explore first", and the drawer never
  opens on its own twice.
- **Never asked twice:** a step whose answer is already saved is shown done. Data entered elsewhere counts — a branch
  made in Users › Branches completes step 2.
- **Safe to repeat:** every write can be retried without making a second branch, service or invitation. A second
  "main" branch is read back, not an error. A Consultation that already exists is not created again.
- **PIN autofill:** the PIN list ships with the app (no outside service, works offline); an unknown PIN fills nothing
  and the owner types the fields.
- **Existing clinics:** a clinic with an open main branch and at least one active service when this ships counts as
  live. It never sees the drawer or the ring.
- **A personal workspace** has no branches (launch D44) and never shows setup.
- **Accessible:**
  - On each step, focus moves to the step's title, and progress is announced.
  - Enter = Next; Esc = close (Explore first).
  - Every control is reachable by keyboard.
  - The phone layout is the full-screen sheet.
  - All text is translated (en, es).
- **Measured:** setup started, each step completed, live, guide item done or skipped, guide hidden, and the time from
  clinic created to first appointment. These go to product analytics, never with patient data.

## Acceptance criteria

- [ ] A new clinic's Owner who lands in the clinic for the first time sees the setup drawer open over the room it
      opened on (Today now), at step 1.
- [ ] With the clinic's default room changed (for example to Appointments), the same first landing opens the same
      drawer over that room — no setup code changes.
- [ ] The drawer's address opens the same step over any room (a refresh, a shared link).
- [ ] Setup asks exactly three steps; each opens alone, after the one before is saved; a refresh reopens the drawer at
      the first unanswered step.
- [ ] Typing a known PIN fills area, city and state; an unknown PIN fills nothing and blocks nothing.
- [ ] After step 2 the clinic has exactly one open main branch, with the owner on its team and the hours shown.
      Repeating the step creates no second branch.
- [ ] Answering "Yes, as a doctor" in step 3 makes the owner bookable as a doctor at the main branch, with the branch's
      hours as their own.
- [ ] "Go live" leaves one Consultation per chosen specialty (never a duplicate) and marks setup complete; "Book your
      first appointment" opens the booking form, and the booking can be saved.
- [ ] Closing the drawer at any step leaves the room usable; the account menu's "Finish setup" reopens it. The drawer
      does not open on its own again.
- [ ] With no open branch, "New booking" (and Walk-in, a new patient, a new bill, receiving a payment) opens the setup
      drawer at step 2 instead of failing, on whichever room it is pressed.
- [ ] After "live", the avatar shows a ring and the account menu "Finish setup · <n> of 3"; the three items tick from
      the clinic's real records; "Invite your team" reads "Invite your doctor" while nobody can be booked.
- [ ] When the three are done or skipped, or "Hide this guide" is pressed, the ring and the "Finish setup" row go;
      "Clinic settings" stays.
- [ ] A Front desk member never sees the drawer, the ring or the guide. While there is no open branch they see the
      one-line notice on every room.
- [ ] A clinic that already had a main branch and a service before this shipped never sees the drawer or the ring.
- [ ] The server refuses to complete setup while the clinic type, the main branch or a service is missing.
- [ ] A clinic's first branch becomes main even when the request does not say so.
- [ ] The branch drawer can add, rename, switch off and remove rooms and machines, and add and remove holidays.
- [ ] Settings › Clinic saves specialties, timezone, reminder hour, lead hold days and retarget days.
- [ ] /onboarding asks only Welcome → Your name → Clinic name → Done, and sends no invitations.
- [ ] Every step works by keyboard alone and at 390px wide, and passes the accessibility checks.

## Out of scope

- Billing plan or subscription choice during setup (the Billing settings already cover it).
- Importing patients, services or stock from a file or another system.
- Messaging setup (WhatsApp sending stays queued only — launch D77, D87). Message templates can be added later from
  Leads.
- Medical store and clinic stock setup (suppliers, medicines, stock items, vendors).
- Task rule automation settings (they already default to on, handled by hand).
- A guided product tour or coach-marks over the rest of the app.
- Changing the clinic's currency (INR only) or adding branch-level timezones.
- Any change for invitees joining an already set-up clinic.
- Ideas for later iterations, not planned here: asking at the moment of need (GSTIN at the first bill, a room at the
  first treatment, holidays from the calendar, the review link at the first feedback request); a demo clinic with
  sample data; importing a rate card from text or a photo; prefilling from Google; inviting by a WhatsApp link.
