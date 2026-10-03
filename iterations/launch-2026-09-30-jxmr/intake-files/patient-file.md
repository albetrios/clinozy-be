# Screen: Patient file

- Route: /patients/:patientId/:section — section ∈ clinical notes (default), visits, prescriptions, treatments, photos, reports, invoices, payments, packages, team notes
- Purpose: Everything about one patient — clinical notes, visits, prescriptions, treatments, photos, reports, billing, packages, team notes, the live visit and the patient's conversation.
- Entry points: Patients row click and ⌘K patient result (both open Clinical notes with Activity open on desktop/tablet, closed on phone); any patient name link that opens a patient by name (contact card name, Today cards, task drawer, lead "Open patient", appointment photos) — these open with Activity in whatever state it was last left
- Exit points: "Back to patients" / "Patients" breadcrumb → Patients list; Prescription, Treatment, Upload report, Add package, Edit patient (see patients.md), Visit/Aftercare check-in, Log a review, Log feedback, Photo details, Report view, Print preview drawers; invoice, receive-payment and give-back drawers (see payments.md); appointment form (see appointments.md); Medical sale drawer from "Sell medicines" (see medical.md); "Open chat" → Leads
- Access: view — Admin, Doctor, Front desk, Counsellor, Pharmacist, Therapist (Accountant has no access to Patients); create and edit — the same roles except Therapist; delete — Admin only. Without create the split "New …" buttons and the empty Photos "Upload images" button are hidden (the + "Add to record" button stays); without edit row "Edit" actions are removed and drawers open read-only with the footer line "View only · your role can’t change this"; without delete every Delete / Remove action is removed
- Layout shell: app shell
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: sage (section tabs and tiles use their own tones: Clinical notes blush, Visits sky, Prescriptions sage, Treatments lav, Photos blush, Reports mint, Invoices peach, Payments peach, Packages mint, Team notes lav).

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| File bar | Back · breadcrumb or identity · "Visit in progress · Resume" pill (during a visit, on any other section) · section popover button · pinned section tabs · "Add to record" (+) · "Start visit" · "Activity" toggle | one row, no wrap, gap 10px, padding 16px 20px (12px 12px under 1440px wide or 800px tall). Back 36px; then "Patients / Dharti Galani" (20px/600, "Patients" in z500 links back, h1 ellipsis) while the rail shows, otherwise an identity block (32px sage avatar, name 14px/600, "#3508 · +91 ••••• •3212" 11.5px). Folder button 32px with a hairline after it; tabs fill the rest and scroll sideways (no scrollbar). Right cluster, gap 8px: + (36px square), "Start visit" (36px dark, play icon; hidden during a visit), "Activity" (36px, panel icon + label; sage-tinted while open; green unread count badge while closed) | Phone: re-grids to 3 columns (auto · 1fr · auto, gap 8px, padding 8px 12px). Row 1: Back · name (14px/600) over "#3508 · +91 ••••• •3212" (11.5px), both ellipsised — the 32px avatar and the breadcrumb are hidden · right cluster: + (36px), "Start visit" (36px, padding 0 10px 0 8px, keeps its label), "Activity" icon-only (36×36, label hidden, unread badge pinned −4px top-right). Row 2 (full width): folder button (32px) + section tabs, which scroll sideways. The "Visit in progress · Resume" pill drops to a third row in the first column. Tablet: as desktop; below 1000px wide (and up to 1279px while Activity is open) the identity block replaces the breadcrumb | Esc closes the section popover |
| Body grid | main card · Activity column | grid filling the rest of the height inside margins 0 20px 20px (0 12px 12px compact), gap 12px: main card alone, or main card + Activity column (420px at 1024 and up; 371px at 820; formula max(360, min(420, round(min(980, width × .94)) − 400))) | Phone: one column, gap 0, margin 0; cards lose radius, side borders and shadow. The Activity column exists only from 760px wide: on phone, opening Activity hides the main card and the panel takes the whole body; the file bar stays. Tablet: two columns while Activity is open | Activity opens by default from the list and ⌘K on desktop/tablet, never on phone |
| Main card | rail (288px) · content column | radius 12px, 1px divider, shadow 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px −8px rgb(0 0 0 / .06); rail shown when the window is ≥1000px wide and Activity is closed, or ≥1280px wide with Activity open | Phone: rail never shows (window < 1000px); content only, one column. Tablet: rail hidden at 820; at 1024 shown only while Activity is closed | the content column holds the section header and the section content |
| Rail · identity (fixed) | 48px sage avatar with a 16px "P" badge · name 16px/600 · "#3508" (copies) · "45 days as patient" · type and status badges (22px) · Edit contact (pencil, 28px) | top of the rail, padding 18px 12px 18px 18px, background oklch(0.975 0.012 150), 1px divider below | Phone: not shown (rail hidden). Tablet: shown only when the rail shows | "#3508" tooltip "Copy patient ID" |
| Rail · Reach and About (scrolls) | Reach: one 6px-padded row per number / handle (32px tinted icon tile, masked value 13.5px/600, label 11px, eye, open-in links, copy) · About: Gender · Age, date of birth with birthday chip, language, address, consent pills | scrolls between the fixed identity and Up next; sections padded 16px 20px 8px and 14px 20px 16px (16px compact sides) | Phone: not shown. Tablet: with the rail | numbers stay masked "•••• 3212" until the eye is pressed |
| Rail · Up next (fixed) | "Up next" · next-visit card (44px sky date tile, "Today · 11:00 am", "Hydrafacial · 45 min", "Reschedule"/"Book") · due card ("₹ ••••" with eye, "since 12 days", dark "Collect") or "All paid · nothing due" · credit card ("₹500 to return", "Give back") · Feedback row | bottom of the rail, padding 12px 14px 14px, z50, hairline above; cards radius 12px, 8px padding | Phone: not shown. Tablet: with the rail | "Collect" opens receive-payment; "Give back" opens the give-back drawer (see payments.md); the Feedback row opens Clinical notes with Feedback expanded |
| Section header | section title (16px/600) · Columns eye (tables only) · split "New …" button with ⌄ | 50px tall, padding 14px 20px 0 (16px compact) | Phone: padding 14px 14px 0; Columns hidden; the split button stays in the header (it does not become a floating button). Tablet: as desktop | hidden while the visit flow is showing |
| Section content | the open section (see Data display) | fills the content column, scrolls on its own | Phone: one column, 14px side padding; see each section's Mobile entry | each section keeps its own scroll; switching sections shows a skeleton |
| Activity column | the patient's conversation and activity (same component as the Leads chat, see leads.md): header (34px avatar with "P", name, phone) · messages (newest at the bottom, system pills for visits, Rx, treatments, invoices, payments, photos, notes with ₹ amounts masked) · "Send via" channel tabs · composer | own card, radius 12px; header 76px; channel tabs show icons only (the column is narrower than 460px) | Phone: closed by default; when opened it replaces the content (full width, no radius, header 60px) and stays in front even when a section tab is picked; close it with the Activity button. Tablet: a side column (371px at 820, 420px at 1024) | composer, channel tabs and messages are specified in leads.md |
| Floating layers | section popover · Add-to-record menu · drawers · photo viewer · delete confirm · upload tray · toasts | anchored popovers, right-edge drawers, full-screen viewer | Phone: section popover becomes a bottom sheet, drawers go full width (the delete confirm stays a 334px side drawer), dropdown pickers become bottom sheets, the Add-to-record menu stays a popover, toasts sit 76px + safe area above the bottom | see Popups |

Not reachable in this prototype: an "Overview" section (a bento of Clinical, Visits, Photos, Packages, Prescriptions, Treatments, Billing, Reports and Team notes cards) exists in the markup, but no tab, tile or link opens it — opening a patient lands on Clinical notes.

## Data display

Primitive: mixed — tables for Visits, Prescriptions, Treatments, Reports, Invoices and Payments; cards for Clinical notes, Photos, Packages and Feedback; a list for Team notes; a step list for the visit flow.

### Section tables (Visits, Prescriptions, Treatments, Reports, Invoices, Payments)

