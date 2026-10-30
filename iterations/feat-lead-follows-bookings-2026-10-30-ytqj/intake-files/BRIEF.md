# Brief — A lead follows its person's bookings: book from the lead, back to Follow-up on a cancel, Clinic visited on any check-in — walk-ins included

<!--
Written 2026-10-30 from the user's requests in the planning conversation.
(1) 2026-10-28: "after follow up we can't do 'clinic visited' or we can't create appointment from there —
    think about something unique … then appointment followups will be started and lead status will be
    appointment scheduled and when that appointment checked-in then it's clinic visited and if that got
    cancelled (not rescheduled) then lead flow again follow up".
(2) 2026-10-30: "What if that patient after cancelling appointment they visit walk-in — when and what we
    should follow?" Answered with AskUserQuestion: a lead closed as Lost / Not interested in the last
    90 days is won back by a check-in; another booking still to happen is kept, with a heads-up.
(3) 2026-10-30: "change the color of all completed steps in lead — is darker today — show more
    completed, user can understand easily".
A first slice of (1) was built before this iteration was opened (clinozy-be 6e92210, clinozy-fe
7febaec, branch claude/gallant-mccarthy-cbakkm); this iteration records it and finishes the change.
Screens are named by their Slug in the launch drop's _index.md; entities as its schema-routes.md names them.
-->

## What changes

A lead had nowhere to go after Follow-up: Clinic visited is set only by a check-in, booking hid in the
lead drawer's chat column, and nothing tied a lead to the visit booked for its person. Now the lead
**follows its person's bookings**, end to end:

```text
New → Contacted → Follow-up ──Book──▶ Appointment scheduled ──check-in──▶ Clinic visited
                      ▲                       │                               ▲
                      └── last booking cancelled / no-show / removed ─┘       │
                                                                              │
   any open status, or Lost / Not interested closed ≤ 90 days ago ── walk-in ─┘
```

### 1. leads — the lead drawer's Progress (screen: leads, drawer `/leads/:leadId`)

- **Five steps:** New · Contacted · Follow-up · **Appointment scheduled** · Clinic visited, then "Close as"
  No response · Not interested · Invalid · Lost.
- **Step 4 books.** For a member who books (Appointments › Create), the Appointment scheduled step reads
  "Book" and opens the shared booking form on the lead's person, prefilled as the chat's "Book an
  appointment" does. The lead moves when the booking saves — not when the step is pressed. Without the
  right to book, or on a closed lead, the step only shows.
- **The booking still to happen** shows under the steps: "Booked · <day> · <time>", what and with whom,
  **Reschedule** (the booking form on that booking) and **Cancel appointment** (the reason confirm) — for
  a member who edits Appointments.
- **While booked** the earlier steps and No response wait for the cancel (their tooltip says so); Not
  interested, Invalid and Lost stay open.
- **Done steps read as done at a glance.** Today a completed step is a solid dark fill in its colour,
  heavier than the current step. A completed step becomes a **light tint of its own colour** with a bold
  ✓ disc, "Done" and a full bar; the **current** step is the strongest tile — a stronger tint with a ring
  in its colour, "Current" and a half bar; the next ones stay faint with a dashed number (the user's
  choice, 2026-10-30).
- **On a phone** (a narrow drawer) the steps are a vertical list, one row each — no word breaks mid-word.
- The Leads list's Status filter offers Appointment scheduled, in the pipeline's order.

### 2. The lead follows the bookings (server; every surface that books — leads, appointments, today)

- A booking still to happen (scheduled or confirmed) moves the person's **open** lead to Appointment
  scheduled, with a line in their stream.
- A **reschedule** (a move of the same booking) or a confirm keeps it there.
- When the **last** booking still to happen is **cancelled**, marked **no-show** or **removed**, the lead goes
  back to **Follow-up**, its follow-up date **now** — so the follow-up task opens again — with a line in
  the stream naming why. A reinstate or restore books it again.
- A check-in ends it in **Clinic visited** (unchanged).
- Nobody sets Appointment scheduled by hand; while a booking is still to happen the lead leaves it by
  hand only for Not interested, Invalid or Lost.
- A lead created, reopened or restored for a person who already has a booking still to happen starts in
  Appointment scheduled.
- The lead's own follow-up task waits while it is booked — the booking's confirm and reminder follow
  the person up.

### 3. A walk-in after a cancel (screens: today — Start visit / walk-in; patients — the file's Start visit)

**When:** the moment the person is checked in — a walk-in is checked in as it is made.
**What happens, by where the lead stands:**

