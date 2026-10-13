# Screen: Tasks

- Route: /tasks (task drawer over it: /tasks/:taskId)
- Purpose: The clinic's work queue — tasks Clinozy derives from leads, appointments, treatments, feedback and patients, each with an owner and a due time, closed with an outcome that writes back to its source record.
- Entry points: "All sections" list (header compass or key "G"; phone: bottom tab bar "More" → All sections sheet), key "8" (Tasks is the 8th section for a role that sees every section), ⌘K action "Open tasks" and "Go to" › "Tasks", a pinned header tab / phone tab-bar slot once the user pins it (not pinned by default)
- Exit points: task drawer; from it — the source record ("Open appointment" → appointment form in edit; "Open lead" → Leads with the lead drawer open; "Open patient" → patient file), the appointment form (booking / rebooking outcomes), the Visit check-in / Aftercare check-in drawer, the Log review drawer, the patient file ("Call now", "Fix the number"), the stacked "What’s next for <first>?" drawer
- Access: view — Admin, Doctor, Front desk, Counsellor, Therapist (role defaults in Users › Roles & access; Pharmacist and Accountant don't see Tasks). There is no create button. Outcomes, snooze and reassign are open to every role that sees the screen. Scope "Mine" (default) = tasks owned by the signed-in user plus unowned tasks; "Everyone" = every owner
- Layout shell: app shell
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: plum.

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| Toolbar | h1 "Tasks" · "Task view" tabs "To do" · "Snoozed" · "Done" · spacer · search · type dropdown · "Scope" tabs "Mine" · "Everyone" · "Rules" | One wrapping row, padding 16px 20px (12px 12px when the window is < 1440px wide or < 800px tall), gap 10px 8px. h1 20px/600, −0.015em, 1px hairline on its right (padding-right 10px). Tab tracks: 3px padding, 1px border, radius 8px, 28px triggers 12.5px/500, selected = zinc-100 fill + zinc-300 ring. Search is a 36px icon button until clicked or "/" is pressed, then expands in place (flex 0 1 220px, min 150px, 36px) and stays open while it has text. Type dropdown 36px ("All types" + chevron). "Rules" 36px with a sparkles icon | Phone: h1 hidden (the header chip "Tasks", plum, names the page); row 1 = search full width, 40px, always open, no key hint; row 2 = view tabs, "All types" pushed right; row 3 = "Mine" · "Everyone" + "Rules"; tab tracks scroll sideways if they overflow; toolbar padding 8px 12px; no floating button (there is no create action). Tablet: as desktop with the h1 at 18px | No "Filters" button on Tasks; the type dropdown is the only filter |
| List card | grouped task rows | Margin 0 20px 20px (0 12px 12px compact), 1px border, radius 12px, white, shadow 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px -8px rgb(0 0 0 / .06); the card body scrolls; no header row, no footer | Phone: margin 0 — the card spans edge to edge (radius 12px and border kept); rows re-grid (see Data display). Tablet: as desktop (796px card at 820) | Empty To do shows the empty copy centred in the card |
| Group header | tone square + label | Sticky (top 0, z 2) inside the scroller; padding 8px 20px (16px compact); zinc-50 fill, bottom hairline; 8px square (radius 2px) in the group tone; 11px/600 uppercase, letter-spacing .05em, zinc-600 | Phone: same, side padding 14px. Tablet: as desktop | To do: "Overdue" (blush) · "Due today" (butter) · "Coming up" (sky), empty groups hidden. Snoozed tab: one group "Snoozed"; Done tab: one group "Resolved" (no square colour) |
| Task drawer | task column + shared lead chat column | Right side drawer, see Popups | Phone: full-screen, task column only, see Popups | Opens over the list |

## Data display

Primitive: table — grouped rows (`role="row"`) with no header row. Rows on every breakpoint; on phone each row re-grids into two lines (still a row, not a card).

| Field | Value |
| --- | --- |
| Columns (ordered) | 1 rule icon tile · 2 task: title (+ "Clinozy can do this" pill when that rule is handed to Clinozy), why line, and on Done "✓ <result>" · 3 contact: avatar + name + source link · 4 owner: person pill, or "Anyone" · 5 due (right-aligned) |
| Column widths | 32px · minmax(0,2fr) · minmax(0,1fr) · minmax(0,150px) · 110px, gap 12px; row padding 10px 20px 10px 17px beside a 3px left edge (compact 16px / 13px). At 1440: 32 · 679 · 339 · 150 · 110; at 820: 32 · 281 · 141 · 150 · 110 |
| Sortable | no — fixed order: groups Overdue → Due today → Coming up, rows inside each by due time ascending |
| Row height | 56px desktop/tablet; 96px phone |
| Row click | opens the task drawer and binds its chat (see Popups › Task drawer); a Done row whose task no longer exists shows its result as a toast instead |
| Row actions | none in the row — outcomes, snooze and reassign live in the drawer. Hover the contact → contact card (shared, `_patterns.md`); hover the owner pill → team card titled "Assigned" |
| Selection | none |
| Mobile behaviour | Phone: grid `32px minmax(0,1fr) auto`, row gap 8px, column gap 10px, top-aligned — icon tile spans rows 1–2 · title/why row 1 · due row 1 right (vertically centred) · contact row 2 · owner pill row 2 right; row padding 10px 14px 10px 11px. All five cells stay — this list is not the shared table, so the phone fold-to-meta rule does not apply. Tablet: as desktop |
| Pagination | none — the whole derived list renders at once |

Row anatomy: 3px left edge in the rule tone (overdue → red oklch(0.60 0.16 25); Done → zinc-200) · 1px zinc-100 bottom border · hover zinc-50. Icon tile 32px, radius 8px, rule tone fill/ink, icon 15px. Title 13.5px/600 (ellipsis); pill "Clinozy can do this" 20px tall, padding 0 7px, radius 999px, zinc-900 fill, zinc-50 10.5px/500; why 12px zinc-600 (ellipsis); Done result 12px green (oklch(0.42 0.1 150)). Contact: hover block (padding 4px 10px 4px 4px, radius 8px, hover zinc-100 + inset zinc-200 ring) — 28px avatar (sage with a 14px green "P" badge for patients, lav otherwise; 10px/600 initials) + name 13px/500 + source 11.5px in its kind's ink (lead lav · patient sage · treatment mint · appointment sky). Owner: 28px pill, 1px border, radius 999px, 22px avatar in the person's tone (9px initials) + name 12.5px/500, "· was <first name>" after a reassign; unowned → "Anyone" butter pill 24px, 12px/500. Due: 12.5px tabular; overdue → red oklch(0.50 0.19 25) weight 600; otherwise zinc-700 weight 500; Snoozed / Done labels zinc-500.

### Rules (what creates each task)

| Rule | Tone · icon | Source chip | Creates a task when | Title / why | Due | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| Unreplied messages | lav · `message-square` | "Lead #<id>" | a lead's last real message is inbound and the lead is not Clinic visited / Not interested / Invalid / Lost | "Reply to <first>" / "Wrote on <channel> · waiting <n> min" + their message quoted in the drawer | 30 min after their message | lead owner |
| Lead follow-ups | butter · `phone` | "Lead #<id>" | status Follow-up, Contacted or No response and the follow-up date is today or past | "Follow up with <first>" / "<status> · follow-up was due <day> · interested in <interests or —>" | follow-up date 11:00 | lead owner |
| Leads open to claim | butter · `users` | "Lead #<id>" | the owner's hold has run out (or the owner left), the owner is not me, not a patient, not closed | "Claim or leave <first>" / "<owner> has left the clinic · open to the team" or "<owner> has been idle <n> days · anyone can take it" | now + 3 h | none ("Anyone") |
| Messages not delivered | blush · `info` | "Lead #<id>" | the last sent message failed and nothing was sent after it | "Message to <first> not delivered" / "<channel> could not deliver at <time>" + the message quoted | 25 min ago (always overdue) | lead owner |
| Confirm visits | sky · `calendar` | "Appt #<id>" | a Scheduled visit starts within the next 48 h | "Confirm <first>’s visit" / "<day> <h:mm am> · <service> with <doctor> · no reply to the reminder" | 2 h before the visit if it is < 20 h away, else 18:00 the day before | me |
| Arrived or no-show | blush · `clock` | "Appt #<id>" | a Scheduled / Confirmed visit today is more than 15 min past its start | "Has <first> arrived?" / "<day> <h:mm am> · <service> with <doctor> · not checked in yet" | start + 15 min | me |
| Rebook no-shows | blush · `refresh-cw` | "Appt #<id>" | the visit's status is No show | "Rebook <first>" / "Missed <service> on <day> <h:mm am>" | next day 11:00 | me |
| Collect feedback | sage · `sparkles` | "Appt #<id>" | a visit was Completed within the last 3 days (not today) | "Ask <first> how it went" / "<service> with <doctor> on <day> · ask for a rating and book the next session" | today 12:00 | me |
| Aftercare calls | mint · `sparkles` | "Treatment #<id>" | a treatment asked for an aftercare call after N days and has no linked check-in; shown from 2 days before the call day until 30 days after the treatment | "Next-day call · <first>" (N = 1) or "Day-<N> call · <first>" / "<treatment> on <day> · ask how the skin feels and what they followed" | treatment date + N days | me |
| Unhappy patients | blush · `info` | "Appt #<id>" | a feedback outcome "Unhappy" was logged | "Call <first> back · unhappy" / "Unhappy after <service> on <day> · call before end of day" | today 18:00 | the visit's doctor |
| Next visit not set | sage · `calendar` | "Patient #<id>" | a patient's last completed visit was 1–45 days ago, nothing is booked and no follow-up date is set | "Set <first>’s next visit" / "<service> on <day> · no follow-up date and nothing booked" | today 17:00 | me |
| Regulars gone quiet | peach · `phone` | "Patient #<id>" | a package with sessions left or ≥ 2 completed visits, last visit ≥ 30 days ago, nothing booked | "<first> has gone quiet" / "<Package has sessions left \| Regular patient> · last visit <n> days ago · <r> reminder(s) sent, no reply" (r = 1–3) | today 12:00 | me |
| Follow-ups you set | plum · `bell` | the source of the task it followed (e.g. "Appt #2838"), else "Contact" | created from "What’s next" | "<next step> · <first>" / the note, else "Planned after: <closed task> · <result>" | as picked | as picked |

Due label: overdue "<n> min overdue" / "<n> h overdue" / "<n> d overdue"; within 12 h "in <n> min" / "in <n> h"; later "<Today | Tomorrow | Yesterday | Ddd D Mon> <h:mm am>". Snoozed rows: "Snoozed · <label>". Done rows: "Done · Now" (closed by you) or "Done by Clinozy". A task closes itself when its record changes and is logged "Done by Clinozy" with "Visit status changed in Appointments" (confirm), "Reply sent from the lead chat" (reply) or "Resolved in <source>" (others). The Done tab also lists up to 4 visits confirmed by a WhatsApp "Yes": "Confirmed <first>’s visit" / "<day> <h:mm am> · <service>" / "✓ Patient replied Yes to the WhatsApp reminder" / owner "Anyone" / "Done by Clinozy". Rules turned off in the Rules popover drop out of every tab.

## Forms

### Toolbar search

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | q | search input (maxLength 80), 36px (40px phone) | aria-label "Search tasks"; tooltip "Search · press /" | "Search tasks or people" | matches the task title, person and why line | no | 300 ms debounce; each change re-fetches the list (row skeleton); clearing is instant |

- Error display: n/a — free text, nothing to validate.
- Submit: none — filters as you type.
- Loading: row skeleton (160–380 ms).
- Success: rows filter; no matches in To do → the To do empty copy.
- Dirty-state guard: n/a — no draft to lose.

### Task drawer · outcome note

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | note | text area, 2 rows, vertical resize, 13px, padding 8px 10px, radius 8px | aria-label "Outcome note" (sits under the outcome buttons, no visible label) | "Add a note to the outcome (optional)" | appended to the stored result as " · <note>" | no | ≤ 200 chars |

- Error display: n/a — closing a task writes locally and cannot fail in the prototype.
- Submit: none — each outcome button closes the task (see Multi-step flow).
- Loading: none — instant.
- Success: toast "<task title> · <result>" + "Undo" (5.2 s); the row moves to Done ("Done · Now"); when the task has a lead, a system line "Task closed · <result>" joins that lead's chat; 380 ms later "What’s next for <first>?" opens.
- Dirty-state guard: none — closing the drawer drops the note.

### What’s next for <first>?

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | step | single-select chips, full row, each in its tone | "Next step" | none | "Call again" (sky) · "Send WhatsApp" (sage) · "Book a visit" (lav) · "Collect payment" (peach) · "Send offer" (butter) | yes | toast "Pick the next step" on Save |
| 2 | when | single-select chips, full row, zinc-100 | "When" | none | "In 3 hours" · "Tomorrow 11 am" · "In 3 days" · "Next week" | yes | toast "Pick when" on Save |
| 3 | owner | person picker (dropdown, half row, person chip in the trigger) | "Assigned to" | none | the team except people who left; the signed-in user preselected ("Riya S. (you)") | yes (preset) | none |
| 4 | note | text input, half row | "Note" | "e.g. Ask about the peel price" | becomes the new task's why line | no | none |

- Error display: toast only, no inline message.
- Submit: "Create task" (dark, footer right; always enabled).
- Loading: "Saving…" for 320–740 ms; a failed save (10% simulated) keeps the drawer open with the red footer line "Not saved · your changes are kept", the button "Retry save" and toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" (9 s).
- Success: toast "Next task set · <step> · <when, lower-case>"; the drawer closes; a "Follow-ups you set" task "<step> · <first>" appears, due in 3 hours / tomorrow 11:00 / in 3 days / in 7 days.
- Dirty-state guard: none — "Nothing next" closes and discards.

## Popups

### Task drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, full height, two columns: the task column and the shared lead chat column |
| Shape (mobile) | Phone: full-screen sheet (100% width, no shadow or border), one column — the task column only, with a 56px right inset kept for the close button; the chat column collapses to a 0-height row and is not shown, so there is no messaging from the task drawer on phone. The floating × moves inside to the top-right (8px from the edges, 44×44, transparent, 22px glyph). Footer buttons stay 36px. Tablet: as desktop — 820: 780px drawer = 409px task column + 371px chat |
| Trigger | click on a To do or Snoozed row (and a Done row whose task still exists) |
| Size | width min(900px, 100vw − 40px); columns `minmax(0,1fr)` + chat width max(360px, min(chat width ‖ 420px, round(min(980px, 94vw)) − 400px)). "chat width" is the width last dragged in the lead drawer (360–680px). 1440 and 1024: 900 = 480 + 420; 820: 780 = 409 + 371 |
| Dismiss | backdrop click (rgb(9 9 11 / .45)), floating ×, footer "Close", Esc; it also closes after any outcome, snooze, claim or "Let Clinozy do it", and when the task resolves itself (e.g. a "Reply to …" task once a reply is sent from its chat) |
| Header | 76px (60px phone), padding 14px 24px (12px 20px compact; 10px 16px phone), bottom hairline: 36px rule icon tile (radius 8px, rule tone, 18px icon) · title 17px/600, −0.01em, ellipsis + sub "Created by Clinozy · <rule description, lower-case>" 12.5px zinc-500 · right column: due 12.5px/600 (red when overdue) above a 24px "Assigned to" chip (20px avatar, 11.5px). Close × floats outside the drawer's left edge (36px, radius 12px, white, shadow 0 4px 14px rgb(0 0 0 / .18), top 14px) |
| Footer | inside the task column, padding 12px 24px (12px 20px compact; 12px 16px phone), top hairline: left "Snooze ⌄" (36px) · "Assigned <name> ⌄" (36px; tooltip "Move this task to someone else · the previous person stays on it") · "Was <A> → <B>" (12px zinc-500, only after a reassign); right "Close" (36px outline). No primary button — the outcomes in the body are the actions |
| Multi-step | no — one body; closing chains into "What’s next" (see Multi-step flow) |
| Initial focus | none — nothing is focused on open |

Task column body (padding 20px 24px 28px; 16px 20px 20px compact; 14px 16px 20px phone; gap 16px; scrolls):

1. Who row — hover block with a 36px lav avatar (12px/600 initials) + name 14px/600 (hover → contact card) · source button right (32px, outline, 12.5px/500): "Open appointment · Appt #<id>" (appointment form in edit, opened at Visit status) · "Open lead · Lead #<id>" (Leads with the lead drawer open) · "Open patient · Treatment #<id>" (patient file) · patient-sourced tasks read "Open lead · Patient #<id>" and open the patient file.
2. "1 · What" (11px/600 uppercase label) — why 13.5px, line-height 1.5; the inbound or failed message quoted in a zinc-50 box (13px) as “<message>”.
3. Context tiles — grid `repeat(auto-fill, minmax(150px, 1fr))`, gap 8px (2 per row at 1440, 1 per row on phone); tile padding 8px 10px, 1px border, radius 8px: label 10.5px/600 uppercase zinc-500 + value 13px/500 ellipsis. Appointment tasks: "Visit" (<day> · <h:mm am> · <n> min) · "Service" · "Doctor" · "Status"; treatment tasks: "Treatment" · "Done on" · "Session" (#n) · "Therapist"; lead tasks (and any task whose person has a lead): "Status" · "Source" · "Interested in" · "Owner" · "Mobile" (a duplicate label keeps the first). Patient-only tasks: no tiles.
4. "2 · How" — 3 numbered steps (22px zinc-100 circles, 11px/600 numbers, 13px text) per rule (see Copy).
5. "Clinozy can do this" card — only for rules with an automation: dashed zinc-300 border, radius 12px, padding 12px; 32px zinc-900 tile with the sparkles icon; "Clinozy can do this" 13px/600 + the automation text 12px; button "Let Clinozy do it" (32px, 1px zinc-900 border). It resolves the task as "Done by Clinozy", sends the suggested WhatsApp on the lead's chat when there is a lead, closes the drawer and toasts "Clinozy is on it · <automation, lower-case>".
6. "3 · Close with · then pick what’s next" — outcome buttons in a grid `repeat(auto-fill, minmax(200px, 1fr))`, gap 8px; each min-height 56px, padding 9px 12px, radius 8px: label 13px/600 + effect line 11.5px; the first outcome is dark (zinc-900 fill, zinc-50 label, zinc-300 effect), the rest white with a divider border; hover shadow-md. Then the outcome note.

Chat column: the shared lead chat column (header, thread with system chips, "No conversation yet" starter card, channel tabs, Suggest, Book, Send) — internals in `_patterns.md` › chat column. Task-specific:

- Binding on open: the task's own lead when its source is a lead; else the person's lead found by name (chat-only threads skipped); else a new chat-only contact thread is created for the person (no status, no source, owner = me, interest = the appointment's service) and seeded with one system line — "Appointment #<id> · <service>" for appointment tasks, "Task · <task title>" for every other task. The prototype creates a fresh chat-only thread on every open of the same person's task.
- The composer starts on the channel of the person's last inbound message (else last outbound, else their default channel, else WhatsApp).
- Footer line of the thread: "Lead created · <when> · via <source>" for leads; "Patient · chat only · no lead" or "Contact · chat only · no lead" for chat-only threads.
- Sending never closes the task. A "Reply to <first>" task resolves itself once the last message is outbound (Done by Clinozy · "Reply sent from the lead chat") and the drawer closes because its task is gone.
- Phone: the chat column is not shown.

### What’s next for <first>?

| Field | Value |
| --- | --- |
| Shape (desktop) | stacked child side drawer, right edge, full height, above everything (z 100) — over the list, or over whatever the outcome opened (appointment form, check-in, review log) |
| Shape (mobile) | Phone: full-screen sheet; × moves inside to the top-right (8px, 44×44); footer wraps with 44px buttons and safe-area padding. Tablet: as desktop |
| Trigger | opens by itself 380 ms after a task is closed with a closing outcome (not after a snooze, "Claim it", "Fix the number" or "Let Clinozy do it") |
| Size | min(560px, 100vw − 56px) |
| Dismiss | backdrop click (rgb(9 9 11 / .45)), floating × (36px, radius 12px, outside the left edge, no entrance animation), footer "Nothing next" — Esc is not wired |
| Header | 76px (60px phone): "What’s next for <first>?" 18px/600 + sub "Closed · <task title> · <result>" 13px zinc-500 |
| Footer | right-aligned: "Nothing next" (outline, 36px) · "Create task" (zinc-900, 36px); the red "Not saved · your changes are kept" line after a failed save |
| Multi-step | no — one section headed "Next task" |
| Initial focus | none |

### Task rules popover

| Field | Value |
| --- | --- |
| Shape (desktop) | popover under the "Rules" button, right-aligned to it (6px gap), over a transparent click-catcher |
| Shape (mobile) | Phone: bottom sheet — full width, max-height 82%, top corners 16px, slides up 28px (260 ms). Tablet: as desktop |
| Trigger | "Rules" |
| Size | 400px wide (max 100vw − 40px), max-height 100vh − 160px; the rule list scrolls |
| Dismiss | outside click, the "Rules" button again — Esc is not wired |
| Header | "What creates tasks" 13.5px/600 + "Clinozy watches leads, appointments and feedback and creates a task when someone needs to act. A task closes itself when the record changes." 12px zinc-500; bottom hairline; no × |
| Footer | none |
| Multi-step | no |
| Initial focus | none |

Each rule row (padding 10px 8px, radius 8px, hover zinc-50): 8px tone dot · label 13px/500 + "<source> · <description>" 11.5px zinc-500 · switch 34×20 (on = green oklch(0.52 0.12 150), knob 16px white, 150 ms); under it, for rules with an automation, the automation text 11.5px zinc-600 + a 26px pill "Let Clinozy handle" (white) ↔ "Clinozy handles it" (zinc-900). Switching a rule off removes its tasks from every tab; "Clinozy handles it" adds the "Clinozy can do this" pill to that rule's rows.

### Dropdowns (task type · Snooze · Assigned)

| Field | Value |
| --- | --- |
| Shape (desktop) | floating popover under its trigger (shared dropdown, `_patterns.md`); flips up when there is no room |
| Shape (mobile) | Phone: bottom sheet (full width, max-height 72%, top corners 16px, dim backdrop rgb(9 9 11 / .4)). Tablet: as desktop |
| Trigger | type: "All types" in the toolbar · Snooze: footer "Snooze ⌄" · Assigned: footer "Assigned <name> ⌄" |
| Size | type min 280px · Snooze min 200px · Assigned min 260px |
| Dismiss | outside click, Esc, picking an option (type is multi-select and stays open) |
| Header | type: search field (13 static options, filters instantly) · Assigned: search field (people list — typing waits 250 ms and shows skeleton rows) · Snooze: none |
| Footer | none |
| Multi-step | no |
| Initial focus | the search field (type, Assigned); the option list (Snooze) |

Type options: the 13 rules, grouped by source (Leads · Appointments · Feedback · Treatments · Patients · Team), each in its tone, multi-select with a clear (×); trigger reads "All types" / the one rule's label / "<n> types". Snooze options: "1 hour" · "3 hours" · "Tomorrow 10:00" (snoozes 24 h) · "Next week". Assigned options: every current team member, "(you)" after the signed-in user, role as the sub line; picking moves the task (and, for lead tasks, the lead) to that person, the previous owner stays involved, the row shows "· was <first name>".

## Multi-step flow

- Steps (ordered): 1 open the task → 2 close it with an outcome (or snooze / claim / let Clinozy do it) → 3 "What’s next for <first>?" → 4 "Create task" or "Nothing next".
- **Sequence varies by input?** yes — by rule and outcome. The first outcome of each rule is the dark one. "Then" says what follows step 2.

| Rule | Outcome | Effect line on the button | What it writes / result | Then |
| --- | --- | --- | --- | --- |
| Unreplied messages | "Booked a visit" | "Appointment form opens · lead moves to Follow-up" | lead → Follow-up; result "Booked a visit" | appointment form (new: this person, Consultation or LHR Treatment, 20 min, today) + What’s next on top |
| Unreplied messages | "Not interested" | "Lead status → Not interested" | result "Not interested" (Undo restores the status) | What’s next |
| Unreplied messages | "Spam or wrong number" | "Lead status → Invalid" | result "Marked invalid" | What’s next |
| Lead follow-ups | "Booked a visit" | "Appointment form opens" | result "Booked a visit" | appointment form + What’s next |
| Lead follow-ups | "Call back tomorrow" | "Follow-up date → tomorrow 11:00" | call logged "Asked to call back tomorrow"; result "Call back tomorrow" | What’s next |
| Lead follow-ups | "No answer" | "Call logged · task snoozes 2 hours" | call logged "Called · no answer"; snoozed "2 h · no answer" | none — toast "Snoozed · 2 h · no answer" |
| Lead follow-ups | "Not interested" | "Lead status → Not interested" | result "Not interested" | What’s next |
| Leads open to claim | "Claim it" | "You become the owner · <owner> stays involved" | lead claimed; toast "You now own <name> · <owner> stays involved" + "Undo"; the task disappears | none |
| Leads open to claim | "Leave with owner" | "Hidden until tomorrow" | snoozed "until tomorrow" | none |
| Messages not delivered | "Retry send" | "Resends on the same channel" | message marked sent; result "Resent" | What’s next |
| Messages not delivered | "Called instead" | "Call logged on the lead" | result "Called instead" | What’s next |
| Messages not delivered | "Fix the number" | "Opens the lead to edit" | nothing written; the task stays open | drawer closes; the person opens (patient file or lead drawer) |
| Confirm visits | "Confirmed on call" | "Appointment → Confirmed" | result "Confirmed on call" | What’s next |
| Confirm visits | "Move to another slot" | "Opens the appointment to reschedule" | result "Moving to another slot" | appointment form (move) + What’s next |
| Confirm visits | "Cancelled by patient" | "Appointment → Cancelled · slot freed" | result "Cancelled by patient" | What’s next |
| Confirm visits | "No answer" | "Call logged · task snoozes 2 hours" | snoozed "2 h · no answer" | none |
| Arrived or no-show | "Checked in" | "Appointment → Checked in" | result "Checked in" | What’s next |
| Arrived or no-show | "Running late" | "Task snoozes 30 minutes" | snoozed "30 min · running late" | none |
| Arrived or no-show | "No show" | "Appointment → No show · a rebook task follows" | result "Marked no-show"; a "Rebook <first>" task appears | What’s next |
| Rebook no-shows | "Rebooked" | "Appointment form opens with the same service" | result "Rebooked" | appointment form + What’s next |
| Rebook no-shows | "Will call back" | "Task snoozes until tomorrow" | snoozed "until tomorrow" | none |
| Rebook no-shows | "Not coming back" | "Closed with reason" | result "Not coming back" | What’s next |
| Collect feedback | "Happy · 4–5★" | "Sends the Google review link · opens the review log" | WhatsApp "Thank you! Would you leave us a quick Google review?"; result "Happy · review link sent" | Log review drawer + What’s next on top |
| Collect feedback | "Unhappy" | "Creates a call-back task for <doctor>" | an "Unhappy patients" task for the doctor, due 18:00; result "Unhappy · call-back task created for <doctor>" | What’s next |
| Collect feedback | "Log check-in" | "How it is now · what they followed · next plan" | result "Check-in logged" | Visit check-in drawer + What’s next on top |
| Collect feedback | "Sent the form" | "Logged · snoozes until tomorrow" | WhatsApp "How was your visit? Rate us 1–5 here: clinozy.app/f/<appt id>"; snoozed "until tomorrow · form sent" | none |
| Aftercare calls | "Log check-in" | "How it feels · what they followed · next plan" | result "Check-in logged" | Aftercare check-in drawer + What’s next on top |
| Aftercare calls | "Doing well" | "Logs a quick “Better” check-in" | a "Better" check-in (note = the outcome note or "Doing well on the call"); result "Doing well · check-in logged" | What’s next |
| Aftercare calls | "No answer" | "Call logged · snoozes 3 hours" | call logged "Aftercare call · no answer"; snoozed "3 h · no answer" | none |
| Unhappy patients | "Called · resolved" | "Closed with your note" | result "Resolved on call" | What’s next |
| Unhappy patients | "Offered a review visit" | "Appointment form opens" | result "Review visit offered" | appointment form + What’s next |
| Next visit not set | "Book next visit" | "Appointment form opens for <first>" | result "Next visit booked" | appointment form + What’s next |
| Next visit not set | "Set follow-up date" | "Sets the follow-up to 2 weeks from today" | patient follow-up = today + 14 days; result "Follow-up set · <D Mon YYYY>" | What’s next |
| Next visit not set | "No follow-up needed" | "Closed · treatment complete" | result "No follow-up needed" | What’s next |
| Regulars gone quiet | "Call now" | "Opens the patient file · log the call there" | result "Called" | patient file + What’s next on top |
| Regulars gone quiet | "Send offer" | "Sends a come-back offer on WhatsApp · snoozes a week" | WhatsApp "We miss you at Cresence! Your next session is waiting — reply to pick a slot." (when there is a lead); snoozed "a week · offer sent" | none |
| Regulars gone quiet | "Not coming back" | "Closed with reason" | result "Not coming back" | What’s next |
| Follow-ups you set | "Done" | "Closed · pick what comes next" | result "Done" | What’s next |
| Follow-ups you set | "No answer" | "Snoozes 3 hours" | snoozed "3 h · no answer" | none |
| Follow-ups you set | "Booked a visit" | "Appointment form opens" | result "Visit booked" | appointment form + What’s next |
| any rule with an automation | "Let Clinozy do it" (card above the outcomes) | the automation text | resolved "Done by Clinozy" with the automation text | none |

Every closing outcome toasts "<task title> · <result>" + "Undo"; every snooze toasts "Snoozed · <label>" + "Undo". Viewport changes nothing in this sequence except that on phone the drawers are full-screen and the chat column is not shown.

- Progress indicator: none — the drawer's section labels "1 · What", "2 · How", "3 · Close with · then pick what’s next" number the reading order only.
- Navigation: no Back / Next; the task drawer closes when an outcome is picked and What’s next opens on its own; "Nothing next" ends the flow.
- Per-step validation: What’s next blocks "Create task" until a "Next step" and a "When" are picked (toasts "Pick the next step" / "Pick when"); outcomes need no input (the note is optional).
- Edit mode: n/a — tasks are never edited; a task is closed, snoozed or reassigned.

## Preview / animated panels

n/a — no animated or auto-switching panel on Tasks.

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Section (All sections, pinned tab, phone tab bar) | Lucide `square-check` (key `check`) | 16 | no |
| Rule — Unreplied messages | Lucide `message-square` (key `chat`) | 15 row · 18 drawer | yes — rule type |
| Rule — Lead follow-ups, Regulars gone quiet | Lucide `phone` | 15 · 18 | yes |
| Rule — Leads open to claim | Lucide `users` | 15 · 18 | yes |
| Rule — Messages not delivered, Unhappy patients | Lucide `info` | 15 · 18 | yes |
| Rule — Confirm visits, Next visit not set | Lucide `calendar` | 15 · 18 | yes |
| Rule — Arrived or no-show | Lucide `clock` | 15 · 18 | yes |
| Rule — Rebook no-shows | Lucide `refresh-cw` (key `refresh`) | 15 · 18 | yes |
| Rule — Collect feedback, Aftercare calls | Lucide `sparkles` | 15 · 18 | yes |
| Rule — Follow-ups you set | Lucide `bell` | 15 · 18 | yes |
| "Rules" button, "Clinozy can do this" tile | Lucide `sparkles` | 15 | no |
| Search (collapsed button and field) | Lucide `search` | 15 | no — aria-label "Search tasks" |
| Dropdown chevrons (type, Snooze, Assigned) | Lucide `chevron-down`, rotated 180° when open | 14 | no |
| Patient badge on avatars | text "P" in a 14px green disc — not an icon | 14 | yes — tooltip "Patient" |
| Chat column (channel tabs, Suggest, Book, Send) | as in `_patterns.md` › chat column (the WhatsApp tab uses the brand glyph key `wa`, not Lucide) | as in `_patterns.md` | yes — channel and action icons carry aria-labels |

Library: Lucide · Weight: regular (2px stroke)

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Task drawer panel | transform translateX 100%→0 (czdrawer) | 340ms | cubic-bezier(.32,.72,0,1) |
| Task drawer backdrop | background-color transparent→rgb(9 9 11 / .45) (czbd) | 340ms | cubic-bezier(.32,.72,0,1) |
| Task drawer floating × | opacity 0→1, scale .9→1 (czpop), 200ms delay | 200ms | ease |
| What’s next panel / backdrop | same as the task drawer (no × animation) | 340ms | cubic-bezier(.32,.72,0,1) |
| Rules popover | opacity 0→1, translateY −4px→0, scale .985→1 (czddin), origin top right | 160ms | cubic-bezier(.2,.8,.2,1) |
| Rules sheet / dropdown sheet (phone) | translateY 28px→0, opacity 0→1 (czsheet) | 260ms | cubic-bezier(.32,.72,0,1) |
| Rule switch | knob left 2px↔16px, track colour | 150ms | ease |
| Toolbar search expand | flex-basis / width 36px→220px | 220ms | cubic-bezier(.2,.8,.2,1) |
| Dropdown chevron | rotate 0→180° | 150ms | ease |
| Row / list skeleton | flat #efeff1 bars, background-position shimmer (czsk) | 1100ms loop | ease |

Reduced-motion: every animation and transition runs 1ms with no delay, iteration count 1 (the skeleton shimmer stops), no smooth scrolling.

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| To do list | first open: page skeleton (leaf text → #efeff1 bars, avatars → grey circles, icons hidden; 260–560 ms, +280–600 ms 10% of the time); tab / search / type changes: row skeleton (160–380 ms) | "Nothing needs you right now. New tasks appear here as leads write, visits come up and feedback arrives." (13px zinc-500, max 420px, centred, 48px top margin) | 5% of fetches end with toast "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" (9 s); rows stay |
| Snoozed list | row skeleton | only the "Snoozed" group header, no rows (the copy "No snoozed tasks" is defined but never renders) | same toast |
| Done list | row skeleton | only the "Resolved" group header (the copy "Nothing resolved yet today" is defined but never renders; WhatsApp-confirmed visits usually fill it) | same toast |
| Task drawer | drawer skeleton on open: the chat thread's text turns into bars for 200–440 ms; the task column (header, body, footer) stays readable | context tiles: none for patient-only tasks; chat: "No conversation yet" starter card (`_patterns.md`) | n/a — outcomes write locally and never fail in the prototype |
| Chat column | thread text → skeleton bars for 200–440 ms on open | starter card; filtered channel with nothing: "Nothing of this kind yet" | message "Not sent" + "Retry" (`_patterns.md`) |
| What’s next | none — its fields show at once | n/a — a form, every field shows | save failure (10% simulated): red "Not saved · your changes are kept" + "Retry save" + toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" |
| Rules popover | none — opens instantly (no skeleton) | n/a — the 13 rules are fixed | n/a — local switches |
| Type / Snooze / Assigned dropdowns | type, Snooze: none — fixed lists; Assigned: typing waits 250 ms, then skeleton rows + a spinner in the search field | type search with no match: "No results for “<q>”" + "Check the spelling or try fewer letters"; Assigned: the shared people-list empty copy (`_patterns.md`) | n/a — local lists |

Success: outcome and snooze toasts with "Undo" (see Copy); "Next task set · …" after What’s next.

## Copy

| Key | Exact string |
| --- | --- |
| title | "Tasks" |
| view tabs | "To do" · "Snoozed" · "Done" (aria-label "Task view") |
| search | placeholder "Search tasks or people" · tooltip "Search · press /" · aria-label "Search tasks" |
| type trigger | "All types" · "<rule label>" · "<n> types" (dropdown label "Task type") |
| scope | "Mine" · "Everyone" (aria-label "Scope") |
| rules button | "Rules" |
| group headers | "Overdue" · "Due today" · "Coming up" · "Snoozed" · "Resolved" |
| row pill | "Clinozy can do this" |
| unowned | "Anyone" |
| reassigned owner | "<name> · was <first name>" |
| source chips | "Lead #<id>" · "Appt #<id>" · "Treatment #<id>" · "Patient #<id>" · "Contact" |
| due labels | "<n> min overdue" · "<n> h overdue" · "<n> d overdue" · "in <n> min" · "in <n> h" · "Today 11:30 am" · "Tomorrow 3:30 pm" · "Snoozed · <label>" · "Done · Now" · "Done by Clinozy" |
| resolved by Clinozy | "Visit status changed in Appointments" · "Reply sent from the lead chat" · "Resolved in <source>" · "Patient replied Yes to the WhatsApp reminder" |
| empty — To do | "Nothing needs you right now. New tasks appear here as leads write, visits come up and feedback arrives." |
| empty — Snoozed (defined, not rendered) | "No snoozed tasks" |
| empty — Done (defined, not rendered) | "Nothing resolved yet today" |
| rules header | "What creates tasks" · "Clinozy watches leads, appointments and feedback and creates a task when someone needs to act. A task closes itself when the record changes." |
| rule — Unreplied messages | "Leads · A lead wrote and nobody has replied" · automation "Send the first reply with prices and free slots" |
| rule — Lead follow-ups | "Leads · The follow-up date has arrived" · "Send a friendly check-in on WhatsApp" |
| rule — Leads open to claim | "Leads · The owner has been idle past the hold period" |
| rule — Messages not delivered | "Leads · The provider could not deliver a message" · "Retry on SMS, then flag for a call" |
| rule — Confirm visits | "Appointments · A visit in the next 48 hours has no confirmation" · "Send the reminder and confirm when they reply Yes" |
| rule — Arrived or no-show | "Appointments · 15 minutes past the start and not checked in" |
| rule — Rebook no-shows | "Appointments · The patient missed the visit" · "Offer the next two free slots on WhatsApp" |
| rule — Collect feedback | "Feedback · A visit was completed yesterday" · "Send the feedback form and close on 4–5★" |
| rule — Aftercare calls | "Treatments · A treatment asked for a follow-up call" · "Send the aftercare check-in on WhatsApp and log the reply" |
| rule — Unhappy patients | "Feedback · Feedback was 3★ or lower" |
| rule — Next visit not set | "Patients · A visit was completed but no follow-up date or next booking exists" · "Suggest two slots on WhatsApp and set the follow-up when they pick one" |
| rule — Regulars gone quiet | "Patients · A regular or package patient has not booked for 30+ days and the periodic reminders got no reply" |
| rule — Follow-ups you set | "Team · Scheduled after closing another task" |
| automation pill | "Let Clinozy handle" · "Clinozy handles it" |
| drawer sub | "Created by Clinozy · <rule description, lower-case>" (e.g. "Created by Clinozy · a treatment asked for a follow-up call") |
| drawer assigned chip | tooltip "Assigned to" |
| source button | "Open appointment · Appt #<id>" · "Open lead · Lead #<id>" · "Open patient · Treatment #<id>" · "Open lead · Patient #<id>" |
| section labels | "1 · What" · "2 · How" · "3 · Close with · then pick what’s next" |
| context tile labels | "Visit" · "Service" · "Doctor" · "Status" · "Source" · "Interested in" · "Owner" · "Mobile" · "Treatment" · "Done on" · "Session" · "Therapist" |
| how — Unreplied messages | "Read their last message on the right" · "Answer with prices and two free slots" · "Book the visit if they pick one" |
| how — Lead follow-ups | "Check what they were interested in" · "Call or WhatsApp with a friendly nudge" · "Book, set a new follow-up or close the lead" |
| how — Leads open to claim | "Look at the chat history" · "Claim it if you can take it" · "Otherwise leave it for the team" |
| how — Messages not delivered | "Check the mobile number" · "Resend on WhatsApp or SMS" · "Call if it fails again" |
| how — Confirm visits | "Send or repeat the reminder" · "Call if there is no reply by evening" · "Move the slot if they cannot come" |
| how — Arrived or no-show | "Call the patient" · "Mark Checked in when they arrive" · "Mark No-show after 30 minutes" |
| how — Rebook no-shows | "Call or WhatsApp with two free slots" · "Book the one they pick" · "Close if they are not coming back" |
| how — Collect feedback | "Ask how the visit went" · "Ask for a Google review on 4–5★" · "Book the next session" |
| how — Aftercare calls | "Call and ask how the skin feels" · "Check they followed the aftercare" · "Log a check-in with the answer" |
| how — Unhappy patients | "Read the feedback first" · "Doctor or manager calls back" · "Offer a review visit or credit if needed" |
| how — Next visit not set | "Check what the doctor advised" · "Offer two slots for the next visit" · "Set a follow-up date if they are not ready" |
| how — Regulars gone quiet | "Look at the package and last visit" · "Call once, then send a come-back offer" · "Close if they are not coming back" |
| how — Follow-ups you set | "Do what was planned" · "Log what happened" · "Schedule the next step if needed" |
| automation card | "Clinozy can do this" · "<automation text>" · "Let Clinozy do it" · toast "Clinozy is on it · <automation, lower-case>" |
| suggested WhatsApp (sent by "Let Clinozy do it") | reply "Hi <first>, thanks for writing to us. Our doctor can see you this week. Shall I book a consultation?" · follow-up "Hi <first>, checking in about your <interest> enquiry. Would you like to book a visit?" · confirm "Hi <first>, a reminder of your <service> on <day> at <h:mm am>. Reply Yes to confirm." · rebook "Hi <first>, we missed you. Shall we find a new time for your <service>?" · feedback "Hi <first>, how was your <service>? Rate us 1–5." · aftercare "Hi <first>, checking in after your treatment. How does your skin feel today? Any redness or discomfort?" |
| outcome note | "Add a note to the outcome (optional)" |
| footer | "Snooze" · "Assigned" · "Close" · "Was <A> → <B>" · tooltip "Move this task to someone else · the previous person stays on it" |
| snooze options | "1 hour" · "3 hours" · "Tomorrow 10:00" · "Next week" |
| assign options | "<name> (you)" for the signed-in user; dropdown label "Assign to" |
| close toast | "<task title> · <result>" + "Undo" |
| snooze toast | "Snoozed · <label>" + "Undo" |
| reassign toast | "<task title> → <name> · <previous first name> stays on it" + "Undo" |
| claim toast | "You now own <name> · <owner> stays involved" + "Undo" |
| lead chat lines | "Task closed · <result>" · "Moved from <A> to <B> · <A> stays involved" |
| chat-only seed line | "Appointment #<id> · <service>" · "Task · <task title>" |
| chat footer line | "Lead created · <when> · via <source>" · "Patient · chat only · no lead" · "Contact · chat only · no lead" |
| what’s next title | "What’s next for <first>?" · sub "Closed · <task title> · <result>" · section "Next task" |
| what’s next fields | "Next step" · "When" · "Assigned to" · "Note" · placeholder "e.g. Ask about the peel price" |
| what’s next chips | "Call again" · "Send WhatsApp" · "Book a visit" · "Collect payment" · "Send offer" · "In 3 hours" · "Tomorrow 11 am" · "In 3 days" · "Next week" |
| what’s next buttons | "Nothing next" · "Create task" · "Saving…" · "Retry save" |
| what’s next toasts | "Pick the next step" · "Pick when" · "Next task set · <step> · <when, lower-case>" |
| new follow-up task | title "<step> · <first>" · why "<note>" or "Planned after: <closed task title> · <result>" |
| save failure | "Not saved · your changes are kept" · toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" |
| load error toast | "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" |