| Field | Value |
| --- | --- |
| Columns (ordered) | Visits: ID · When · Offering (badge) · Doctor (avatar chip + name) · Status (badge with dot: Scheduled butter, Confirmed sky, Checked in lav, Completed sage, Cancelled stone, No show blush). Prescriptions: ID · Date · Medicines ("Flubolt 400, Clonix-B Lotion" over "0-0-1 · After meal \| Morning & night") · Notes (hidden by default) · Doctor · Updated (hidden by default) · actions. Treatments: ID · Treatment (name over template "Skin · laser") · Area (sky badges; dental shows "#11") · Team (hidden by default) · Session ("#1" butter) · Details (hidden by default, e.g. "Laser · Soprano Ice · 10 J · 3 Hz · 810 nm") · Feedback ("Better · 7/10" in the feel colour, or butter "Call next day" / "Call in 2 days", or "—") · Date · actions. Reports: Report (name over "PDF · shared with patient on request") · Type (Lab mint, Scan sky, Consent lav, Other stone) · Date · Uploaded by · actions. Invoices: Invoice ("#1042" grey + type badge) · Items (names over remark or "2 items") · Team (hidden by default) · Bill (right, 600) · Paid / due (right, "₹2,000" over "₹1,500 due" blush or "Nothing due" sage) · Status (badge with dot) · Date · actions. Payments: Receipt ("TX-5600") · When · Invoice ("#1042") · Mode (badge) · Amount (right, 600, "+ ₹2,000" sage or "− ₹500" blush) · By |
| Column widths | Visits 80px 180px minmax(160px,1fr) 180px 130px (min 760px). Prescriptions 70px 110px minmax(240px,2fr) minmax(140px,1fr) minmax(120px,.8fr) 150px + actions (min 1100px). Treatments 70px minmax(180px,1.3fr) minmax(110px,.9fr) 90px 80px minmax(200px,1.5fr) 150px 160px + actions (min 1330px). Reports minmax(220px,2fr) 110px 130px 180px + actions (min 760px). Invoices 150px minmax(200px,1.5fr) 90px 100px 130px 110px 90px + actions (min 1120px). Payments 110px 150px 110px 110px 120px minmax(140px,1fr) (min 760px). A 24px checkbox column leads every table; the actions track widens to fit its icon buttons |
| Sortable | no — section tables have no sortable headers |
| Row height | as the Patients list: padding 10px 20px 10px 17px (10px 16px 10px 13px compact) plus a 3px left bar (Visits and Invoices: status ink; Payments: blush for refunds; others transparent); header 40px |
| Row click | Prescriptions → Edit prescription drawer; Treatments → Edit treatment drawer; Invoices → invoice drawer (see payments.md); Visits, Reports, Payments → nothing |
| Row actions | always-visible 32px icon buttons with tooltips, Delete last after a 1px divider in red tints. Prescriptions: Print (printer) · Preview (eye, opens Print preview) · Copy prescription (copy, toast "Prescription copied") · Sell medicines (receipt, opens the Medical sale drawer prefilled) · Edit · Delete. Treatments: Check-in (message-square, opens Aftercare check-in) · Copy as next session (copy, toast "Session 2 added") · Edit · Delete. Reports: Open (file, opens Report view) · Delete. Invoices: Print · Preview · Copy invoice · Record payment (wallet) · Edit · Delete. Visits, Payments: none. Delete opens the delete confirm ("Delete this prescription?", "Delete this treatment?", "Delete this report?", "Delete this invoice?"); toasts "Prescription deleted", "Treatment deleted", "Report deleted", each with "Undo" |
| Selection | as the Patients list: hover checkbox, tri-state header, shift-range, dark bulk bar with Export and Print ("N rows exported as CSV", "Preparing N rows for print") |
| Mobile behaviour | Phone: rows, not cards — header, footer and checkboxes hidden; each row wraps with the primary cell on the left, one key column right-aligned (max 46%), up to 4 other values folded under the primary cell as "● Label value" (empty values and "—" dropped), and actions on their own right-aligned line (buttons ≥40×36). Key column per table: Visits — primary When, key Offering, fold "● Status Scheduled", "#2847". Prescriptions — primary Date, key Medicines, fold "#500". Treatments — primary Treatment, key Area, fold "● Session #1", "● Feedback Better · 7/10", "Date 27 Sep 2026 · 12:30", "#505". Reports — primary Report, key Type, fold "Date 20 Sep 2026". Invoices — primary Items, key Bill, fold "Paid / due ₹2,000", "● Invoice #1042, Clinic", "● Status Partly paid", "Date 24 Sep". Payments — primary When, key Amount, fold "● Mode UPI", "TX-5600", "#1042". Tablet: collapse — columns that don't fit the content width fold into the primary cell (drop order: ID columns first, then Updated / By / Team / Details / Notes, then the other columns right to left, right-aligned money last); footer "N columns in rows · Show all" ↔ "Fit to width" |
| Pagination | one scroll per table; end line "All appointments loaded" / "All prescriptions loaded" / "All treatments loaded" / "All reports loaded" / "All invoices loaded" / "All transactions loaded"; footer count "3 appointments", "2 prescriptions", "3 treatments", "2 reports", "2 invoices · ₹1,500 due", "3 transactions" |

### Clinical notes (default section)

| Field | Value |
| --- | --- |
| Grid | 12-column grid, gap 10px, padding 12px 20px 20px (16px compact, 14px phone). Four chip cards span 12 columns below 620px of content width, 6 from 620px, 3 from 980px; then the Offering suggestions card and the Feedback card, each full width, 10px apart |
| Anatomy | chip card (padding 12px, radius 12px, gap 8px): 8px dot + title 13.5px/600 (Complaints blush, Diagnosis lav, Treatment suggestions sage, Future suggestions sky) + dark "1 new" pill (18px, tooltip "Added since the last visit") · chips (min 28px tall, radius 14px, 12.5px/500, tinted, a × 20px "Remove …"; chips added since the last visit carry a 1.5px ring) · dashed 32px input "Type and press Enter to add" (≤60 chars). Offering suggestions card (collapsed by default): header button "Offering suggestions" + subline + chevron; when open, total (15px/600, "₹ ••••" while prices are hidden) + "Prices hidden" + 32px eye; rows on a 6-track grid minmax(0,1fr) 92px 112px 128px 28px 64px: tone dot + name + info · quantity stepper (92×30, − / +) · price (112×30 input, or dashed "₹ ••••") · status pill (30px: Planned sky clock, Accepted sage circle-check, Next time butter calendar, Declined stone x; or green "✓ Invoiced") · 26px "by" avatar · link-invoice (28px) + remove (28px). Idea rows (z50): sparkles tile, name, "—", list price, dashed "Idea" pill, "+ Add". Then a dashed "Add offering" button; "Dharti’s last purchases · 4 lines · ₹6,300 paid so far" table (Date · Bought · Qty · Paid · Sessions with a 64px progress bar "1 of 7 used" · Invoice pill + status pill); "Contact activity · Lead #2363 · Clinic visited" with "Open chat" and a table (When · Channel · Message with "Sent"/"Got" tag · Status). Feedback card (collapsed by default): header with 32px tile, "Feedback", "1 check-in · 1 review", chevron, dark "Log feedback ⌄"; when open, type chips, then a sideways carousel of 236px-tall cards with round 36px ‹ › arrows |
| Meta line | chip cards: none. Offering suggestion info tooltip: "Package · 7 sessions · List ₹4,800 · Unwanted facial hair · wants a package". Feedback card footer: "24 Sep" · by chip (20px initials + the first word of the name, e.g. "Riya") |
| Truncation | names and sublines one line with ellipsis; chip text wraps anywhere inside the chip; feedback quote clamped to 2 lines |
| Actions | Enter adds a chip; × removes it (no confirm). Suggestions: − / + quantity, type a final price, status dropdown, link an invoice by hand, Remove (confirm "Remove this record?" with reasons "Added by mistake" · "Duplicate" · "Plan changed" · "Other"). Feedback: Edit / Remove per card, "Log action ⌄" on cards that need action, "Load more" adds 6 |
| Mobile | Phone: chip cards stack one per row; suggestion rows switch to two lines below 600px of card width (name + actions, then quantity · price · status · by) with the header row hidden; purchases and activity tables switch to 3-column rows below 720px; the Feedback carousel shows 2 cards per view (3 from 760px of card width). Tablet: the chip-card count follows the content width — 1 per row at 820 and 1024 while Activity is open, 2 per row with it closed. Desktop 1440: 2 per row with Activity open (rail + Activity leave ≈640px), 4 per row with it closed |

### Photos

| Field | Value |
| --- | --- |
| Grid | toolbar row (album tabs General / Private / LHR with icons · "3 photos" · "All photos ⌄" visit filter · spacer · S / M / L size radios), then groups by date; each group a grid repeat(auto-fill, minmax(tile, 1fr)) — S 110px tiles gap 6px, M 160px gap 10px (default), L 230px gap 12px; padding 12px 20px 20px |
| Anatomy | group header: date 13px/600 ("24 Sep" or "Today") + "3 photos · 24 Sep · Hydrafacial" 12px. Tile: square, radius 10px, z100 behind the image (contain-cover), body-part pill top-left (20px, tinted), bottom bar on a dark gradient with name (12px/600 at M) and date (10.5px), plus Edit (pencil) and Delete (trash) 26px buttons at M and L only |
| Meta line | "<name>" over "24 Sep" |
| Truncation | name one line with ellipsis |
| Actions | tile click opens the photo viewer; Edit opens Photo details; Delete opens the delete confirm ("Delete this photo?", reasons "Wrong patient" · "Blurry / retake" · "Duplicate" · "Other"; toast "Photo deleted" with "Undo"); drag files onto the section to upload (2px dashed outline inset 8px while dragging); 12 per album, then "Load more · 4 left" adds 12 |
| Mobile | Phone: toolbar wraps; at M two tiles per row (three at S, one at L); the tile bar is always visible on touch screens (it fades in on hover only where hover exists). Tablet: as desktop, more tiles per row |

### Packages

| Field | Value |
| --- | --- |
| Grid | repeat(auto-fill, minmax(280px, 1fr)), gap 12px, padding 12px 20px 20px |
| Anatomy | card (padding 14px, radius 12px, gap 10px): package name pill (24px, offering tone) · "6 left" 18px/600 with "1 of 7 used" 12px on the right · 6px progress bar in the tone ink · "Valid till 24 Sep 2027 · Next: 8 Oct" 12px · two 32px buttons "Use a session" (dark) and "Book next" (outline) |
| Meta line | "Valid till 24 Sep 2027 · Next: 8 Oct" |
| Truncation | package name one line with ellipsis |
| Actions | "Use a session" → toast "Session 2 of 7 used" ("No sessions left" when none); "Book next" → appointment form for this patient |
| Mobile | Phone: one card per row. Tablet: two per row when the content is ≥572px wide |

