# Screen: Appointments

- Route: /appointments (views Agenda · Day · Week · Month; appointment form /appointments/create · /appointments/:appointmentId)
- Purpose: Bookings by doctor — an agenda of upcoming visits and a day, week and month calendar.
- Entry points: header tab "Appointments" (phone: bottom tab bar or "All sections"), ⌘K "New appointment" (opens this screen, not the form). The appointment form also opens from the contact card "+ Appointment", the lead composer "Book an appointment", patient file booking actions, Tasks, and "Appointment #…" pills in any chat
- Exit points: appointment form, lead drawer ("Connected lead" chip), patient record ("Create patient record"), patient file (photo tiles), contact card, team card
- Access: view — Admin, Doctor, Front desk, Counsellor, Therapist; create and edit — Admin, Doctor, Front desk, Counsellor (role defaults, editable in Users › Roles). "New appointment" and "book one" are hidden for roles without create.
- Layout shell: app shell
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: sky. "Today" is the device date with the time clamped to 9:00–19:59.

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| Toolbar | h1 "Appointments" · view tabs "Agenda" · "Day" · "Week" · "Month" · (not on Agenda) "Today" / "This week" / "This month" + "‹ <period> ›" · search · "Filters" · "New appointment" | One wrapping row, padding 16px 20px (12px 12px when the window is < 1440px wide or < 800px tall), gap 10px 8px. Left: h1 20px/600 with a hairline on its right, tabs (28px segments), Today button (36px) + period group (36px: 34px arrows, label min 150px, 13.5px/600). Right: search 200px (150–220px, 36px), Filters (36px), "New appointment" (36px dark) | Phone: h1 hidden; row 1 = search (40px, grows) + Filters (40px); row 2 = view tabs "Agenda" · "Day" · "Month" (Week is not offered) at full width; row 3 (Day, Month) = Today + period group; "New appointment" becomes a floating pill (52px, radius 999px, right 16px, bottom 74px + safe area, 14px text) above the bottom tab bar; padding 8px 12px. Tablet: h1 18px; the tabs shrink to min 120px and scroll sideways | Search placeholder "Patient, phone or #ID", tooltip "Search · press /"; matches name, mobile and ID ignoring spaces |
| View card | Agenda table, Day or Week time grid, or Month grid | Card with margin 0 20px 20px (0 12px 12px compact), radius 12px, 1px border, shadow 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px -8px rgb(0 0 0 / .06) | Phone: margin 0; in Agenda also no radius, side borders or shadow, header hidden and rows re-gridded; Day gets the Doctor strip and loses its header; Month keeps 7 columns. Tablet: Agenda in 6 columns, Week scrolls sideways | Details in Data display |
| Footer strip | 40px bar under the view, 1px top border, z50 | Present, holds no text | Phone: same | Its text slot is empty in every state |
| Appointment form | right drawer (+ chat column when editing) | See Popups | Phone: full width, no chat column | Modal, z 70 |

## Data display

Primitive: table (Agenda) · calendar grid with booking blocks (Day, Week, Month)

### Agenda table

| Field | Value |
| --- | --- |
| Columns (ordered) | Time ("10:30 am" 13.5px/600 + "<n> min" 11.5px) · Contact (32px avatar — sage with a 14px "P" badge for patients, lavender for leads, grey otherwise — name 13px/500, mobile 11.5px) · Service (24px pill in the service tone) · Appointed to (doctor chip 28px: 22px avatar with a 7px online dot + name) · Latest update (24px pills: "✓ Plan ready" sage or "○ Plan pending" butter unless Cancelled or No show, then the latest of "✓ Reminder read", "✓ Reminder delivered", "✓ Reminder sent", "✓ Replied Yes", "✓ Moved" / "✓ Moved ×<n>", "✓ Checked in"; "—" when none) · Quick view (32px eye button) · Status (32px button: status pill with a 6px dot + chevron) |
| Column widths | 76px · minmax(150px,1.6fr) · minmax(96px,1fr) · minmax(128px,.9fr) · minmax(112px,1.1fr) · 36px · 132px; gap 10px; minimum width 790px; header 37px, uppercase 11px/600, z50 |
| Sortable | Contact (A–Z), Service, Status (Scheduled → Confirmed → Checked in → Completed → Cancelled → No show), within each day group; clicks cycle ascending → descending → off. Time, Appointed to, Latest update not sortable |
| Row height | About 53px (10px top and bottom padding around the 32px avatar; taller when update pills wrap); 3px left edge in the status dot colour; hover z50 |
| Row click | Opens the appointment form in edit mode (clicks on buttons and the doctor chip are ignored); clicking the name also opens it; hovering the name shows the contact card (280ms); hovering the doctor shows the team card |
| Row actions | Quick view (eye, tooltip "Quick view") → pinned appointment card; Status button → "Change status" popover |
| Selection | None |
| Mobile behaviour | Phone: the header is hidden and each row re-grids to three tracks — 60px · 1fr · auto: time (spans rows 1–2) · contact (row 1) · status (row 1, right); service (row 2) · doctor (row 2, right); latest update (row 3, across); quick view hidden; gap 6px 10px; rows, not cards. Tablet: 6 columns without Latest update — 84px · minmax(0,1.5fr) · minmax(0,1.1fr) · minmax(0,1fr) · 40px · 160px — header included, and no sideways scroll |
| Pagination | None — every matching appointment from today on (or the picked day) renders, grouped by day, ending with "All appointments loaded" |