| The person's lead at the walk-in | What the check-in does |
| --- | --- |
| open — Follow-up after the cancel, or any open status | → **Clinic visited**; the follow-up task closes; the patient file opens (once) linked to this lead |
| no open lead; the latest lead closed as **Lost** or **Not interested** within the last **90 days** | **won back** → Clinic visited, with "Won back at check-in" in the stream; the file links to it |
| closed as **Invalid**, or closed more than 90 days ago, or no lead at all | stays as it is; the file opens unlinked (today's behaviour) |

**What follows after the visit:** the lead's journey ends at Clinic visited; the patient's own follow-ups
take over from the visit — feedback, aftercare, next visit and rebook tasks, as for any patient.

**Another booking still to happen** (they cancelled one but kept a later one, then walked in): the
booking is **kept** — nothing is cancelled on its own — and Start visit ends with a heads-up: "Also
booked · <day> · <time>" with **Open** to that booking, so the desk keeps or cancels it.

## Why

A clinic's front desk works a lead from enquiry to visit. Without a booking step the journey stopped at
Follow-up, the desk had to leave the lead to book in another room, and a cancelled visit left the lead
looking booked with no one following it up. A person who cancels and later just walks in must still
count as the enquiry's visit — otherwise the source that brought them (Instagram, Google, a referral) gets
no credit and the follow-up task nags about someone who already came. Completed steps drawn darker than
the current one make the track hard to read at a glance.

## Affected screens, entities and routes

- Screens: leads (lead drawer › Progress, the list's Status filter), appointments (the booking form in
  New and Reschedule, the cancel confirm), today (Start visit / walk-in), patients (the file's Start visit)
- Entities: Lead (its status gains `appointment_scheduled`), Appointment, Patient, ContactActivity, Task
- Routes: `POST /app/appointments` (a booking, a walk-in), `PATCH /app/appointments/{appointment_id}`,
  `POST /app/appointments/{appointment_id}/cancel` · `/no-show` · `/reinstate` · `/check-in` · `/restore`,
  `DELETE /app/appointments/{appointment_id}`, `POST /app/leads`, `PATCH /app/leads/{lead_id}`,
  `POST /app/leads/{lead_id}/restore`, `GET /app/appointments?contact_id=` — no new route

## Rules

- Appointment scheduled is an **open** status: one open lead per contact still holds; claim, release and
  the hold work on it.
- A booking "still to happen" is a live (not removed) appointment that is scheduled or confirmed — its
  date passed or not; it waits for a check-in, a no-show or a cancel.
- Only the **last** booking still to happen ending moves the lead back; while another is still to happen
  the lead stays.
- Setting Appointment scheduled by hand is refused; leaving it by hand for New, Contacted, Follow-up or No
  response is refused while a booking is still to happen — the person's answer names the way (cancel the
  appointment). A lead whose bookings have all ended meanwhile moves freely.
- Win-back: only Lost and Not interested, only the person's **latest** lead, only within 90 days of when
  it was closed, only when the person has **no open lead**; Invalid never. An open lead always wins over a
  closed one.
- A walk-in or a check-in never cancels, moves or confirms another booking.
- Every move the server makes leaves one `system` line in the person's stream, naming why.
- Undo check-in leaves the lead in Clinic visited (unchanged).
- Permissions are the existing ones: booking from the lead needs Appointments › Create; Reschedule and
  Cancel need Appointments › Edit; reading the booking needs Appointments › View; moving the lead by hand
  needs Leads › Edit.

## Acceptance criteria

- [ ] A booking for a person with an open lead moves it to Appointment scheduled, with a stream line.
- [ ] A reschedule or a confirm keeps the lead in Appointment scheduled.
- [ ] Cancelling one of two bookings still to happen keeps the lead in Appointment scheduled.
- [ ] Cancelling, marking no-show or removing the last one moves the lead to Follow-up, its follow-up date now, with a stream line naming why; the follow-up task opens again.
- [ ] Reinstating or restoring a booking moves the lead back to Appointment scheduled.
- [ ] A check-in of a booked lead ends it in Clinic visited.
- [ ] Setting Appointment scheduled by hand is refused; leaving it by hand for an open status while booked is refused; Lost / Not interested / Invalid are allowed.
- [ ] A lead created or reopened for a booked person starts in Appointment scheduled.
- [ ] The follow-up task does not open for a booked lead.
- [ ] A walk-in after a cancel ends the open lead in Clinic visited, closes its follow-up task and links the new patient file to it.
- [ ] A walk-in (or check-in) of a person whose latest lead was closed Lost or Not interested within 90 days wins it back to Clinic visited, with "Won back at check-in" in the stream, linked to the patient file.
- [ ] A lead closed as Invalid, or closed more than 90 days ago, stays closed at a check-in.
- [ ] A walk-in with another booking still to happen keeps that booking, and Start visit shows "Also booked · <day> · <time>" with Open.
- [ ] In the lead drawer, step 4 reads "Book" for a member who books and opens the booking form on the person; it is not pressable without the right or on a closed lead.
- [ ] The booking still to happen shows on Progress with Reschedule and Cancel appointment for Appointments › Edit.
- [ ] While booked, the earlier steps and No response are not pressable and say why.
- [ ] Completed steps read lighter than the current step, with a check, in both themes; the phone shows the steps as a list without mid-word breaks.
- [ ] Every label is translated in the frontend's eleven locales and the backend's two.

## Out of scope

- Undo check-in moving the lead back to Appointment scheduled.
- Cancelling, moving or merging the other booking at a walk-in (the desk decides; only a heads-up).
- A clinic setting for the 90-day win-back window (a fixed rule this iteration).
- Re-crediting a lead closed as Invalid, or a lead other than the person's latest.
- Changing the patient follow-up rules (feedback, aftercare, next visit, rebook) — they already start from the visit.
- The demo seed (no booked or won-back lead is added).