### Team notes

| Field | Value |
| --- | --- |
| Grid | single column, max 760px, gap 10px, padding 12px 20px 20px; composer on top |
| Anatomy | composer: textarea (2 rows, ≤500 chars, "Add a note for the team") + dark 36px "Add note". Note card (padding 12px, radius 12px): 28px author avatar · "Riya S. · 24 Sep · 15:39" 11.5px · text 13.5px · 28px × "Delete note" |
| Meta line | "<author> · <time>" |
| Truncation | none — note text wraps |
| Actions | "Add note" posts (newest first); × deletes at once with toast "Note deleted" and "Undo" |
| Mobile | Phone: full width; composer button stays to the right of the textarea. Tablet: as desktop |

### Visit flow (after "Start visit")

| Field | Value |
| --- | --- |
| Grid | single column, max 880px, gap 10px, padding 16px 20px 24px; replaces the section content |
| Anatomy | header row: sage pill "Visit in progress" (7px dot) · "Everything for today's visit on one screen" · "Pause" (outline 32px) · "✓ Complete visit" (dark 32px). Five step cards (padding 14px, radius 12px; the current step has a z900 border): 26px number circle (green ✓ when done, dark when current, grey otherwise) · title 14px/600 · status line 12px · the step's controls |
| Meta line | step status lines — see Multi-step flow |
| Truncation | status line one line with ellipsis |
| Actions | see Multi-step flow |
| Mobile | Phone: one column at full width; the three safety tiles stack one per row (auto-fit, 200px minimum); the header row has no phone rule. Tablet: as desktop |

## Forms

### Prescription drawer

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | date | date picker (dropdown, third width) | Date | "Pick a date" | none | no | today prefilled; options "Today · Sat 3 Oct", "Tomorrow · Sun 4 Oct", next 14 days, then 180 days back, grouped Today / Coming up / month |
| 2 | doc | person picker (dropdown, half) | Doctor | "Pick doctor" | none | no | Dr. Drashti · Dr. Nisha · Dr. Reenal · Dr. Karan Shah; prefilled with the patient's last prescribing doctor |
| 3 | quick | quick-add line (44px) + "Browse" (44px) | none — aria-label "Quick add" | "Type medicine, dose, timing · e.g. flu 0-0-1 af 10d" | "↵ add"; dropdown footer "↑↓ choose · ↵ add · Esc clear" · "od · bd · tds · hs · af/bf · 5d · x8"; chips row "Often prescribed" | no | parses 0-0-1 doses, od/bd/tds/hs/sos, af/bf/am/pm, face/scalp/body/hair/underarm, 5d / 2w days, x8 quantity; unknown name offers "Not in the list · add as typed"; no match "No match. Check the spelling or try fewer letters." |
| 4 | meds | item rows (full width) | Medicines (columns "Medicine" · "Dose · M A N" · "Meal" · "Where" · "Qty" · ×) | Medicine "Medicine"; Where "Where" | each row has a dashed "NOTE" line "Remarks · e.g. 10 days, apply thin layer, avoid sun" | at least one medicine to save | Medicine picker (create "Add medicine", full "New medicine"); Dose = three 24×30 taps Morning / Afternoon / Night cycling 0 → 1 → 2 → 0 (lit sage) + "SOS" (butter); Meal = "Before" (butter) / "After" (sky) + ⌄ "More timings" (Empty stomach · With meal · Morning · Night · Morning & night · Thrice a week · Once a week · Alternate days); Where picker (Face · Scalp · Hair · Body · Underarm · Neck · Back · Chest · Hands · Legs · Feet · Lips · Under eyes · Affected area, "Use" to add another); Qty stepper 32px (−/+, minimum 1); writing "10 days" in the note with a 0-0-1 style dose recalculates Qty; "+ Add medicine" adds a row |
| 5 | notes | textarea (4 rows, third) | Notes | "Advice for the patient" | none | no | ≤1,000 chars |
| 6 | lab | textarea (4 rows, third) | Lab report | "Tests advised or results" | none | no | ≤1,000 chars |
| 7 | proc | textarea (4 rows, third) | Today's procedure | "What was done today" | none | no | ≤1,000 chars |

- Error display: toast "Add a medicine" when no row has a medicine; no field errors.
- Submit: "Save prescription" (new) / "Save changes" (edit), dark, far right.
- Loading: "Saving…" 320–740ms.
- Success: drawer closes; toast "Prescription saved" / "Prescription #500 saved"; medicines typed that are not in Medical are added there as draft items.
- Dirty-state guard: none — Cancel, ×, Esc and backdrop close at once.

### Treatment drawer

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | tpl | segmented switch above the steps | none — aria-label "Type" | n/a — switch | sub "Fields follow the clinic specialty · switch if needed" | no | Skin · laser (lav dot) · Dental (mint) · Physio (sage) · Gynac (butter) · General (stone); switching clears area and template fields |
| 1 | name | text + quick chips | Treatment | "Pick or type" | quick chips "B1G1 D-Tan Facial" · "Underarm Peel · 6 sessions" · "Underarm Peel" · "Back Peeling" | no | free text |
| 2 | sess | stepper (− / +, 36px) | Session number | n/a — stepper | none | no | number; new = last session + 1 |
| 3 | doc | person picker | Doctor | "Pick doctor" | none | no | four doctors |
| 4 | ther | person picker | Therapist | "Pick therapist" | none | no | Kiran P. · Riya S.; tap again to clear |
| 5 | template fields | per template (see Multi-step flow) | per template | per template | per template | no | per template |
| 6 | remark | textarea | Remark | "Reaction, advice, next plan" | none | no | ≤1,000 chars |
| 7 | cb | chips | Aftercare call | n/a — chips | "creates a task to ask how it feels and what they followed" | no | No call (stone) · Next day (sage, default) · In 2 days (mint) · In a week (sky) |
| 8 | fb | read-only line (edit only) | Feedback on this treatment | n/a — read-only | none | no | "26 Sep · Better 7/10" per check-in, joined by a middle dot with two spaces on each side; or "No check-in yet · use Log check-in above" |

- Error display: none — nothing is required.
- Submit: "Save treatment" / "Save changes".
- Loading: "Saving…" 320–740ms.
- Success: drawer closes; toast "Treatment saved" / "Treatment #505 saved"; the chosen template is remembered for the next new treatment.
- Dirty-state guard: none.

### Upload report drawer

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | type | chips | Type | n/a — chips | none | no | Lab (mint, default) · Scan (sky) · Consent (lav) · Other (stone) |
| 2 | name | text | Name | "e.g. CBC report" | none | yes (by toast) | empty → toast "Name the report" |
| 3 | date | date picker | Date | "Pick a date" | none | no | today prefilled |
| 4 | file | upload drop zone (96px) | File | "Drop the report or browse" | "PDF, JPG or PNG · up to 10 MB" | no | >10 MB skipped with "1 file(s) over 10 MB skipped" |
| 5 | note | textarea | Note | "Optional" | none | no | ≤1,000 chars |

- Error display: toast only.
- Submit: "Upload".
- Loading: "Saving…" 320–740ms.
- Success: toast "Report uploaded"; the row appears in Reports.
- Dirty-state guard: none.

### Add package drawer

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | of | chips (single), full | none — the step title "Pick a package" labels it | n/a — chips | footer summary "Sessions are counted when a treatment is completed" | yes (by toast) | one of the multi-session offerings, e.g. "LHR Full Face · B4G7 · 7s · ₹4,800"; none → toast "Pick a package" |

- Error display: toast only.
- Submit: "Add package".
- Loading: "Saving…" 320–740ms.
- Success: toast "Package added · invoice it from Invoices".
- Dirty-state guard: none.

### Visit check-in / Aftercare check-in (child drawer)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | feel | chips | Compared with last visit | n/a — chips | none | yes (by toast) | Much better (sage) · Better (mint) · Same (stone) · Worse (blush); none → toast "Pick how it is now" |
| 2 | score | chips 1–10 | Patient’s own score | n/a — chips | "1 = very unhappy · 10 = very happy" | no | 1–4 blush, 5–7 butter, 8–10 sage |
| 3 | now | textarea | In their words | "Last time: <previous note>" or "What changed, what still bothers them" | none | no | ≤400 chars |
| 4 | fol | chips | Followed the advice | n/a — chips | none | no | Fully (sage) · Mostly (mint) · Partly (butter) · Not at all (blush) |
| 5 | folNote | textarea | Details | "Advised last time: <previous plan>" or "Home care, medicines, sunscreen, missed sessions" | none | no | ≤300 chars |
| 6 | next | textarea | Plan | "What happens next and when" | none | no | ≤400 chars |
| 7 | nextOf | offering picker (multi) | Add to offering suggestions | "Search offerings" | "optional · goes to the patient’s suggestions as Planned" | no | each pick becomes a Planned suggestion |