Day groups: sticky header (tone tint at 55%) with a 34px date tile (day number 14px + month 9px uppercase; today sage, other days cycle sky, lavender, blush, butter, mint), label "Today" / "Tomorrow" / weekday, a sub line (weekday, "In <n> days", "Next week", "In <n> weeks", "Yesterday", "<n> days ago") and, right, "<n> confirmed" · "<n> awaiting reply" or "<n> confirmed · all set" (tooltip "<n> confirmed · <n> waiting for a reply"). Default filter: Active (Scheduled, Confirmed, Checked in), from today on.

### Calendar blocks (Day · Week · Month)

| Field | Value |
| --- | --- |
| Grid | Day: 52px hour rail + one column "All doctors" (min 170px). Week: 52px rail + 7 day columns (min 150px each). Rails run 9 am – 9 pm at 88px per hour (1144px tall) with half-hour and hour lines; past time shaded rgb(244 244 245 / .75) down to a 2px red now line (today only). Month: 7 equal columns (Sun–Sat), gap 4px, rows fill the height |
| Anatomy | Block: radius 8px, 1px border, 3px left edge in the status colour, status tint background, padding 4px 6px, 11px text: 18px avatar (with a 10px "P" or "L" badge) · name 11.5px/600 · 16px doctor initials disc · line break · "10:30 am · 20m" · service pill 18px · status pill 18px with a 6px dot. Height = max(22px, length × 88px/60 − 2px); blocks under 40px stay on one line; overlapping bookings split the column into lanes |
| Meta line | Tooltip "<name> · <h:mm am> · <n> min · <service> · <doctor> · <status>" (+ " · overlaps another booking" in Day view when the same doctor clashes) |
| Truncation | Name, service and status shrink with ellipsis; Month cells show as many 26px blocks as fit, then "+<n> more" |
| Actions | Click → appointment form (edit); hover 420ms → appointment card; Day view: click an empty spot → new appointment at that time rounded to 15 minutes (Week columns are not clickable); Week day header → that Day; Month cell → that Day; "+<n> more" → day popover |
| Mobile | Phone: Week not offered. Day: sticky "Doctor" strip on top (radiogroup: "All doctors" + one chip per doctor with that day's count of live bookings; counts follow the current filters, so once one doctor is picked the other chips show no count), the header row hidden, a 44px hour rail + one column, blocks padded 4px 8px with 12px text. Month: same 7-column grid. Tablet: as desktop; Week (1102px minimum) scrolls sideways |

Day header (desktop and tablet): "All doctors" 13px/600 · "<n> booked · <h> h" or "Free all day" · doctor picker (240px, 32px) labelled "All doctors" / "<name>" / "<n> doctors". Week header per day: weekday 11px · date 18px/600 (red when today) · 3px load bar (green < 55%, amber 55–84%, red ≥ 85% of chair time; tooltip "<n> booked · <p>% of chair time" + " · overlapping booking") · 6px red dot when a doctor is double-booked; past days at 45%. Month cell: date 12px (today 700, red, dark border), red dot "Overlapping booking", past days at 62%.

## Forms

### Appointment form — who and links

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | who | search input, 44px (when nobody is picked) | n/a — no visible label (aria "Search person") | "Search patient or lead by name, phone, ID" | Results from 2 characters, max 5: patients ("Patient · <care>") and leads ("Lead #<id> · <mobile>"), each with "Use contact"; "+ Create contact “<query>”" | yes | toast "Pick who the appointment is for" on save |
| 2 | who card | card (after picking) | n/a — shows the person | n/a — display | 36px avatar (sage + "P" patient, lavender lead, butter other), name 14px/600, mobile; hover → contact card with "Change" (clears) and "Edit" | n/a — display | n/a — display |
| 3 | who edit | inline row (from "Edit") | Name · Mobile | n/a — prefilled | "+91" prefix; "Save" | yes | toast "Add a name" / "Mobile needs 10 digits"; done → "Contact updated · applies everywhere" |
| 4 | new mobile | tel input with "+91" (new contact only) | n/a — aria "Mobile number" | "Mobile number" | Shown under the card for a contact created from the search text | no | max 10 |
| 5 | lead | radio list (2+ open leads) | Lead | n/a — radios | "Lead #<id>" + status pill + "<source> · <interests> · <created>" | no | one value; first lead preselected |

### Appointment form — 1 Appointment

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | type | chip group, single | Type | n/a — chips | Consultation ("First visit or doctor review") · Follow-up ("Short review after a treatment or Rx") · Treatment ("A single session, billed on the visit") · Package session ("Uses one session from a paid package") · Other ("Anything that is not one of the above"); hint line below: "Consultation fee is added to the invoice at checkout" / "Usually free · no invoice unless something is added" / "Say what it is in Notes below" / "No charge · session <n> of <m> is used when the visit is completed" | yes | Picking sets the length to the type default (20 / 15 / 60 / 45 / 30 min); a treatment or package uses its own length |
| 2 | treatment | dropdown, max 320px (Type = Treatment only) | Treatment | "Pick a treatment" | Search "Search treatments"; groups "Common" (Treatment, LHR Treatment, Peel, Hydrafacial with "<n> min") and "From offerings" (sub "<specialty> · ₹<price>") | yes (Treatment) | sets the length to its default |
| 3 | package | radio list (Type = Package session only) | Package | n/a — radios | "<package>" · "Next is session <n> of <m> · valid till <date>" · "<k> left"; none: "<name> has no active package" / "Pick a contact to see their packages" + "Book as treatment" | yes (Package session) | one active package |
| 4 | doctor | dropdown, max 380px, 36px | Doctor | "Pick a doctor" | Search "Search doctors and therapists"; Dr. Drashti · Dr. Nisha · Dr. Reenal · Dr. Karan Shah · Kiran P. · therapist; default Dr. Drashti | yes | changing it clears the picked time |
| 5 | length | chip group, single | Length | n/a — chips | 15 · 20 · 30 · 45 · 60 · 90 · 120 min, tinted in the service tone, tooltip "<n> minutes" | yes | snaps to the nearest step |
| 6 | reason | text, 36px | Reason | "What they asked for · e.g. pigmentation on cheeks" | Prefilled from the lead's last message when booked from the chat | no | max 120 |
| 7 | notes | textarea, 2 rows | Notes | "Anything the doctor or desk should know" | n/a — no help text | no | max 200 |

### Appointment form — 2 Date & time

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | quick date | chips, 24px | n/a — chips above the calendar | n/a — chips | "Today" · "Tomorrow" · "Next week" | no | picking clears the time |
| 2 | date | month calendar (210–230px), Mo–Su | n/a — calendar (aria "Calendar") | n/a — calendar | Default: today (new), the booking's date (edit), the booking's date or today if it has passed (reschedule). "‹" (disabled on the current month) "<Month YYYY>" "›"; past days disabled; today tinted sky; selected sky | yes | not in the past; picking clears the time |
| 3 | slot step | segmented radio | n/a — "Slot step" (aria) | n/a — toggle | "30 min" · "15 min" (default 30) | no | n/a — either value is valid |
| 4 | time | slot grid | "<day>" (e.g. "Tomorrow"), "Time" before a date is picked | "Pick a date to see times" | One row per hour 10 AM – 7 PM (hour + AM/PM pill), slots ":00 :30" or ":00 :15 :30 :45"; passed slots are left out; taken slots struck through and disabled (tooltip "<time> · booked", free "<time> · free"); hours with no free slot at 55%; more than 6 hours → two columns; the chosen hour's label turns solid | yes | toasts "Pick a date and time", "That time has passed · pick a future slot", "Just taken · pick another slot" |

### Appointment form — Visit status (edit only)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | status | 4 tiles, 40px, radiogroup | n/a — aria "Status" | n/a — tiles | Scheduled → Confirmed → Checked in → Completed; hint line under the strip (see Copy) | yes | Allowed tiles: date today → Scheduled, Confirmed, Checked in; other dates → Scheduled, Confirmed; after check-in → Checked in, Completed. Others at 50% with tooltip "Booked" / "They said yes" / "Available on the visit day" / "After check-in". Completed needs a patient |
| 2 | copy | button 30px | Copy | n/a — button | tooltip "Copy · same service, doctor, reason and notes" | no | n/a — action |
| 3 | cancel | button 30px, red | Cancel visit | n/a — button | tooltip "Cancel this appointment"; hidden when Cancelled or Completed | no | opens the cancel confirm |
| 4 | plan flag | pill 26px (patients, status Confirmed / Checked in / Completed) | "Plan ready · <n> offering" / "Plan ready · <n> offerings" / "Plan not prepared" | n/a — pill | Opens and scrolls to Offering suggestions | no | n/a — action |

- Error display: toasts only (above); a failed save shows "Not saved · your changes are kept" in the footer plus the shared save toast.
- Submit: primary button in the footer, 32px: "Pick a time" (no slot yet) · "Book <day>, <h:mm am>" (new) · "Move to <day>, <h:mm am>" (reschedule, or edit with a new slot) · "Save changes" (edit, same slot); 50% opacity until who, date and time are set (still clickable, then it toasts). "Cancel" before it; summary "<who> · <service> · <n> min · <doctor>" at the left.
- Loading: "Saving…" (320–740ms), "Retry save" after a failure (10% simulated).
- Success: new → toast "Booked #<id> · <day> <time> · confirm request sent on WhatsApp" (Scheduled) or "… · reminder queued"; reschedule → "#<id> moved to <day> <time> · confirm request sent"; edit, same slot → "#<id> updated". The drawer closes. Saving Checked in or Completed moves the person's open leads to Clinic visited.
- Dirty-state guard: none — "Cancel", ×, backdrop and Esc close without asking.

### Appointment filters

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | day | mini month calendar | n/a — "‹ <Month YYYY> ›" header | n/a — calendar | S M T W T F S; 32px days with 1–3 load dots (1 up to 6 bookings, 2 for 7–12, 3 above 12); past days 60%; today grey; tooltip "<YYYY-MM-DD> · <n> booked"; "Upcoming (default)" resets | no | one day |
| 2 | doctors | multi picker | APPOINTED TO | "All doctors" | Inline list: "Search team", 28px avatar, name, "Doctor", 24px checkbox; "No match" | no | any number |
| 3 | status | chips, single | STATUS | n/a — chips | All · Active (open) · Scheduled · Confirmed · Checked in · Completed · Cancelled · No show (default Active) | no | one value |
| 4 | created | preset chips + range | CREATED | n/a — chips | Any · Today · Yesterday · Last 7 days · Last 30 days · This month · Custom range ("From" / "To") | no | to ≥ from |
| 5 | follow-up | preset chips + range | FOLLOW-UP DATE | n/a — chips | Any · Overdue · Today · Tomorrow · Next 7 days · Not set · Custom range | no | to ≥ from |

- Error display: none.
- Submit: "Apply filter" (32px, primary), bottom right; the Filters button then shows a count (doctors + status other than Active + day on Agenda + created + follow-up) with a joined "×" ("Clear all filters").
- Loading: Agenda rows shimmer (160–380ms); calendar views shimmer as a page.
- Success: view refreshes; no toast.
- Dirty-state guard: none — closing without "Apply filter" drops the choices.

## Popups

### Appointment form

| Field | Value |
| --- | --- |
| Shape (desktop) | Side drawer, right, full height, modal (backdrop rgb(9 9 11 / .45) plus a 100vmax shadow); in edit mode a chat column sits to the right of the form inside the same drawer |
| Shape (mobile) | Phone: full width (390px), no chat column, field labels stack above their fields (6px gap), the floating × is off-screen (close with "Cancel"). Tablet: as desktop — create 760px; edit 560px + chat (1024: 560 + 420 = 980px; 820: 560 + 371 = 931px, wider than the window) |
| Trigger | "New appointment" (toolbar, phone pill), "book one", empty slot click, row or block click, "Open" in the appointment card, contact card "+ Appointment", lead composer "Book an appointment", "Copy", "Move to another time" / "Reschedule" |
| Size | Create: min(760px, max(560px, window − 56px)). Edit: form min(760px, max(560px, window − chat − 56px)) + chat max(360px, min(lead-chat width or 420px, min(980px, 94vw) − 400px)). At 1440: create 760px; edit 760 + 420 = 1180px |
| Dismiss | Backdrop, Esc, floating × (36px, 46px left of the panel, top 14px), "Cancel" |
| Header | 76px (60px phone): title 18px/600 "New appointment" / "Appointment #<id>" / "Reschedule #<id>"; sub "Only free slots are offered · past times are locked". Chat column header: 34px avatar, name, mobile |
| Footer | Summary (left, 13px) · "Cancel" · "Not saved · your changes are kept" (after a failure) · primary save button |
| Multi-step | Yes — see Multi-step flow |
| Initial focus | None set (the who search has no autofocus) |

### Filters popover

| Field | Value |
| --- | --- |
| Shape (desktop) | Popover under the Filters button, right-aligned, 6px gap. If it would cross the left edge it re-anchors to the button's left and shifts to stay 8px inside; it flips above when there is less room below than above (max height ≥ 200px); max width 100vw − 16px |
| Shape (mobile) | Phone: bottom sheet — fixed to the bottom, full width, max height 82%, top radius 16px, no dimming; the inner grid keeps its 250px calendar column. Tablet: as desktop |
| Trigger | "Filters" |
| Size | 560px wide; grid 250px · 1fr; gap 14px; padding 14px; radius 12px |
| Dismiss | Outside click, "Apply filter" (Esc does not close it) |
| Header | "Filters" (13.5px/600) + "Clear all" |
| Footer | "Apply filter", right, above a 1px divider |
| Multi-step | No |
| Initial focus | None |

### Appointment card (hover and quick view)

| Field | Value |
| --- | --- |
| Shape (desktop) | Hover card next to the block or row — below the trigger when 300px fit or below is roomier, else above; quick view pins it to the left of the eye button with a transparent backdrop |
| Shape (mobile) | Phone: not offered — no hover and the quick-view column is hidden; tapping opens the form. Tablet: as desktop |
| Trigger | Hover a calendar block for 420ms; eye button in an Agenda row |
| Size | 340px wide, padding 12px, max height window − 16px |
| Dismiss | Pointer leaves for 160ms (hover); backdrop click (pinned) |
| Header | 34px avatar (+ "P"), name 13.5px/600, mobile, "#<id>" on the right |
| Footer | Primary next step ("Check in" on the visit day for Scheduled or Confirmed · "Confirm" for Scheduled · "Complete" for Checked in · "Rebook" for No show) + "Open"; then the remaining moves: "Reschedule", "Cancel" and "No show" (red), "Confirmed", "Checked in" |
| Multi-step | No |
| Initial focus | None |

Body: service and status pills; "<day> · <h:mm am> · <n> min"; doctor (18px avatar + name); last update ("No update yet"); "This appointment is closed · <status>" for Cancelled and No show; a 4-step tracker Scheduled · Confirmed · Checked in · Completed (20px circles: done ✓ on the tone tint, current solid tone with the number, upcoming grey).

### Change status

| Field | Value |
| --- | --- |
| Shape (desktop) | Popover under the Status button (above when less than 260px remain), right edge aligned to the button, clamped 8px |
| Shape (mobile) | Phone: same popover on the row's status button. Tablet: as desktop |
| Trigger | Status button in an Agenda row; "Cancel" in the appointment card |
| Size | 260px, padding 8px |
| Dismiss | Outside click, Esc, picking an option |
| Header | "Now: <status>" (+ " · <reason>" when cancelled) |
| Footer | n/a — the option list ends the popover |
| Multi-step | Yes — "Cancel" opens a second view "Why is it cancelled?" with a "‹" back button |
| Initial focus | None |

Options by current status (8px dot, label, reason line): Scheduled → Confirmed · Checked in · Move to another time · Cancel · No show; Confirmed → Checked in · Move to another time · Cancel · No show; Checked in → Completed; Completed, Cancelled, No show → "Final status. Use Rebook to make a new appointment." Disabled at 45%: Checked in on another day ("Only on <day>"), No show before the start ("Available after <time> on <day>"). Cancel reasons: PATIENT — "Patient asked", "Could not reach patient"; CLINIC — "Doctor unavailable", "Machine or room unavailable", "Other". Result toast "<name> → <status>" (+ " · reminder queued" for Confirmed, " · <reason> · slot freed, reminders stopped" for Cancelled) with "Undo".

### Day doctor picker (desktop and tablet Day view)

| Field | Value |
| --- | --- |
| Shape (desktop) | Popover under the 240px picker in the Day header, right-aligned |
| Shape (mobile) | Phone: replaced by the sticky Doctor strip (chips 32px, radius 999px, 12.5px/500; selected = solid doctor tone with white text; others tone tint). Tablet: as desktop |
| Trigger | Doctor picker button |
| Size | 280px; list max height 220px |
| Dismiss | Outside click, "Done" |
| Header | Search "Search team" (34px) |
| Footer | "Show all" (left) · "Done" (primary, right) |
| Multi-step | No |
| Initial focus | None |

Rows: 28px avatar, name, "Doctor", "<n> booked" or "free", 24px checkbox.

### Month day popover

| Field | Value |
| --- | --- |
| Shape (desktop) | Popover at the cell's top-left, clamped inside the window |
| Shape (mobile) | Phone: same popover, clamped. Tablet: as desktop |
| Trigger | "+<n> more" in a Month cell |
| Size | 300px; max height min(520px, window − top − 12px) |
| Dismiss | Outside click, "×", "Open day" |
| Header | "<day> · <n> appointments" · "Open day" · "×" |
| Footer | n/a — list only |
| Multi-step | No |
| Initial focus | None |

### Cancel appointment confirm

| Field | Value |
| --- | --- |
| Shape (desktop) | Shared delete confirm from _patterns.md (480px right drawer, role alertdialog) |
| Shape (mobile) | As the shared confirm on phone |
| Trigger | "Cancel visit" in the form |
| Size | 480px |
| Dismiss | "Keep it", ×, backdrop |
| Header | "Cancel this appointment?" · grey pill "<name> · <service>" · "The slot is released and reminders stop. You can restore it until the time passes." |
| Footer | hint · "Keep it" · "Cancel" (red, disabled until a reason) |
| Multi-step | No |
| Initial focus | None |

Reasons: Patient cancelled · Rescheduling later · Doctor unavailable · Booked by mistake · Other (note required). Done → status Cancelled, toast "Appointment #<id> cancelled" + "Undo".

## Multi-step flow

### Appointment form

- Steps (ordered): who (search or card) · links (Connected lead, Lead) · [edit: Visit status] · 1 Appointment · 2 Date & time · [edit: 3 Not a patient yet, or Photos from this visit + Offering suggestions].
- **Sequence varies by input?** yes:
  - Mode New ("New appointment", slot click, contact card, lead chat): who · 1 Appointment · 2 Date & time; no status strip, no chat; saves as Scheduled.
  - Mode Reschedule ("Move to another time", "Reschedule"): title "Reschedule #<id>"; who prefilled; 1 and 2 prefilled; no status strip, no chat; saves as Scheduled with a "Moved" badge and a Confirm task.
  - Mode Edit (row, block, "Open"): title "Appointment #<id>"; Visit status section above the steps; chat column on desktop and tablet; patient-only sections below.
  - Copy (edit): opens a New form with the same person, service, doctor, length, reason and notes, date today, no time; toast "Copied · pick a date and time".
  - Opened from the lead chat ("Book an appointment"), Copy, an "Appointment #…" chat pill or a Task: step 1 starts collapsed (summary shown), Date & time open.
  - Who = patient: no extra card; edit adds "Photos from this visit" and "Offering suggestions" (unless Cancelled); plan flag when Confirmed, Checked in or Completed; Completed allowed.
  - Who has lead records (patients included): "Connected lead" chips "#<id> · <status>" under the card (tooltip "Lead #<id> · <source> · owner <name>", click opens the lead drawer) + " · moves to Clinic visited at check-in" while a lead is still open and the visit is not checked in; "Lead" radio list when 2+ open leads are not linked to a patient.
  - Who = lead (not a patient): edit adds step 3 "Not a patient yet" (unless Cancelled); the Completed tile is blocked.
  - Who = new contact ("+ Create contact “<query>”"): sub "New contact · add mobile at check-in"; "+91 Mobile number" field under the card; New mode only.
  - Who = contact (no lead, not a patient): butter avatar; edit adds step 3; in edit its chat column reads "Contact · chat only · no lead" (a patient without a lead: "Patient · chat only · no lead").
  - Status Checked in or Completed: step 1 collapses to its summary; step 2 shows "Locked" and the summary "<day> · <time> · locked after check-in"; tapping it toasts "Date & time are locked once the patient is checked in"; Photos unlock.
  - Status Scheduled or Confirmed and the date or time changed (edit): status returns to Scheduled and a note appears: "Rescheduled · was <day> <time> · needs confirming again · a new reminder goes out on save" (was Confirmed) or "Rescheduled · was <day> <time> · a new reminder goes out on save" (was Scheduled); picking the original slot restores the status and removes the note.
  - Status Cancelled: red banner "Cancelled" + "<reason> · slot released · reminders stopped" + "Restore" (back to Scheduled, toast "Appointment restored · reminder goes out again"); the tiles go inert at 45%; "Cancel visit" hidden; patient sections and step 3 hidden.
  - Completed picked for a non-patient: toast "Create the patient record first · Completed needs a patient" (its action button reads "Undo" and opens the patient form).
- Progress indicator: 24px numbered circles — open dark, filled green (1: service, doctor and length set; 2: date and time set), else grey; the Visit status tiles — current: solid tone (Scheduled stone, Confirmed sky, Checked in mint, Completed sage) with white text and a white disc; done: tone tint with a ✓ disc; upcoming: white with a numbered ring.
- Navigation: step 1 toggles open and closed (hint "Open" when closed); step 2 is always open; no Next buttons.
- Per-step validation: none while editing; save checks who, date and time, a future slot, a free slot.
- Edit mode: prefilled; same steps plus the Visit status section and the patient-only sections.

### Step 3 · Not a patient yet (edit, non-patient)

- Steps (ordered): one amber card — "3" · "Not a patient yet" · "Create the patient record to continue · unlocks photos, offering suggestions, feedback and Completed" · "Create patient record".
- **Sequence varies by input?** yes — only when the person has no patient record and the visit is not Cancelled; after the patient form saves: toast "<name> is now a patient · you can mark Completed", the card disappears and the patient sections appear.
- Progress indicator: amber "3" circle.
- Navigation: "Create patient record" opens the New patient drawer (mobile, type and reason prefilled).
- Per-step validation: n/a — single button.
- Edit mode: n/a — edit-only card.

### Photos from this visit (edit, patient)

- Steps (ordered): locked → open.
- **Sequence varies by input?** yes — status before Checked in: "Photos open once the patient is at the clinic · check them in first" + "Check in now" (sets the form's status to Checked in); Checked in or Completed: album switch General · Private · LHR, "Upload photos", drop zone, tiles (min 110px, square) with album tag, name, "Edit details" (pencil) and "Delete photo" (trash), plus an "Add" tile.
- Progress indicator: sub line "<n> photo · they show in <first>’s file under this visit" / "<n> photos · …" or "Take before / after photos while <first> is at the clinic · they file under this visit".
- Navigation: tile opens the patient file's Images on that photo; uploads up to 15 MB each, toast "<n> photo attached to this visit" / "<n> photos attached to this visit".
- Per-step validation: images only; files over 15 MB skipped ("<n> file(s) over 15 MB skipped").
- Edit mode: n/a — edit-only card.

Offering suggestions (edit, patient, not Cancelled) is the shared card specified in patient-file.md (open by default here): header "Offering suggestions" + "<n> suggested · <n> accepted" (+ " · <n> past purchases") or "Nothing suggested yet", total + eye price toggle ("Show prices" / "Hide prices"), Suggested rows, ideas ("+ Add"), "Add offering", "<first>’s last purchases" and "Contact activity" with "Open chat"; empty "Nothing suggested for <first> yet."; rows wrap to two lines when the card is under 600px wide, purchase and activity rows under 720px.

## Preview / animated panels

| Field | Value |
| --- | --- |
| Surfaces | 4 views — Agenda, Day, Week, Month |
| Switching | Tabs "Agenda" · "Day" · "Week" · "Month"; also Week day header → Day, Month cell → Day, "Open day" → Day |
| Surface per input type | Desktop and tablet: all four. Phone: Agenda, Day, Month (Week removed). Day on phone: Doctor strip instead of the header picker |
| Frame sequence | Switching views swaps the content at once. Agenda rows shimmer (text → grey bars) after a view, search, sort, day or filter change; Day, Week and Month shimmer only after "Apply filter" |
| Frame durations | Agenda rows 160–380ms; Day / Week / Month 260–560ms; +280–600ms on 10% of loads |
| Progressive reveal | None — the whole view swaps at once; shimmer lifts everywhere at the same moment |
| Static fallback | Reduced motion: the shimmer does not animate |

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Section (nav, tab bar) | calendar | 16 | no |
| Search | search | 15 | no |
| New appointment | plus | 16 | no |
| Filters | list-filter | 15 | no |
| Sort | arrow-up-down / arrow-up / arrow-down | 12 | no |
| Pickers, status button | chevron-down (2px stroke) | 14 | no |
| Quick view | eye | 15 | yes (aria "Quick view") |
| Period arrows | "‹" "›" text glyphs | 15 | yes (aria "Previous day" / "Next day", week, month) |
| Copy | copy | 13 | no |
| Cancel visit | circle-x | 13 | no |
| Rescheduled note | calendar | 13 | no |
| Plan ready / Plan not prepared | circle-check / info | 13 | no |
| Photos card | camera | 15 | no |
| Upload photos, Add tile | camera | 13 | no |
| Photo placeholder | image | 20 | no |
| Photo edit / delete | pencil / trash | 12 | yes (aria "Edit details", "Delete photo") |
| Offering suggestions | info, link, trash, plus, sparkles, eye / eye-off | 13–14 | yes on buttons |
| Chat column | as the lead composer: `wa`, `insta` (brand glyphs, not Lucide), phone, pencil, sparkles, calendar, send | 13–15 | yes on mode tabs |
| Close | "×" text glyph | 18 | yes (aria "Close") |

Library: Lucide (inline SVG) · Weight: regular, 1.6px stroke (picker chevrons 2px)

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Form panel | transform translate3d(100%, 0, 0) → 0 | 340ms | cubic-bezier(.32,.72,0,1) |
| Form backdrop | background-color transparent → rgb(9 9 11 / .45) | 340ms | cubic-bezier(.32,.72,0,1) |
| Floating × | opacity, scale .9 → 1, after 200ms | 200ms | cubic-bezier(.2,.8,.2,1) |
| Step 1 body | opacity 0 → 1, translateY −4px → 0 | 240ms | cubic-bezier(.2,.8,.2,1) |
| Filters, appointment card, change status, day popover | opacity, translateY −4px → 0, scale .985 → 1 | 160ms | cubic-bezier(.2,.8,.2,1) |
| Phone bottom sheets (filters, dropdowns) | translateY 28px → 0, opacity 0 → 1 | 260ms | cubic-bezier(.32,.72,0,1) |
| Status tiles | background, border-color | 150ms | ease |
| View tabs | background, color | 150ms | ease |
| Chevrons | transform rotate 0 → 180deg | 150ms | ease |
| Appointment card | delay before showing / hiding | 420ms / 160ms | n/a — delay |
| Shimmer | background-position | 1100ms loop | ease |

Reduced-motion: every animation and transition runs 1ms with no delay and one iteration (shimmer stops), no smooth scrolling.

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Agenda | Rows stay; text becomes shimmering bars, clicks blocked, 160–380ms | "No appointments here · book one" ("book one" opens a new appointment) | Toast "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" (9s, ~5%) |
| Agenda end | n/a — nothing loads at the end | "All appointments loaded" | n/a — no paging |
| Day | Shimmer over the grid text for 260–560ms after "Apply filter" | Header "Free all day"; empty grid; phone strip chips without counts | Same toast + "Retry" |
| Week / Month | Shimmer over the grid text for 260–560ms after "Apply filter" | Empty columns or cells | Same toast + "Retry" |
| Form open | Body text becomes shimmer bars for 200–440ms | n/a — always has fields | n/a — no load error |
| Who search | n/a — local | Under 2 characters nothing shows; no match → only "+ Create contact “<query>”" | n/a — local |
| Time slots | n/a — local | "Pick a date to see times"; a full day shows struck-through slots at 55% | n/a — local |
| Package | n/a — local | "<name> has no active package" + "Book as treatment" | n/a — local |
| Form save | "Saving…" | n/a — form | Footer "Not saved · your changes are kept" + "Retry save" + toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" |
| Photos | Shared upload tray: per-file progress, removed 1.4s after each file finishes | "Take before / after photos while <first> is at the clinic · they file under this visit" + "Add" tile | "<n> file(s) over 15 MB skipped" |
| Offering suggestions | n/a — local | "Nothing suggested for <first> yet." | n/a — local |
| Chat column | n/a — local | "No conversation yet" + starters (as Leads) | "Not sent" + "Retry" |

## Copy

| Key | Exact string |
| --- | --- |
| title | "Appointments" |
| views | "Agenda", "Day", "Week", "Month" |
| today button | "Today", "This week", "This month"; tooltip "Jump to the current day" / "… week" / "… month" |
| period | "<Sat 3 Oct 2026>" (Day), "<27 Sep – 3 Oct>" (Week), "<October 2026>" (Month); "Previous day", "Next day", "Previous week", "Next week", "Previous month", "Next month" |
| search | "Patient, phone or #ID" |
| primary | "New appointment" |
| agenda header | "Time", "Contact", "Service", "Appointed to", "Latest update", "Status" |
| agenda empty | "No appointments here · ", "book one" |
| agenda end | "All appointments loaded" |
| group header | "Today", "Tomorrow", "In <n> days", "Next week", "In <n> weeks", "Yesterday", "<n> days ago", "<n> confirmed", "<n> awaiting reply", "· all set", "<n> confirmed · <n> waiting for a reply" |
| update pills | "✓ Plan ready", "○ Plan pending", "✓ Reminder read", "✓ Reminder delivered", "✓ Reminder sent", "✓ Replied Yes", "✓ Moved", "✓ Moved ×<n>", "✓ Checked in" |
| update tooltips | "<n> in offering suggestions", "Open the appointment and add the offering suggestions", "Reminder read on WhatsApp", "Reminder delivered", "Reminder sent", "Confirmed automatically from a WhatsApp Yes", "Moved from <day> <time>", "Patient checked in" |
| statuses | "Scheduled", "Confirmed", "Checked in", "Completed", "Cancelled", "No show" |
| day view | "All doctors", "<n> booked · <h> h", "Free all day", "<n> doctors", "Click an empty slot to book", "New appointment · <day> · <time>", "Past dates can’t be booked" |
| day picker | "Search team", "Doctor", "<n> booked", "free", "Show all", "Done" |
| doctor strip | "All doctors", "Dr Drashti", "Dr Nisha", "Dr Reenal", "Dr Karan Shah", "Kiran P. · therapist" |
| week / month | "<n> booked · <p>% of chair time", " · overlapping booking", "Overlapping booking", "Sun" … "Sat", "+<n> more", "<day> · <n> appointments", "Open day" |
| block tooltip | "<name> · <time> · <n> min · <service> · <doctor> · <status>", " · overlaps another booking" |
| filters | "Filters", "Clear all", "Previous month", "Next month", "Upcoming (default)", "APPOINTED TO", "All doctors", "<n> doctors", "Search team", "No match", "STATUS", "All", "Active (open)", "CREATED", "FOLLOW-UP DATE", "From", "To", "Apply filter", "Clear all filters" |
| appointment card | "#<id>", "<day> · <time> · <n> min", "No update yet", "This appointment is closed · <status>", "Check in", "Confirm", "Complete", "Rebook", "Open", "Reschedule", "Cancel", "No show", "Quick view" |
| change status | "Now: ", "Move to another time", "Cancel", "Why is it cancelled?", "Back", "PATIENT", "CLINIC", "Patient asked", "Could not reach patient", "Doctor unavailable", "Machine or room unavailable", "Other", "Final status. Use Rebook to make a new appointment.", "Only on <day>", "Available after <time> on <day>" |
| status reasons | Scheduled "Slot held · confirm request sent on WhatsApp"; Confirmed "They said yes · a Yes reply on WhatsApp sets this automatically"; Checked in "They have arrived · only on the day"; Completed "Visit done · usually set from the visit"; Move "Move to a new slot · same appointment, old slot kept in history"; Cancel "Frees the slot and stops reminders"; No show "Only after the start time has passed" |
| status toasts | "<name> → <status>", " · reminder queued", " · <reason> · slot freed, reminders stopped" |
| form titles | "New appointment", "Appointment #<id>", "Reschedule #<id>", "Only free slots are offered · past times are locked" |
| who | "Search patient or lead by name, phone, ID", "Use contact", "+ Create contact “<query>”", "New contact · add mobile at check-in", "Mobile number", "Name", "Mobile", "Save", "Add a name", "Mobile needs 10 digits", "Contact updated · applies everywhere" |
| links | "Connected lead", "#<id> · <status>", "Lead #<id> · <source> · owner <name>", "· moves to Clinic visited at check-in", "LEAD", "Lead #<id>" |
| visit status | "Scheduled", "Confirmed", "Checked in", "Completed", "Booked", "They said yes", "Available on the visit day", "After check-in", "Create the patient record first", "Copy", "Copy · same service, doctor, reason and notes", "Cancel visit", "Cancel this appointment", "Plan ready · <n> offering", "Plan ready · <n> offerings", "Plan not prepared", "<n> planned for this visit · <n> from earlier visits · open suggestions", "Nothing suggested yet · open Offering suggestions to prepare" |
| status hints | Scheduled "Slot held · WhatsApp asks them to confirm, a Yes reply confirms it"; Confirmed "Already confirmed on a call · reminder goes out"; Checked in "Patient is at the clinic · doctor queue notified · mark Completed when done"; Completed "Visit done · a feedback task goes out tomorrow"; non-patient after check-in "Create the patient record to complete this visit"; Cancelled "Restore to bring it back · the slot is free for others meanwhile" |
| reschedule | "Rescheduled · was <day> <time> · needs confirming again · a new reminder goes out on save", "Rescheduled · was <day> <time> · a new reminder goes out on save" |
| cancel | "Cancelled", "<reason> · slot released · reminders stopped", "Restore", "Cancel this appointment?", "The slot is released and reminders stop. You can restore it until the time passes.", "Patient cancelled", "Rescheduling later", "Booked by mistake", "Keep it", "Appointment #<id> cancelled", "Appointment restored · reminder goes out again" |
| step 1 | "Appointment", "Not filled yet", "Open", "Type", "Treatment", "Package", "Doctor", "Length", "Reason", "Notes", "Pick a treatment", "Search treatments", "Common", "From offerings", "Pick a doctor", "Search doctors and therapists", "What they asked for · e.g. pigmentation on cheeks", "Anything the doctor or desk should know" |
| types | "Consultation", "Follow-up", "Treatment", "Package session", "Other", "First visit or doctor review", "Short review after a treatment or Rx", "A single session, billed on the visit", "Uses one session from a paid package", "Anything that is not one of the above" |
| type hints | "Consultation fee is added to the invoice at checkout", "Usually free · no invoice unless something is added", "Say what it is in Notes below", "No charge · session <n> of <m> is used when the visit is completed" |
| package | "Next is session <n> of <m> · valid till <date>", "<k> left", "<name> has no active package", "Pick a contact to see their packages", "Book as treatment" |
| step 2 | "Date & time", "Today", "Tomorrow", "Next week", "Mo" … "Su", "30 min", "15 min", "Time", "Pick a date to see times", "AM", "PM", "<time> · free", "<time> · booked", "Locked", "<day> · <time> · locked after check-in", "Date & time are locked once the patient is checked in" |
| step 3 | "Not a patient yet", "Create the patient record to continue · unlocks photos, offering suggestions, feedback and Completed", "Create patient record", "<name> is now a patient · you can mark Completed", "Create the patient record first · Completed needs a patient" |
| photos | "Photos from this visit", "Photos open once the patient is at the clinic · check them in first", "Check in now", "General", "Private", "LHR", "Upload photos", "Add", "Edit details", "Delete photo", "<n> photo · they show in <first>’s file under this visit", "<n> photos · they show in <first>’s file under this visit", "Take before / after photos while <first> is at the clinic · they file under this visit", "<n> photo attached to this visit", "<n> photos attached to this visit", "<n> file(s) over 15 MB skipped" |
| suggestions | "Offering suggestions", "Nothing suggested yet", "Nothing suggested for <first> yet.", "Add offering", "Show prices", "Hide prices", "<first>’s last purchases", "Contact activity", "Open chat" |
| footer | "Cancel", "Pick a time", "Book <day>, <time>", "Move to <day>, <time>", "Save changes", "Saving…", "Retry save", "Not saved · your changes are kept" |
| validation toasts | "Pick who the appointment is for", "Pick a date and time", "That time has passed · pick a future slot", "Just taken · pick another slot" |
| success toasts | "Booked #<id> · <day> <time> · confirm request sent on WhatsApp", "Booked #<id> · <day> <time> · reminder queued", "#<id> moved to <day> <time> · confirm request sent", "#<id> updated", "Copied · pick a date and time" |
| chat column | "Patient · chat only · no lead", "Contact · chat only · no lead", "Lead created · <created> · via <source>" (other strings as Leads) |