- Error display: toast only.
- Submit: "Save check-in" / "Save changes"; footer secondary "Back".
- Loading: "Saving…" 320–740ms.
- Success: toast "Check-in saved for Dharti Galani", plus " · 2 added to suggestions" and/or " · doctor call-back task created" (Worse, or a score of 4 or less, creates a doctor call-back task due in 3 hours). Edit → "Check-in updated".
- Dirty-state guard: none.

### Log a review (child drawer)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | src | chips | Where | n/a — chips | none | no | Google (butter, default) · Video (lav) · Instagram (blush) · Internal form (sky) · WhatsApp (sage) |
| 2 | rating | chips | Rating | n/a — chips | none | no | "★★★★★" + two spaces + "5" down to "★" + two spaces + "1"; 5 default |
| 3 | link | text, full | Link | "https://" | "Google review, post or drive link" | no | ≤200 chars |
| 4 | files | upload drop zone | Video or screenshot | "Drop the video or screenshot" | "MP4, MOV, JPG or PNG · up to 100 MB" | no | ≤100 MB |
| 5 | text | textarea | What they said | "Paste the review text or a short summary" | none | no | ≤600 chars |

- Error display: none.
- Submit: "Save review" / "Save changes"; footer secondary "Back".
- Loading: "Saving…" 320–740ms.
- Success: toast "5★ Google review saved for Dharti Galani"; a rating of 3 or less adds " · call-back task created" (task due in 4 hours). Edit → "Review updated".
- Dirty-state guard: none.

### Photo details (child drawer)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | name | text, half | Name | "e.g. Left cheek before peel" | none | no | ≤60 chars; blank keeps the old name |
| 2 | date | date picker, third | Date | "Pick a date" | none | no | — |
| 3 | cat | chips | Album | n/a — chips | none | no | General (stone) · Private (lav) · LHR (blush) |
| 4 | part | picker | Body part | "Pick body part" | "optional" | no | Face · Scalp · Neck · Chest · Back · Underarm · Arms · Hands · Legs |
| 5 | appt | chips, full | Visit | n/a — chips | "optional · files the photo under that appointment" | no | "Not attached" + the patient's last 8 visits ("24 Sep · Hydrafacial", sky) |

- Error display: none.
- Submit: "Save details"; footer secondary "Back".
- Loading: "Saving…" 320–740ms.
- Success: toast "Photo details saved".
- Dirty-state guard: none.

### Inline inputs

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | chip input per Clinical notes card | text, 32px, dashed | aria "Add Complaints" (etc.) | "Type and press Enter to add" | none | no | ≤60 chars; first letter capitalised; Enter adds |
| 2 | suggestion price | number input 112×30 | aria "Final price" | "0" | tooltip "Final price for this line"; below the lowest price the border turns red and the tooltip reads "Below the lowest price ₹4,200" (roles allowed to discount) or "Too much discount · ask an admin" | no | ≤8 digits |
| 3 | team note | textarea, 2 rows | aria "New note" | "Add a note for the team" | none | no | ≤500 chars; empty does nothing |

- Error display: price below the lowest allowed turns its border red with the tooltip above.
- Submit: Enter (chips), "Add note" (team note); suggestion edits apply as typed.
- Loading: none — local.
- Success: chip appears; note appears at the top.
- Dirty-state guard: none.

## Popups

### Patient file sections (section popover)

| Field | Value |
| --- | --- |
| Shape (desktop) | popover under the folder button, left-aligned, 8px gap, on a transparent backdrop |
| Shape (mobile) | Phone: bottom sheet — full width, top corners 16px, max-height 85vh with its own scroll, slides up; no dim. Tablet: as desktop |
| Trigger | folder button (aria-label and tooltip "Patient file · all sections") |
| Size | min(360px, 100vw − 32px) wide; max-height 100vh − 160px |
| Dismiss | backdrop click, Esc, picking a section |
| Header | 28px dark folder tile · "Patient file" (13px/600) over the patient name (11.5px) |
| Footer | "Pinned sections stay in the bar · this device" (11.5px z500) |
| Multi-step | no |
| Initial focus | none |

Body: groups "Clinical" (Clinical notes) · "Care" (Visits, Prescriptions, Treatments, Photos, Reports) · "Billing" (Invoices, Payments, Packages) · "Team" (Team notes); 3 tiles per row, gap 6px. Tile (padding 10px, radius 8px): 28px tinted icon tile, label 12.5px/600, state "Open now" / "Empty" / "Has records" (11px); empty tiles have a dashed z300 border and no fill; the open tile is tinted with a 1px ring. A 24px round pin sits top-right ("Pin to bar" / "Unpin from bar"; dark when pinned). Pins are kept on this device; default pins Clinical notes, Visits, Prescriptions, Invoices. The open section shows in the tab strip even when unpinned, with a 5px dot ("Not pinned · shown while open").

### Add to record menu

| Field | Value |
| --- | --- |
| Shape (desktop) | menu popover under the trigger, right-aligned, 6px gap |
| Shape (mobile) | Phone: same popover under the + button, right-aligned (not a sheet). Tablet: as desktop |
| Trigger | + in the file bar (aria-label "Add to record"); the ⌄ half of the section's split "New …" button (aria-label "More for Dharti") opens the same menu |
| Size | 232px (from +), 240px (from ⌄); 6px padding; rows 36px |
| Dismiss | backdrop click, Esc, picking an item |
| Header | "Add for Dharti" (from +) / "For Dharti · already selected" (from ⌄), 11px/600 uppercase |
| Footer | n/a — the menu has no footer |
| Multi-step | no |
| Initial focus | none |

Items (26px or 24px tinted tile + label): Prescription (sage) → Prescriptions + New prescription drawer · Treatment (lav) → Treatments + New treatment drawer · Invoice (butter) → invoice drawer for this patient · Payment (mint) → receive payment for the open invoices, or toast "Nothing due for Dharti Galani" · Photo (blush) → Photos + file picker (images, 15 MB each), toast "2 photos uploaded" · Appointment (sky) → appointment form for this patient · Report (stone) → Reports + Upload report drawer · Note (stone) → Team notes.

### Record drawers (Prescription, Treatment, Upload report, Add package)

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, full height, over a rgb(9 9 11 / .45) backdrop |
| Shape (mobile) | Phone: full-screen drawer (width 100%, no shadow); the floating × moves inside to the top-right (44×44, transparent); header keeps 56px right padding; footer wraps — buttons share rows at 44px, the summary moves below them centred at 12px, padding 10px 12px + safe area; item rows wrap (see Multi-step flow). Tablet: as desktop, capped at the window width − 56px |
| Trigger | split "New prescription" / "New treatment" / "Upload report" / "Add package"; Add to record items; row click or "Edit" (Prescriptions, Treatments); visit flow "Write prescription" / "New treatment" |
| Size | Prescription min(1040px, 100vw − 56px); Treatment min(680px, 100vw − 56px); Upload report and Add package min(560px, 100vw − 56px); header 76px (60px phone) |
| Dismiss | backdrop click, Esc, floating × (36px white, radius 12px, beside the panel), "Cancel" |
| Header | Prescription: "New prescription" / "Edit prescription" + "#500" tag, sub "Dharti Galani · #3508", badges "2 medicines" (sage) and the doctor, "QUICK FILL" ⚡ "Print prescription" (sage, edit only) · "Repeat last Rx #500" (sky, new only) · "Hair fall kit" (lav) · "Post-peel kit" (blush) · "Pigmentation kit" (butter). Treatment: "New treatment" / "Edit treatment" + tag, sub "Fields follow the clinic specialty · switch if needed", badges template + "Session 2", ⚡ "Log check-in" (edit) · "Next session of LHR Full Face" (new) · one chip per package "LHR Full Face · B4G7 · session 2", then the Type switch. Upload report: "Upload report", sub patient name. Add package: "Add package", sub patient name |
| Footer | summary left ("2 medicines · Dr. Drashti" / "LHR Full Face · Session 2 · Dr. Drashti" / "Lab · 0 file" / "Sessions are counted when a treatment is completed") · "Delete" (red, edit only) · "Cancel" · "Save prescription" / "Save treatment" / "Upload" / "Add package" ("Save changes" on edit); a failed save adds "Not saved · your changes are kept" and "Retry save" |
| Multi-step | yes — Prescription 3 steps, Treatment 3 steps, Upload report 3 steps; Add package single |
| Initial focus | none — the prototype moves no focus |

Quick fill kits fill the medicine rows: "Hair fall kit" → Flubolt 400 0-0-1 After meal ×8, Clonix-B Lotion Morning & night Scalp ×1, Densyl-AD Shampoo Thrice a week Scalp ×1; "Post-peel kit" → Sunscreen SPF 50 1-1-0 Morning Face ×1 "Reapply every 3 h", notes "Avoid sun and scrubs for 48 h"; "Pigmentation kit" → Tranexa 500 1-0-1 After meal ×20, Sunscreen SPF 50 1-1-0 Morning Face ×1. The prototype defines a "Save & sell" footer button for prescriptions but never shows it.

### Check-in, review, feedback picker, photo details, report view (child drawers)

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, stacked above any open drawer |
| Shape (mobile) | Phone: full-screen drawer with the × inside top-right (44×44) and the wrapping footer. Tablet: as desktop |
| Trigger | Check-in: Treatments row "Check-in", Treatment drawer "Log check-in", Log feedback picker. Review: Log feedback picker, card Edit. Log feedback: "Log feedback ⌄" and the empty Feedback tile. Photo details: tile / viewer Edit. Report view: Reports row "Open" |
| Size | Check-in min(680px, 100vw − 56px); the others min(560px, 100vw − 56px) |
| Dismiss | backdrop click, Esc, floating ×, "Back" |
| Header | "Visit check-in" or "Aftercare check-in" — sub "Dharti Galani · LHR Full Face · Treatment #498 · last check-in 24 Sep: Same". "Log a review" — sub "Dharti Galani · kept on the patient file so anyone can find it later". "Log feedback" — sub "Dharti Galani · pick what you want to record". "Photo details" — sub "Optional · name, date and body part help you find it later". Report view — title = report name, tag = type, sub "Dharti Galani · 20 Sep 2026" |
| Footer | summary · "Back" · primary ("Save check-in", "Save review", "Close", "Save details", "Download") |
| Multi-step | Check-in 3 steps; Log a review 3 steps; Report view 3 steps; Log feedback and Photo details single |
| Initial focus | none |

Log feedback body: one titled group of tinted chips per kind — "Check-in" ("Consultation"), "Treatment feedback" (one chip per recent treatment, up to 4, e.g. "After LHR Full Face"), "Review" ("Google" · "Video" · "Instagram" · "Feedback form" · "WhatsApp"); chips show the label only. Picking a chip closes the picker and opens that drawer. Report view shows read-only Type, Date, Added by, File "CBC + Thyroid profile · PDF · shared with the patient on request" and Notes "No notes on this report"; "Download" → toast "Downloading CBC + Thyroid profile".

### Print preview

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, on a z100 background holding a paper sheet |
| Shape (mobile) | Phone: full-screen (width 100%); its header bar reserves 56px on the right; the sheet keeps its two-column boxes at phone width. Tablet: as desktop |
| Trigger | Prescriptions row "Preview" |
| Size | min(820px, 100vw − 56px); sheet max 680px, padding 36px 40px, radius 6px |
| Dismiss | backdrop click, "Close" |
| Header | "Print preview · Prescription #500" (16px/600) · "Close" (outline 36px) · "Print / Save PDF" (dark 36px) |
| Footer | n/a — actions sit in the header |
| Multi-step | no |
| Initial focus | none |

Sheet: "C" tile + "Cresence Skin" + "Adajan, Surat · GSTIN 24ABCDE1234F1Z5" · title; boxes "Patient" (Name, Patient ID, Age) and "Prescription" (Date, "Rx no." "PRES-500", Doctor); items table Medicine · Dosage · When · Where · Qty · Remark; blocks "Notes" ("No notes"), "Lab reports" ("No lab reports"), "Today's procedure" ("No procedures"); summary "Follow-up" ("Not scheduled") and "Doctor's signature"; footer "Thank you for choosing Cresence Skin · +91 74900 20099".

### Photo viewer

| Field | Value |
| --- | --- |
| Shape (desktop) | full-screen overlay on rgb(9 9 11 / .94); rows 56px bar · image · 64px hint row |
| Shape (mobile) | Phone: same full-screen overlay; the top bar reserves 56px on the right; zoom and pan are mouse/wheel/button driven (no pinch rule); the hint row is unchanged. Tablet: as desktop |
| Trigger | photo tile click |
| Size | 100% of the window; image box min(92%, 1100px) × 92% |
| Dismiss | "Close viewer" (×, 40px) or Esc — no backdrop click |
| Header | name 14px/600 over "Face · 24 Sep · General" 12px · "2 of 6" · zoom group (36px: "−" · "100%" · "+") · Edit details (40px round) · Delete photo (40px round) · × |
| Footer | hint row "← → browse" · "Scroll or + − zoom" · "Drag to move · double-click to reset" · "Esc close" |
| Multi-step | no |
| Initial focus | the viewer itself (keyboard: ← → browse, + / − zoom ×1.25, 0 resets, Esc closes) |

Zoom 100%–600%; the wheel zooms ×1.12 per notch; double-click toggles 100% ↔ 200%; drag pans when zoomed; 40px round ‹ › buttons 16px from each side when the album has more than one photo; a missing file shows "Sample photo · no file attached".

### Delete confirm

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge (alertdialog), over rgb(9 9 11 / .32) |
| Shape (mobile) | Phone: stays a side drawer min(480px, 100vw − 56px) — 334px at 390; its × moves inside top-right (44×44). Tablet: as desktop |
| Trigger | any Delete / Remove action in this file |
| Size | min(480px, 100vw − 56px) |
| Dismiss | backdrop click, ×, "Keep it" |
| Header | "Delete this prescription?" (treatment, invoice, report, photo, package, appointment, record) or "Remove this check-in?" / "Remove this review?" / "Remove this record?", then the record in a grey pill, then the effect line (default "It disappears from lists and pickers. You can undo from the toast right after.") |
| Footer | hint · "Keep it" · red action ("Delete" / "Remove"), inert until a reason is picked |
| Multi-step | no |
| Initial focus | none |

## Multi-step flow

### Prescription drawer

- Steps (ordered): 1 "Prescription" (Date, Doctor) → 2 "Medicines" (quick line, Browse, item rows) → 3 "Clinical notes" (Notes, Lab report, Today's procedure).
- **Sequence varies by input?** no — always these three steps, new or edit.
- Progress indicator: 24px numbered circles in the step card heads (open step sage, earlier green, later z200, missing red "!").
- Navigation: "Next: Medicines →" / "Next: Clinical notes →" at the end of the open step; any step head reopens it ("Edit" / "Open").
- Per-step validation: none; Save checks for at least one medicine.
- Edit mode: prefilled, opens on step 1; closed steps show a peek grid ("MEDICINE · 2 added" with name chips, "+2" beyond 6).
- Phone: the item table's header hides; each item row wraps — Medicine on its own line, then Dose taps, Meal, Where and Qty flow on the next line(s) (gap 8px 10px, padding 10px 12px), × pushed to the right, the NOTE line full width.
- Browse panel: fixed panel under the quick line, as wide as it (220–440px tall, flips up when there is no room): group chips "All" · "Often prescribed" · "Oral" · "Topical"; tiles minmax(180px) with name, last dosage / stock and MRP; tapping adds one (added tiles turn green with a − n + stepper); "Medicine not in the list" + add; footer "2 added" / "Tap a tile to add", "Showing 60 of 84 · type to narrow", "Done".

### Treatment drawer

- Steps (ordered): 1 "Session" (Treatment, Session number, Doctor, Therapist) → 2 "<template> details" → 3 "Aftercare" (Remark, Aftercare call, and on edit Feedback on this treatment).
- **Sequence varies by input?** yes — step 2's title and fields follow the Type switch:
  - Skin · laser → "Skin · laser details": Therapy type (Laser · Peel · Facial · Injectable · Microneedling, lav) · Body part (picker, "pick any": Face · Upper lip · Chin · Underarm · Arms · Legs · Back · Chest · Full body) · Skin type (Type I–VI, butter) · Machine ("e.g. Soprano Ice") · Wavelength (532 · 755 · 810 · 1064) · Start reading / End reading ("Shots / counter") · Power · frequency · PD · mode ("e.g. 10 J · 3 Hz · 20 ms · HR").
  - Dental → "Dental details": Procedure (Scaling · Filling · RCT · Extraction · Crown · Implant · Whitening, mint) · Teeth ("FDI numbering · tap to select"; four quadrants "Upper right" 18–11, "Upper left" 21–28, "Lower right" 48–41, "Lower left" 31–38, 28px tooth buttons, picked = dark) · Material ("e.g. Composite A2") · Anaesthesia toggle ("Given" / "Not given").
  - Physio → "Physio details": Region (Neck · Shoulder · Back · Hip · Knee · Ankle, sage, multi) · Modality (TENS · IFT · Ultrasound · Exercise · Manual therapy · Traction, sky) · Pain before / Pain after (pickers 0–10, hint "0–10") · Home exercises ("Sets, reps, frequency").
  - Gynac → "Gynac details": Visit type (ANC · PNC · Infertility · Contraception · General, butter) · LMP (date) · Gestation (stepper, "weeks") · BP ("120/80") · Weight (stepper, "kg") · Findings ("Examination findings").
  - General → "General details": Area ("Comma separated") · Parameters ("One per line, e.g. Dose: 2 ml").
- Progress indicator: numbered circles in the step heads.
- Navigation: "Next: …" buttons; heads reopen steps.
- Per-step validation: none.
- Edit mode: prefilled, same template; switching template clears area and template fields.

### Upload report / Log a review / Report view drawers

- Steps (ordered): Upload report 1 "Report" (Type, Name) → 2 "Details" (Date) → 3 "Notes" (File, Note). Log a review 1 "Review" (Where, Rating) → 2 "Details" (Link) → 3 "Notes" (Video or screenshot, What they said). Report view 1 "Report" (Type, Date) → 2 "Details" (Added by, File) → 3 "Notes" (Notes).
- **Sequence varies by input?** no.
- Progress indicator: numbered circles in the step heads.
- Navigation: "Next: …"; heads reopen steps; "Back" leaves a child drawer.
- Per-step validation: none (Upload report checks the name on Save).
- Edit mode: Log a review — prefilled, same steps; the others n/a — create or view only.

### Visit / Aftercare check-in

- Steps (ordered): 1 "How is it now" (Compared with last visit, Patient’s own score, In their words) → 2 "What they followed" (Followed the advice, Details) → 3 "Next plan of action" (Plan, Add to offering suggestions).
- **Sequence varies by input?** no — the steps are fixed; the outcome varies: Worse, or a score ≤ 4, creates a doctor call-back task; the title reads "Aftercare check-in" when opened from a treatment, "Visit check-in" otherwise.
- Progress indicator: numbered circles.
- Navigation: "Next: What they followed →", "Next: Next plan of action →"; "Back".
- Per-step validation: none; Save requires a feel.
- Edit mode: prefilled from the card's Edit, same steps.

### Visit flow

- Steps (ordered): 1 "Check-in & safety" → 2 "Prescription" → 3 "Treatment" → 4 "Invoice" → 5 "Collect & share". All five cards are open at once; the first unfinished step is "current".
- **Sequence varies by input?** no — the five steps never change; their content does:
  - 1: three check tiles "Consent signed" ("Treatment can't start without it"), "Before photos taken" ("Auto-paired with after photos"), "Allergies & medicines checked" ("Asked at every visit"); status "2 checks left" → "All checks done".
  - 2: dashed ⚡ kit chips "Hair fall kit" · "Post-peel kit" · "Pigmentation kit" (one tap saves a prescription, toast "Hair fall kit prescribed") and "Write prescription"; status "One tap from a kit, or write one" → the medicine names.
  - 3: "⚡ Repeat · LHR Full Face · session 2" (only when there is a past treatment; saves a copy, toast "Session 2 recorded with last settings") · "New treatment" · "Remembered for this patient: Soprano Ice · 10 J · 3 Hz · 810 nm · Type IV" · package pill "Uses 1 session of LHR Full Face · B4G7"; both buttons are blocked with toast "Finish check-in first" until step 1 is done; status "Record today's session" / "Last settings: …" → "LHR Full Face · session 2".
  - 4: with items ready, a bordered list (name · amount, then "Total") + "Create invoice from visit" (toast "Invoice #1043 created from the visit"; "Nothing to bill" when empty) · "Custom invoice"; status "2 items ready · ₹6,250", "Covered by package · nothing to bill", "Nothing to bill yet", or "#1043 · ₹6,250" once billed.
  - 5: when money is due "Collect ₹1,500 · UPI" · "Cash" · "Card" (collects the first unpaid invoice in full, toast "₹1,500 received by UPI"; "Nothing due" when none) and always "Share Rx, invoice & photos" (WhatsApp icon; toast "Rx, invoice and photos sent to Dharti Galani on WhatsApp"); status "₹1,500 due" / "Nothing due" → "Sent on WhatsApp".
- Progress indicator: 26px circles — green ✓ done, dark current, grey later; the current card has a dark border.
- Navigation: no Next — every step is actionable; "Pause" leaves the flow (state kept, file bar shows "Visit in progress · Resume" on other sections); "✓ Complete visit" ends it: uses a package session when today's treatment matches a package, sets the follow-up, toast "Visit completed · 1 package session used · follow-up set for 26 Oct".
- Per-step validation: only step 3 is gated on step 1.
- Edit mode: n/a — the flow is a live session, resumed rather than edited.

## Preview / animated panels

| Field | Value |
| --- | --- |
| Surfaces | 2 — Print preview (prescription sheet) and Photo viewer |
| Switching | explicit: row "Preview" opens Print preview; a photo tile opens the viewer; ‹ › / ← → step through photos of the album |
| Surface per input type | prescription → Print preview sheet; photo → viewer (image, or "Sample photo · no file attached" when the record has no file) |
| Frame sequence | n/a — neither surface animates through frames |
| Frame durations | n/a — no frame sequence |
| Progressive reveal | n/a — content shows at once |
| Static fallback | viewer: dark z800 box with the image icon and "Sample photo · no file attached"; preview: empty blocks read "No notes", "No lab reports", "No procedures", follow-up "Not scheduled" |

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Back | chevron-left | 16 | yes — aria-label "Back to patients" |
| Section popover button / header tile | folder-open | 16 | yes — aria-label "Patient file · all sections" |
| Section tabs and tiles | stethoscope (Clinical notes) · calendar (Visits) · pill (Prescriptions) · sparkles (Treatments) · camera (Photos) · file (Reports) · receipt (Invoices) · wallet (Payments) · package (Packages) · message-square (Team notes) | 14 | no |
| Tile pin | map-pin | 12 | yes — aria-label "Pin to bar · Visits" / "Unpin from bar · Visits" |
| Add to record | plus | 16 | yes — aria-label "Add to record" |
| Add menu items | file · sparkles · receipt · wallet · camera · calendar · clipboard-list · message-square | 15 | no |
| Start visit | play | 13 | no |
| Activity toggle | panel-right-open (closed) / panel-right-close (open) | 16 | yes — aria-label "Show messages & activity" / "Hide messages & activity" |
| Edit contact | pencil | 15 | yes — aria-label "Edit contact" |
| Reach rows | `wa` — WhatsApp brand glyph, not Lucide · phone · `insta` — Instagram brand glyph, not Lucide | 14 | no |
| Show / hide number, amount, prices | eye / eye-off | 13–15 | yes — "Show number", "Hide amount", "Show prices"… |
| Copy | copy | 13 | yes — aria-label "Copy" |
| About rows | users · calendar · message-square · map-pin · shield | 14 | no |
| Up next | calendar · wallet · refresh-cw (credit) · message-square (feedback) | 15–16 | no |
| Columns | eye | 16 | yes — aria-label "Show or hide columns" |
| Split ⌄, chevrons | chevron-down | 14 | yes on the split — aria-label "More for Dharti" |
| Row actions | printer · eye · copy · receipt · wallet · message-square · file · pencil · trash | 13 | yes — aria-label = action name |
| Photo album tabs | image (General) · lock (Private) · sparkles (LHR) | 14 | no |
| Photo tile actions | pencil · trash | 13 | yes — "Edit details", "Delete photo" |
| Photo placeholder | image | 22 | no |
| Viewer prev / next | chevron-left (next is rotated 180°) | 18 | yes — "Previous photo", "Next photo" |
| Viewer edit / delete | pencil · trash | 16 | yes |
| Suggestion status | clock (Planned) · circle-check (Accepted) · calendar (Next time) · x (Declined) | 13–14 | no |
| Suggestion row | info · link · trash · sparkles (idea) · plus (Add offering) | 13–14 | yes on info / link / trash |
| Feedback | message-square (header) · plus (Log feedback) · calendar · sparkles · search (Google) · play (Video) · `insta` brand glyph · file (Feedback form) · `wa` brand glyph · pencil · trash | 13–16 | yes on Edit / Remove |
| Visit share | `wa` — WhatsApp brand glyph, not Lucide | 14 | no |
| Empty table state | users | 18 | no |
| Quick line / Browse | search · layout-grid | 15 | no |
| Quick fill chips | "⚡" text glyph | 12px | no |

Library: Lucide (inline paths) · Weight: 1.6px stroke for registry icons; 2px for chevron-down, check, minus, x, ellipsis and picker icons.

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Section popover, Add menu, dropdowns, calendars, quick-line results | opacity 0→1, translateY −4px→0 (+4px when flipped up), scale .985→1 | 160ms | cubic-bezier(.2,.8,.2,1) |
| Phone bottom sheets (section popover, pickers) | translateY 28px→0, opacity 0→1 | 260ms | cubic-bezier(.32,.72,0,1) |
| Section tab | background, color, box-shadow | 160ms | ease |
| Drawer panel | transform translate3d(100%,0,0)→0 | 340ms | cubic-bezier(.32,.72,0,1) |
| Drawer backdrop | background-color rgb(9 9 11 / 0)→.45 | 340ms | cubic-bezier(.32,.72,0,1) |
| Step card body | opacity 0→1, translateY −4px→0 | 240ms | cubic-bezier(.2,.8,.2,1) |
| Visit flow page | opacity 0→1, translateY −4px→0 | 240ms | ease |
| Chevrons (Offering suggestions and Feedback headers, status and visit pickers) | transform rotate 0→180° | 150ms | ease |
| Photo viewer | opacity 0→1 | 150ms | ease |
| Viewer image zoom / pan | transform | 120ms (none while dragging) | ease |
| Photo tile bar (hover-capable screens) | opacity 0→1, translateY 4px→0 | 150ms | ease |
| Feedback carousel arrows | scroll by 90% of the row | browser smooth scroll | browser default |
| Delete-confirm × | opacity 0→1, scale .9→1, after a 200ms delay | 200ms | cubic-bezier(.2,.8,.2,1) |
| Toggle knob (Anaesthesia) | left, background | 150ms | ease |
| Skeleton shimmer | background-position 100%→−100% | 1100ms, infinite | ease |

Reduced-motion: every animation and transition runs .01ms with a 0s delay and one iteration (drawers, sheets, viewer and popovers appear in place; shimmer stops); smooth scrolling in the Feedback carousel becomes instant.

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| File (opening a patient) | in-place skeleton over the scrolling content: text runs become .72em z150 bars shimmering at 1.1s, avatars grey discs, icons hidden; 260–560ms | n/a — a patient file always has an identity | toast "Couldn’t load this list · connection dropped. Showing the last copy." with "Retry" for 9s |
| Section switch | skeleton over the content column, 200–440ms | per section below | as above |
| Clinical notes cards | section skeleton | "Nothing added yet" | n/a — edits are local |
| Offering suggestions | skeleton over the card for 180–360ms when it is expanded | header "No suggestions yet" (or "· 2 ideas"); open: "Nothing suggested for Dharti yet." | n/a — local; a price below the floor turns red |
| Feedback | skeleton over the card for 180–360ms when expanded; "Load more" tile reads "Loading…" for 200–500ms | dashed tile (min 120px, radius 12px): "No feedback yet" + "Log a check-in or a review after the next visit · Log feedback" | n/a — local |
| Section tables | the section skeleton (200–440ms) when the section opens; no other refetch | users icon on a sage disc · "No appointments yet" / "No prescriptions yet" / "No treatments yet" / "No reports yet" / "No invoices yet" / "No payments yet" · "Nothing here yet. Try another tab or search." | list toast with "Retry" as above |
| Photos | section skeleton; upload tray bottom-right (320px) "Uploading 1 of 2…" → "All uploads complete" | dashed box (padding 48px): 44px image tile · "No photos in General yet" · "Drag photos here or upload from your computer." · "Upload images" | toasts "1 file(s) over 15 MB skipped", "Drop image files" |
| Packages | section skeleton | "No packages yet" (13px, centred, padding 40px) | n/a — local |
| Team notes | section skeleton | "No notes yet" | n/a — local |
| Rail · Up next | page skeleton | "Not booked" · "No upcoming visit" · "Book"; "All paid · nothing due" | n/a — local |
| Activity panel | page skeleton | "No conversation yet" + "Dharti’s Hydrafacial is today at 11:00 am · a quick WhatsApp keeps the slot" (or "Every WhatsApp, call and note with Dharti shows here", or "Start with a WhatsApp · replies land here") with starter chips | failed message "Not sent" + "Retry"; outage "WhatsApp down · replies will queue" |
| Drawers | skeleton over the drawer body for 200–440ms when it opens; "Saving…" 320–740ms | n/a — forms | footer "Not saved · your changes are kept", button "Retry save", toast "Couldn’t save · connection dropped. Everything you entered is still here." with "Retry" for 9s |
| Visit flow | none — local | step lines "Nothing to bill yet", "Nothing due" | toasts "Finish check-in first", "Nothing to bill", "Nothing due" |
| Photo viewer | none | "Sample photo · no file attached" | n/a — local |

## Copy

| Key | Exact string |
| --- | --- |
| back | "Back to patients" · tooltip "Back to patients (Esc)" |
| breadcrumb | "Patients" · "/" · "Dharti Galani" |
| identity line | "#3508 · +91 ••••• •3212" |
| visit pill | "Visit in progress · Resume" |
| section popover | "Patient file · all sections" · "Patient file sections" · "Patient file" · "Clinical" · "Care" · "Billing" · "Team" · "Open now" · "Empty" · "Has records" · "Pin to bar" · "Unpin from bar" · "Pinned sections stay in the bar · this device" · "Close sections" |
| temporary tab | "Not pinned · shown while open" |
| sections | "Clinical notes" · "Visits" · "Prescriptions" · "Treatments" · "Photos" · "Reports" · "Invoices" · "Payments" · "Packages" · "Team notes" |
| add menu | "Add to record" · "Add for Dharti" · "For Dharti · already selected" · "More for Dharti" · "Prescription" · "Treatment" · "Invoice" · "Payment" · "Photo" · "Appointment" · "Report" · "Note" |
| header actions | "Start visit" · "Activity" · "Show messages & activity" · "Hide messages & activity" |
| rail identity | "Copy patient ID" · "Patient ID copied" · "45 days as patient" · "1 day as patient" · "3 months as patient" · "Joined today" · "Edit contact" |
| rail reach | "Reach" · "WhatsApp · Primary" · "Mobile · From lead" · "Mobile · Contact" · "Mobile" · "Instagram" · "Primary" · "•••• 3212" · "Show number" · "Hide number" · "Open WhatsApp chat in new tab" · "Call" · "Open Instagram in new tab" · "Copy" · "Number copied" · "Handle copied" |
| rail about | "About" · "Female · 30 yrs" · "🎂 in 24 days" · "🎂 today" · "No address" · "✓ Data" · "✓ Photos" · "✕ Marketing" · tooltip "Consent · Data" |
| rail up next | "Up next" · "Today · 11:00 am" · "Hydrafacial · 45 min" · "Reschedule" · "Book" · "Not booked" · "No upcoming visit" · "₹ ••••" · "since 12 days" · "Show amount" · "Hide amount" · "Collect" · "₹500 to return" · "Give back" · "All paid · nothing due" · "Feedback" · "Better · 7/10" · "2 check-ins · 1 review" · "No feedback yet" |
| split buttons | "New appointment" · "New prescription" · "New treatment" · "Upload report" · "Upload images" · "New invoice" · "Record payment" · "Add package" |
| nothing due | "Nothing due for Dharti Galani" |
| clinical notes | "Complaints" · "Diagnosis" · "Treatment suggestions" · "Future suggestions" · "1 new" · "Added since the last visit" · "Nothing added yet" · "Type and press Enter to add" · "Remove Tanning on face" |
| suggestions | "Offering suggestions" · "2 suggested · 1 accepted · 4 past purchases" · "2 planned · 1 accepted · 2 ideas" · "No suggestions yet" · "Nothing suggested yet" · "Prices hidden" · "Show prices" · "Hide prices" · "Prices hidden · use the eye to show" · "Saves ₹600 on list · ₹4,500 invoiced" · "At list price" · "Suggested" · "Qty" · "Price" · "Status" · "Less" · "More" · "Final price" · "Offering details" · "Invoiced" · "Invoiced · 1 of 2" · "Link an invoice" · "Link an invoice by hand" · "No invoice to link yet" · "Create the invoice first · it links itself when the offering matches" · "Remove" · "Nothing suggested for Dharti yet." · "Why this idea" · "Idea" · "+ Add" · "Add to suggestions" · "Add offering" · "Search offerings" |
| suggestion statuses | "Planned" — "Suggested · not decided yet" · "Accepted" — "They agreed · invoice when it happens" · "Next time" — "Interested · bring it up at the next visit" · "Declined" — "Not interested · kept as a record" |
| suggestion toasts | "LHR Full Face · B4G7 added to Dharti’s suggestions" · "LHR Full Face · B4G7 is already in suggestions" · "LHR Full Face · B4G7 removed from suggestions" · confirm line "It leaves Dharti’s offering suggestions. Use Declined instead to keep a record that it was offered." |
| purchases | "Dharti’s last purchases" · "4 lines · ₹6,300 paid so far" · "Date" · "Bought" · "Qty" · "Paid" · "Sessions" · "Invoice" · "1 of 7 used" |
| contact activity | "Contact activity" · "Lead #2363 · Clinic visited" · "Open chat" · "When" · "Channel" · "Message" · "Status" · "Sent" · "Got" · "Received" · "Delivered" · "Read" · "Not delivered" · "Queued" |
| feedback | "Feedback" · "1 check-in · 1 review" · "Log feedback" · "All" · "Consultation" · "Treatment feedback" · "Google" · "Video" · "Instagram" · "Feedback form" · "WhatsApp" · "Followed mostly" · "No note on how it is now" · "No review text" · "Next" · "Link" · "No next step noted" · "No link added" · "Action needed" · "Log action" · "Previous" · "Next" · "Load more" · "Older feedback" · "Loading…" · "No feedback yet" · "Log a check-in or a review after the next visit · Log feedback" |
| feedback actions | "Doctor called" · "Asked to visit again" · "Free review visit booked" · "Plan changed" · "Refund / credit given" · "Other" · "Replied on Google" · "Called the patient" · toast "✓ Doctor called · logged" · "Check-in removed" · "Review removed" |
| photos | "General" · "Private" · "LHR" · "3 photos" · "Visit" · "All photos" · "Not attached to a visit" · "Uploaded from the file" · "Small thumbnails" · "Medium thumbnails" · "Large thumbnails" · "S" · "M" · "L" · "Edit details" · "Edit name, date, body part" · "Delete photo" · "Load more · 4 left" · "No photos in General yet" · "Drag photos here or upload from your computer." · "Upload images" · "2 photos uploaded to General" · "Drop image files" · "Photo deleted" |
| viewer | "Photo viewer" · "2 of 6" · "Zoom out" · "Zoom in" · "Zoom out (−)" · "Fit to screen (0)" · "Zoom in (+)" · "Close viewer" · "Close (Esc)" · "Previous photo" · "Next photo" · "Previous (←)" · "Next (→)" · "← → browse" · "Scroll or + − zoom" · "Drag to move · double-click to reset" · "Esc close" · "Sample photo · no file attached" |
| packages | "6 left" · "1 of 7 used" · "Valid till 24 Sep 2027 · Next: 8 Oct" · "Use a session" · "Book next" · "Session 2 of 7 used" · "No sessions left" · "No packages yet" |
| team notes | "Add a note for the team" · "Add note" · "Delete note" · "No notes yet" · "Note deleted" |
| tables | "All appointments loaded" · "All prescriptions loaded" · "All treatments loaded" · "All reports loaded" · "All invoices loaded" · "All transactions loaded" · "No appointments yet" · "No prescriptions yet" · "No treatments yet" · "No reports yet" · "No invoices yet" · "No payments yet" · "Nothing here yet. Try another tab or search." · "PDF · shared with patient on request" · "Nothing due" · "Call next day" · "Call in 2 days" |
| row actions | "Print" · "Preview" · "Copy prescription" · "Sell medicines" · "Copy invoice" · "Record payment" · "Check-in" · "Copy as next session" · "Open" · "Edit" · "Delete" · toasts "Prescription copied" · "Session 2 added" · "Prescription deleted" · "Treatment deleted" · "Report deleted" |
| prescription drawer | "New prescription" · "Edit prescription" · "Dharti Galani · #3508" · "2 medicines" · "Quick fill" · "Print prescription" · "Repeat last Rx #500" · "Hair fall kit" · "Post-peel kit" · "Pigmentation kit" · "Prescription" · "Medicines" · "Clinical notes" · "Date" · "Doctor" · "Pick a date" · "Pick doctor" · "Type medicine, dose, timing · e.g. flu 0-0-1 af 10d" · "↵ add" · "Browse" · "Browse all" · "Suggested · click to add" · "↑↓ choose · ↵ add · Esc clear" · "od · bd · tds · hs · af/bf · 5d · x8" · "Not in the list · add as typed" · "No match. Check the spelling or try fewer letters." · "Often prescribed" · "Medicine" · "Dose · M A N" · "Meal" · "Where" · "Qty" · "Before" · "After" · "More timings" · "SOS" · "Only when needed (SOS)" · "Note" · "Remarks · e.g. 10 days, apply thin layer, avoid sun" · "+ Add medicine" · "Add medicine" · "New medicine" · "Use" · "Medicine not in the list" · "Tap a tile to add" · "2 added" · "Showing 60 of 84 · type to narrow" · "Done" · "Notes" · "Advice for the patient" · "Lab report" · "Tests advised or results" · "Today's procedure" · "What was done today" · "Save prescription" · "Add a medicine" · "Prescription saved" · "Prescription #500 saved" · "Prescription #500 deleted" |
| treatment drawer | "New treatment" · "Edit treatment" · "Fields follow the clinic specialty · switch if needed" · "Skin · laser" · "Dental" · "Physio" · "Gynac" · "General" · "Log check-in" · "Next session of LHR Full Face" · "Session" · "Aftercare" · "Treatment" · "Pick or type" · "Session number" · "Therapist" · "Pick therapist" · "Remark" · "Reaction, advice, next plan" · "Aftercare call" · "creates a task to ask how it feels and what they followed" · "No call" · "Next day" · "In 2 days" · "In a week" · "Feedback on this treatment" · "No check-in yet · use Log check-in above" · "Save treatment" · "Treatment saved" · "Treatment #505 saved" |
| treatment template fields | "Therapy type" · "Body part" · "Skin type" · "Machine" · "e.g. Soprano Ice" · "Wavelength" · "Start reading" · "End reading" · "Shots / counter" · "Power · frequency · PD · mode" · "e.g. 10 J · 3 Hz · 20 ms · HR" · "Procedure" · "Teeth" · "FDI numbering · tap to select" · "Upper right" · "Upper left" · "Lower right" · "Lower left" · "Material" · "e.g. Composite A2" · "Anaesthesia" · "Given" · "Not given" · "Region" · "Modality" · "Pain before" · "Pain after" · "0–10" · "Home exercises" · "Sets, reps, frequency" · "Visit type" · "LMP" · "Gestation" · "weeks" · "BP" · "120/80" · "Weight" · "kg" · "Findings" · "Examination findings" · "Area" · "Comma separated" · "Parameters" · "One per line, e.g. Dose: 2 ml" |
| report / package drawers | "Upload report" · "Report" · "Name" · "e.g. CBC report" · "File" · "Drop the report or browse" · "PDF, JPG or PNG · up to 10 MB" · "Optional" · "Upload" · "Name the report" · "Report uploaded" · "Add package" · "Pick a package" · "Sessions are counted when a treatment is completed" · "Package added · invoice it from Invoices" |
| check-in | "Visit check-in" · "Aftercare check-in" · "How is it now" · "What they followed" · "Next plan of action" · "Compared with last visit" · "Much better" · "Better" · "Same" · "Worse" · "Patient’s own score" · "1 = very unhappy · 10 = very happy" · "In their words" · "What changed, what still bothers them" · "Followed the advice" · "Fully" · "Mostly" · "Partly" · "Not at all" · "Details" · "Home care, medicines, sunscreen, missed sessions" · "Plan" · "What happens next and when" · "Add to offering suggestions" · "optional · goes to the patient’s suggestions as Planned" · "Save check-in" · "Pick how it is now" · "Check-in saved for Dharti Galani · 2 added to suggestions · doctor call-back task created" · "Check-in updated" |
| review | "Log a review" · "Dharti Galani · kept on the patient file so anyone can find it later" · "Where" · "Internal form" · "Rating" · "Link" · "Google review, post or drive link" · "https://" · "Video or screenshot" · "Drop the video or screenshot" · "MP4, MOV, JPG or PNG · up to 100 MB" · "What they said" · "Paste the review text or a short summary" · "Save review" · "5★ Google review saved for Dharti Galani · call-back task created" · "Review updated" |
| feedback picker | "Log feedback" · "Dharti Galani · pick what you want to record" · "Check-in" · "After a visit · how it is now · followed · next plan" · "After LHR Full Face" · "Review" · "Paste the link and review text" · "Upload the testimonial" · "Rating, text and screenshot" · "Close" |
| photo details | "Photo details" · "Optional · name, date and body part help you find it later" · "e.g. Left cheek before peel" · "Album" · "optional" · "Visit" · "optional · files the photo under that appointment" · "Not attached" · "Save details" · "Photo details saved" |
| report view | "PDF · shared with the patient on request" · "Added by" · "No notes on this report" · "Download" · "Downloading CBC + Thyroid profile" |
| print preview | "Print preview · Prescription #500" · "Close" · "Print / Save PDF" · "Cresence Skin" · "Adajan, Surat · GSTIN 24ABCDE1234F1Z5" · "Patient" · "Patient ID" · "Age" · "Rx no." · "PRES-500" · "Dosage" · "When" · "Remark" · "Lab reports" · "No notes" · "No lab reports" · "No procedures" · "Follow-up" · "Not scheduled" · "Doctor's signature" · "Thank you for choosing Cresence Skin · +91 74900 20099" |
| visit flow | "Visit in progress" · "Everything for today's visit on one screen" · "Pause" · "✓ Complete visit" · "Check-in & safety" · "Consent signed" · "Treatment can't start without it" · "Before photos taken" · "Auto-paired with after photos" · "Allergies & medicines checked" · "Asked at every visit" · "2 checks left" · "All checks done" · "One tap from a kit, or write one" · "Write prescription" · "Hair fall kit prescribed" · "Record today's session" · "Last settings: Soprano Ice · 10 J · 3 Hz · 810 nm · Type IV" · "Repeat · LHR Full Face · session 2" · "New treatment" · "Remembered for this patient: Soprano Ice · 10 J · 3 Hz · 810 nm · Type IV" · "Uses 1 session of LHR Full Face · B4G7" · "Finish check-in first" · "Session 2 recorded with last settings" · "Invoice" · "Total" · "2 items ready · ₹6,250" · "Covered by package · nothing to bill" · "Nothing to bill yet" · "Create invoice from visit" · "Custom invoice" · "Nothing to bill" · "Invoice #1043 created from the visit" · "Collect & share" · "₹1,500 due" · "Nothing due" · "Collect ₹1,500 · UPI" · "Cash" · "Card" · "₹1,500 received by UPI" · "Share Rx, invoice & photos" · "Sent on WhatsApp" · "Rx, invoice and photos sent to Dharti Galani on WhatsApp" · "Visit completed · 1 package session used · follow-up set for 26 Oct" |
| activity panel | "Send via" · "WhatsApp" · "Instagram" · "Call log" · "Note" · "No Instagram on this contact" · "Message to Dharti on WhatsApp" · "What happened on the call?" · "Note for the team, not sent to Dharti" · "Send WhatsApp" · "Log call" · "Add note" · "Suggest" · "Book an appointment" · "Dharti last wrote here" · "Dharti wrote on WhatsApp · Switch" · "Lead created · 24 Sep · via Instagram" · "Patient · chat only · no lead" · "No conversation yet" · "Sending…" · "Not sent" · "Retry" · "WhatsApp down · replies will queue" · "Nothing of this kind yet" |
| delete confirm | "Delete this prescription?" · "Remove this check-in?" · "Remove this review?" · "Remove this record?" · "It disappears from lists and pickers. You can undo from the toast right after." · "Reason" · "Created by mistake" · "Duplicate" · "No longer needed" · "Other" · "Wrong patient" · "Blurry / retake" · "Added by mistake" · "Plan changed" · "Add a note (optional)" · "Tell the team why (required)" · "Pick a reason to continue" · "Keep it" · "Delete" · "Remove" · "Undo" |
| drawer footer | "Cancel" · "Back" · "Saving…" · "Retry save" · "Not saved · your changes are kept" · "View only · your role can’t change this" |
| errors | "Couldn’t load this list · connection dropped. Showing the last copy." · "Couldn’t save · connection dropped. Everything you entered is still here." · "Retry" |
