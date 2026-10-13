# Screen: Patients

- Route: /patients
- Purpose: Find, filter and open registered patients; register a new patient or edit one.
- Entry points: header section tab and phone tab bar "Patients"; ⌘K "Go to · Patients"; ⌘K action "New patient" (opens the New patient drawer on this screen); "Back to patients" and the "Patients" breadcrumb in the patient file
- Exit points: patient file (row click); New patient / Edit patient drawer; invoice drawer (row "New invoice", see payments.md); receive-payment drawer (row "Collect ₹…", see payments.md); delete confirm
- Access: view — Admin, Doctor, Front desk, Counsellor, Pharmacist, Therapist (Accountant has no access); create and edit — the same roles except Therapist; delete — Admin only. Without create the "New patient" button / floating button is hidden; without edit the row "Edit" action is removed and the drawer opens read-only with the footer line "View only · your role can’t change this"; without delete the row "Delete" action is removed
- Layout shell: app shell
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: sage.

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| Toolbar | h1 "Patients" · view tabs · search · saved views (only once one is saved) · Filters · Columns · "New patient" | one wrapping row, gap 10px 8px, padding 16px 20px (12px 12px when the window is under 1440px wide or 800px tall); left to right: h1 20px/600 with a hairline on its right · view tabs · flexible spacer · search (36px icon square, expands to 150–220px on click or "/") · saved views · Filters (36px) · Columns (36px eye) · "New patient" (36px, dark) | Phone: padding 8px 12px; h1 hidden; spacer hidden; row 1 = search (40px tall, always expanded, grows from 180px, "/" hint hidden) + Filters (40px); row 2 = view tabs at full width, scrolling sideways; saved views after them; Columns hidden; "New patient" becomes a floating pill (52px tall, radius 999px, padding 0 20px 0 16px, 14px text, shadow 0 10px 28px −8px rgb(0 0 0 / .45)) fixed 16px from the right and 74px + safe area from the bottom, above the tab bar. Tablet: as desktop, h1 18px, view tabs shrink to a 120px minimum and scroll sideways | toolbar order is fixed: h1, tabs, spacer, search, saved views, Filters, Columns, New |
| Table card | sticky header row · rows · end line · 44px footer | card filling the rest of the height inside margins 0 20px 20px (0 12px 12px compact), radius 12px, 1px divider border, shadow 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px −8px rgb(0 0 0 / .06) | Phone: edge-to-edge (margin 0, no radius, no side borders, no shadow); header row and footer hidden; rows reflow (see Data display). Tablet: as desktop with low-priority columns folded into the patient cell | header scrolls sideways with the body when "Show all" is on |
| Footer | count text (blank for this list) · fold toggle · bulk bar while rows are selected | 44px, z50, hairline on top; fold toggle on the right ("N columns in rows · Show all" ↔ "Fit to width") only when columns are folded or shown in full | Phone: hidden (no bulk actions, no fold toggle). Tablet: shown with the fold toggle | the "N of N patients" count is suppressed by the table engine |
| Floating layers | Filters popover · Columns dropdown · patient drawer · delete confirm · toasts | anchored popovers and right-edge drawers | Phone: Filters and pickers become bottom sheets; drawers go full width (the delete confirm stays a 334px side drawer); toasts sit 76px + safe area above the bottom | see Popups |

## Data display

Primitive: table (rows at every breakpoint; on phone the rows reflow but stay rows, never cards)

| Field | Value |
| --- | --- |
| Columns (ordered) | ☐ select · ID ("#3508", 22px grey pill, 11.5px) · Patient (32px sage avatar with a 14px "P" badge, name 13px/500, mobile "+91 82006 03212" 12px z500; hover opens the contact card) · Gender (badge "Female" blush / "Male" sky; hidden by default) · Type (one badge per type: Aesthetic lav, Clinical sky, LHR blush, Dental mint, Physio sage, Gynac butter) · Status (badge: New sky, Regular lav, VIP butter, Inactive stone) · Conversion (badge with dot: "T-Converted" sage, "T-Not converted" stone; hidden by default) · Age ("28 yrs" over "27 Oct 1995", or "—"; hidden by default) · Follow-up (badge "Sep 24 · 14:50": blush when past, butter today, sky in the future) · Due (right-aligned "₹2,000" 600 in blush ink, or "—" z500) · Updated (avatar chip: 22px initials + short name "Riya S." in a 28px pill, then "Sep 24 · 15:39" 11.5px) · actions |
| Column widths | 24px · 64px · minmax(200px,1.4fr) · 90px · minmax(120px,1fr) · 96px · 140px · 96px · 150px · 96px · minmax(150px,1fr) · actions sized to its buttons (183px when any row shows Collect, 145px otherwise); gap 12px; with all columns shown the row is at least 1450px wide |
| Sortable | ID, Patient, Type, Status, Conversion, Age, Follow-up, Due, Updated; click cycles ascending → descending → unsorted; the header shows arrow-up-down at 45% opacity, then arrow-up / arrow-down at 100% with a z150 background; tooltip "Sort by <column>". Gender and actions do not sort |
| Row height | comfortable: padding 10px 20px 10px 17px (10px 16px 10px 13px under 1440px wide or 800px tall) plus a 3px left bar in the status ink and a 1px z100 bottom border, ≈53px; compact density: 5px top and bottom. Header row 40px, 11px/600 uppercase, letter-spacing .03em, z500 on z50 |
| Row click | opens the patient file on Clinical notes; the Activity panel opens with it on desktop and tablet and stays closed on phone |
| Row actions | always-visible 32px icon buttons with tooltips: New invoice (receipt) · Collect ₹<due> (wallet, only when the patient owes) · Edit (pencil) · 1px divider · Delete (trash, light-red background, red icon). New invoice opens the invoice drawer for this patient; Collect opens receive-payment with the patient's open invoices; Edit opens the patient drawer; Delete opens the delete confirm. The actions column sticks to the right edge with a box-shadow −8px 0 8px −8px rgb(0 0 0 / .08) on its left |
| Selection | checkbox appears on row hover (always visible on touch screens); header checkbox "Select all" is tri-state; shift-click selects a range. While any row is selected the footer turns into a z900 bulk bar (44px): check tile · "N selected" · "Select all 15" (underlined) · divider · Message (WhatsApp glyph) · Export (file) · Print (printer) · "Esc" key cap · × "Clear selection". Esc clears the selection |
| Mobile behaviour | Phone (390): rows, not cards. Header, footer and checkboxes are hidden. Each row becomes a wrapping flex row (padding 12px 14px 12px 11px plus the 3px status bar, gap 6px 12px): the Patient cell fills the first line and the key column **Due** sits at its right (right-aligned, top-aligned, max 46% wide). Under the name a fold line (11.5px, indented 42px) shows up to 4 values in this order: "● Type Aesthetic", "● Status Regular", "● Follow-up Sep 24 · 14:50" (only when set), "#3508" — the dot takes the badge colour, the label is z500, the value z700/500. Updated folds to nothing; Gender, Conversion and Age stay hidden (Columns is not offered on phone). Row actions drop to their own right-aligned line, each at least 40×36px. Tablet: collapse — columns that do not fit fold into the patient cell's meta line in column order with no 4-value cap. Drop order: ID → Updated → Follow-up → Status → Type → Due. At 820px ID, Updated, Follow-up and Status fold ("#3508 · ● Status Regular · ● Follow-up Sep 24 · 14:50"), footer "4 columns in rows · Show all"; at 1024px ID and Updated fold ("#3508"), footer "2 columns in rows · Show all". "Show all" lays every column out side by side and scrolls sideways; "Fit to width" folds again. Desktop 1440: every visible column fits, nothing folds |
| Pagination | one scrolling list; above 60 rows the list virtualises with a 10-row overscan; an end line "All patients loaded" sits between two hairlines after the last row |

## Forms

### New patient / Edit patient drawer

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | fn | text, half width | First name | "First name" | none | yes (red " *") | ≤60 chars; first letter capitalised as typed; empty blocks Save |
| 2 | ln | text, half | Last name | "Last name" | none | no | ≤60 chars |
| 3 | ph | phone, "+91" prefix box, half | Mobile | "98765 43210" | "primary · WhatsApp" | yes | digits only, up to 10, shown as "98765 43210"; empty blocks Save |
| 4 | ph2 | phone, "+91" prefix box, half | Secondary mobile | "98765 43210" | "10 digits" | no | digits only, up to 10 |
| 5 | addr | textarea (2 rows), full | Address | "Area, city" | none | no | ≤200 chars |
| 6 | br | chips, single, full | Home branch | n/a — chips | none | no | shown only when the clinic has more than one active branch: Adajan (sage) · Vesu (sky) · Varachha (butter); defaults to the current branch |
| 7 | g | chips, single, 4/6 width | Gender | n/a — chips | none | no | Female (blush) · Male (sky) · Other (stone) |
| 8 | dob | date button + 260px calendar popover, 2/6 width | Birth date | "Pick a date" | "Age 28" once a date is set | no | Mo–Su calendar with « ‹ month year › » |
| 9 | types | chips, multi, full | Patient type | n/a — chips | "pick any" | no | Aesthetic (lav) · Clinical (sky) · LHR (blush) · Dental (mint) · Physio (sage) · Gynac (butter); any number can be picked |
| 10 | st | chips, single, half | Status | n/a — chips | none | no | New · Regular · VIP · Inactive; new patients start at New |
| 11 | conv | chips, single, half | Conversion | n/a — chips | none | no | T-Converted · T-Not converted; tapping the picked chip clears it |
| 12 | refN | text, full | Referred by | "Name" | none | no | ≤30 chars |
| 13 | refT | chips, single, full | Referrer type | n/a — chips | none | no | Patient · Doctor · Instagram · Google · Walk-in · Other; tapping the picked chip clears it |
| 14 | fu | text + quick chips, full | Follow-up | "e.g. Oct 08 · 11:00" | quick chips "Tomorrow 10:30" · "In 1 week" · "20 days" · "1 month" (fill "Sep 29 · 10:30", "Oct 05 · 11:00", "Oct 18 · 11:00", "Oct 28 · 11:00") | no | free text |
| 15 | notes | textarea (3 rows), full | Notes | "Anything the team should know" | none | no | ≤1,000 chars |

- Error display: summary on the step card, no inline field errors — Save jumps to the first step that has an empty required field; that step's number turns into a red "!" and its summary reads "Missing: First name, Mobile"; a toast "Add name and mobile" is the fallback.
- Submit: "Create patient" (new) / "Save changes" (edit), dark 36px button at the far right of the footer; never disabled.
- Loading: the button reads "Saving…" for 320–740ms; the form stays editable.
- Success: the drawer closes and the list updates in place (the file does not open). New → toast "Patient #3509 created · onboarding task added" and a task "New patient. Collect consent, DOB and a first photo." due Today. Edit → toast "Priya Shah saved". "Create & add another" (new only, hidden on phone) saves and reopens an empty form.
- Dirty-state guard: none — Cancel, ×, Esc and a backdrop click close at once and drop the edits.

### Quick-add patient (child drawer)

Opened from "＋ New patient · “<query>” — full details" in the invoice drawer's patient picker and from the appointment form's "Create patient record" (see payments.md, appointments.md). Width min(680px, 100vw − 56px), sage.

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | fn | text | First name | "e.g. Priya" | none | yes | prefilled with the first word typed in the picker; empty → toast "Add a first name" |
| 2 | ln | text | Last name | "e.g. Shah" | none | no | prefilled with the remaining words |
| 3 | ph | phone, "+91" prefix | Mobile | "98765 43210" | "10 digits" | yes | fewer than 10 digits → toast "Enter a 10-digit mobile" |
| 4 | g | chips, single | Gender | n/a — chips | none | no | Female (blush) · Male (sky) · Other (lav) |
| 5 | dob | text, third | Date of birth | "DD/MM/YYYY" | none | no | free text |
| 6 | addr | textarea, full | Address | none | none | no | ≤200 chars |
| 7 | types | chips, multi, full | Patient type | n/a — chips | "pick any" | no | same six types, picked chips show a check; saved as Aesthetic if none picked |
| 8 | consent | chips, multi, full | Consent | n/a — chips | "what was signed" | no | Data (sage) · Photos (sage) · Marketing (stone) |
| 9 | files | upload drop zone (96px, dashed), full | First photos | "Take or drop photos" | "before photos · filed under today’s visit"; zone hint "JPG or PNG · up to 15 MB each" | no | images only, ≤15 MB each; larger files skipped with toast "1 file(s) over 15 MB skipped" |
| 10 | notes | textarea, full | Notes | "Reason for visit, allergies, anything the team should know" | none | no | ≤1,000 chars |

- Error display: Save first opens the step with an empty required field (red "!" and "Missing: First name, Mobile"); then toasts "Add a first name" (blank after trimming) and "Enter a 10-digit mobile" (fewer than 10 digits).
- Submit: "Create patient", dark, far right; footer secondary button reads "Back".
- Loading: "Saving…" 320–740ms.
- Success: the child drawer closes, the parent drawer gets the new patient picked; toast "Priya Shah registered as patient #3509" plus " · 2 photos filed" when photos were added.
- Dirty-state guard: none — "Back", ×, Esc and backdrop close at once.

## Popups

### New patient / Edit patient drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, full height, over a rgb(9 9 11 / .45) backdrop |
| Shape (mobile) | Phone: full-screen drawer (width 100%, no shadow, no left border); the floating × moves inside to the top-right corner (8px from the edges, 44×44, transparent, 22px glyph); the header keeps 56px of right padding for it; the footer wraps — buttons share the row at 44px tall and the summary line moves below them, centred, 12px; footer padding 10px 12px plus the safe area. Tablet: as desktop |
| Trigger | "New patient" (toolbar button or phone floating button); ⌘K "New patient"; row action "Edit"; "Edit contact" in the patient file |
| Size | min(680px, 100vw − 56px); header 76px (60px on phone), padding 14px 24px (12px 20px compact, 10px 16px phone); body padding 20px 24px 28px (16px 20px 20px compact, 14px 16px 20px phone) |
| Dismiss | backdrop click, Esc, floating × (36px white tile, radius 12px, shadow 0 4px 14px rgb(0 0 0 / .18), 14px left of the panel at top 14px), footer "Cancel" |
| Header | title "New patient" / "Edit patient" (18px/600) with a "#3508" tag on edit; subline "Creates or updates the contact too" (13px z500). Below it a badge row (each type, the status, "28 yrs") and, on new only, "QUICK FILL" with dashed ⚡ chips "Walk-in today" (butter), "Referred by patient" (lav), "From Instagram" (blush), "LHR patient" (blush) |
| Footer | left: live summary "Priya Shah · Aesthetic · +91 98765 43210" (or "New patient"), 12.5px z500, one line; right, in order: "Delete" (red, edit only) · "Cancel" (outline) · "Create & add another" (outline, new only, not on phone) · "Not saved · your changes are kept" (red, only after a failed save) · "Create patient" / "Save changes" (dark) |
| Multi-step | yes — 2 accordion step cards (see Multi-step flow) |
| Initial focus | none — the prototype moves no focus into the drawer |

### Quick-add patient (child drawer)

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, stacked above the drawer that opened it |
| Shape (mobile) | Phone: full-screen drawer with the × inside at the top-right (44×44) and the wrapping footer, as above. Tablet: as desktop |
| Trigger | "＋ New patient · “<query>” — full details" in a patient picker; "Create patient record" in the appointment form |
| Size | min(680px, 100vw − 56px) |
| Dismiss | backdrop click, Esc, floating ×, footer "Back" (returns to the parent drawer) |
| Header | title "New patient"; subline "What the clinic needs before a visit is completed" |
| Footer | "Back" (outline) · "Create patient" (dark), right-aligned; no summary line |
| Multi-step | yes — 2 accordion step cards |
| Initial focus | none — no autofocus |

### Filters popover

| Field | Value |
| --- | --- |
| Shape (desktop) | popover under "Filters", right-aligned, 6px gap; flips up or left to stay inside the window |
| Shape (mobile) | Phone: bottom sheet — full width, max-height 82%, top corners 16px, slides up; transparent backdrop (no dim). Tablet: as desktop |
| Trigger | "Filters" (shows a count badge once filters apply; a joined "×" "Clear all filters" appears beside it) |
| Size | 340px wide (max 100vw − 16px), max-height 100vh − 160px; body padding 12px 14px 14px, sections 14px apart |
| Dismiss | backdrop click (unapplied picks are dropped); "Apply filter" applies and closes |
| Header | "Filters" (13.5px/600) left · "Clear all" (12px, z500) right |
| Footer | left "Save as view" / "Saved as view" (only once something is picked) · right "Apply filter" (primary, 32px) |
| Multi-step | no |
| Initial focus | none — chips only, nothing to focus |

Sections (11px/600 uppercase label, 24px tinted chips): one per badge column that has 2–10 distinct values in the current rows — Gender (Female, Male), Type (Aesthetic, Clinical, LHR…), Status (New, Regular, VIP, Inactive), Conversion (T-Converted, T-Not converted) — then "Created": Any · Today · Yesterday · Last 7 days · Last 30 days · This month · Custom range, and "Follow-up date": Any · Overdue · Today · Tomorrow · Next 7 days · Not set · Custom range. "Custom range" adds "From" / "To" date pickers (32px). A picked chip gets a 1.5px ring in its ink.

### Columns dropdown

| Field | Value |
| --- | --- |
| Shape (desktop) | dropdown list under the eye button, right-aligned |
| Shape (mobile) | Phone: not offered — the Columns button is hidden. Tablet: as desktop |
| Trigger | eye button (tooltip "Columns · 6 of 9 shown"; a dark count badge shows how many are hidden) |
| Size | min 260px wide; search box "Search columns" |
| Dismiss | backdrop click, Esc |
| Header | search field only |
| Footer | "6 of 9 shown" |
| Multi-step | no |
| Initial focus | the search field |

Options: "Show all columns" (sub "Recommended set hides 3", or "Tap again for the recommended set" when all are on) then every column except ID with a checkbox. The recommended set hides Gender, Conversion and Age.

### Delete confirm

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge (role alertdialog), over a rgb(9 9 11 / .32) backdrop |
| Shape (mobile) | Phone: stays a side drawer min(480px, 100vw − 56px) — 334px at 390 with 56px of the list visible on the left; its × moves inside to the top-right (44×44). Tablet: as desktop |
| Trigger | row "Delete"; "Delete" in the Edit patient footer |
| Size | min(480px, 100vw − 56px) |
| Dismiss | backdrop click, ×, "Keep it" |
| Header | "Delete this patient?" (opened from the patient file's Edit patient drawer it reads "Delete this record?"), then the record in a grey pill — the patient's name from a row, the drawer's summary line from the drawer — then "It disappears from lists and pickers. You can undo from the toast right after." |
| Footer | hint left ("Pick a reason to continue" / "Add a short note for “Other”") · "Keep it" · "Delete" (red; inert until a reason is picked) |
| Multi-step | no |
| Initial focus | none |

Reasons (radio chips): "Created by mistake" · "Duplicate" · "No longer needed" · "Other"; note box "Add a note (optional)", which becomes "Tell the team why (required)" for Other. After Delete: toast "Priya Shah removed" with "Undo".

## Multi-step flow

### New patient / Edit patient drawer

- Steps (ordered): 1 "Contact & personal" — First name, Last name, Mobile, Secondary mobile, Address, Home branch, Gender, Birth date → 2 "Clinic, referral & follow-up" — Patient type, Status, Conversion, Referred by, Referrer type, Follow-up, Notes.
- **Sequence varies by input?** no — the same two steps for new and edit, every role and every viewport. Inputs only change content: Home branch appears only with more than one active branch; the Quick fill chips appear only on new and set fields as follows — "Walk-in today" → Status New, Referrer type Walk-in, Follow-up cleared; "Referred by patient" → Referrer type Patient, Status New; "From Instagram" → Referrer type Instagram, Status New; "LHR patient" → Patient type LHR only, Status New.
- Progress indicator: a 24px numbered circle in each step card's head — open step in sage ink, earlier steps green, later steps z200, a step with a missing required field red with "!".
- Navigation: "Next: Clinic, referral & follow-up →" (32px outline, right-aligned) closes step 1 and opens step 2; tapping a step head opens it (hint "Edit" on earlier steps, "Open" on later ones); there is no Back button.
- Per-step validation: does not block "Next"; Save opens the first step with a missing required field instead of saving.
- Edit mode: prefilled, same two steps, opens on step 1; a closed step shows a peek grid (auto-fit, 150px minimum, up to 8 items: 10.5px uppercase label over the value as a tinted pill, or a dashed "Empty").

### Quick-add patient

- Steps (ordered): 1 "Patient" — First name, Last name, Mobile, Gender, Date of birth, Address → 2 "Clinic" — Patient type, Consent, First photos, Notes.
- **Sequence varies by input?** no — always these two steps.
- Progress indicator: numbered circles in the step heads, as above.
- Navigation: "Next: Clinic →"; heads reopen a step; footer "Back" leaves the child drawer.
- Per-step validation: does not block "Next"; Save opens the first step with a missing required field, then checks the first name and a 10-digit mobile.
- Edit mode: n/a — quick-add only creates.

## Preview / animated panels

| Field | Value |
| --- | --- |
| Surfaces | n/a — this screen has no preview or animated panel |
| Switching | n/a — no preview panel |
| Surface per input type | n/a — no preview panel |
| Frame sequence | n/a — no animated sequence |
| Frame durations | n/a — no animated sequence |
| Progressive reveal | n/a — no animated sequence |
| Static fallback | n/a — no preview panel |

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| View tab "All" | users | 14 | no |
| View tab "In clinic today" | house | 14 | no |
| View tab "With dues" | wallet | 14 | no |
| View tab "Follow-up due" | bell | 14 | no |
| View tab "Recall" | refresh-cw | 14 | no |
| Search | search | 15 | no — the input is labelled "Search patients" |
| Filters | list-filter | 15 | no |
| Columns | eye | 16 | yes — aria-label "Show or hide columns" |
| New patient (button and phone floating button) | plus | 16 | no |
| Column sort | arrow-up-down / arrow-up / arrow-down | 12 | no — the header carries aria-sort |
| Row "New invoice" | receipt | 13 | yes — aria-label "New invoice" |
| Row "Collect ₹…" | wallet | 13 | yes — aria-label "Collect ₹2,000" |
| Row "Edit" | pencil | 13 | yes — aria-label "Edit" |
| Row "Delete" | trash | 13 | yes — aria-label "Delete" |
| Checkbox mark | check / minus | 12 | no |
| Bulk "Message" | `wa` — WhatsApp brand glyph, not Lucide | 14 | no |
| Bulk "Export" | file | 14 | no |
| Bulk "Print" | printer | 14 | no |
| Bulk clear | x | 14 | yes — aria-label "Clear selection" |
| Empty state (no filters / with filters) | users / search | 18 | no |
| Empty-state button | plus | 14 | no |
| Fold toggle ("Show all" / "Fit to width") | maximize-2 / minimize | 14 | no |
| Picker chevrons (Birth date, date ranges) | chevron-down | 14 | no |
| Picked chip in quick-add multi-select fields | square-check | 12 | no |

Library: Lucide (inline paths) · Weight: 1.6px stroke for registry icons; 2px for chevron-down, check, minus, x and the sort arrows.

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Search expand / collapse | flex-basis, max-width, min-width (36px ↔ 150–220px) | 220ms | cubic-bezier(.2,.8,.2,1) |
| View tab | background, color | 150ms | ease |
| Filters popover, Columns dropdown, calendar | opacity 0→1, translateY −4px→0 (+4px when flipped up), scale .985→1 | 160ms | cubic-bezier(.2,.8,.2,1) |
| Phone bottom sheets (Filters, pickers) | translateY 28px→0, opacity 0→1 | 260ms | cubic-bezier(.32,.72,0,1) |
| Drawer panel | transform translate3d(100%,0,0)→0 | 340ms | cubic-bezier(.32,.72,0,1) |
| Drawer backdrop | background-color rgb(9 9 11 / 0)→.45 | 340ms | cubic-bezier(.32,.72,0,1) |
| Step card body | opacity 0→1, translateY −4px→0 | 240ms | cubic-bezier(.2,.8,.2,1) |
| Delete-confirm × | opacity 0→1, scale .9→1, after a 200ms delay | 200ms | cubic-bezier(.2,.8,.2,1) |
| Row hover, header hover | background | 120ms | ease |
| Row checkbox reveal | opacity 0→1 | 120ms | ease |
| Bulk bar | translateY 100%→0 | 220ms | cubic-bezier(.32,.72,0,1) |
| Skeleton shimmer | background-position 100%→−100% | 1100ms, infinite | ease |

Reduced-motion: every animation and transition runs .01ms with a 0s delay and one iteration — drawers, sheets and popovers appear in place, the skeleton shimmer stops; scroll-behavior is auto.

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Patients table | in-place skeleton: each text run becomes a .72em z150 bar shimmering at 1.1s, avatars become grey discs, icons hide; 260–560ms when the screen opens (also on returning from a patient file), 160–380ms after a search (300ms debounce) or "Apply filter"; view and sort changes re-render at once without a skeleton | no filters: 96px illustration (dashed ring, sage disc, white tile with users icon) · "No patient matches" (15px/600) · "Nothing here yet. Try another tab or search." (12.5px); with filters: search icon · "No matches" · "Nothing matches these filters. Clear them to see everything again." · "Clear filters" button | toast "Couldn’t load this list · connection dropped. Showing the last copy." with "Retry" for 9s; the rows on screen stay |
| Filters popover | none — applied locally | a column only appears when it has 2–10 values; Created and Follow-up date are always there | n/a — nothing is fetched |
| Columns dropdown | none | n/a — always lists 9 columns | n/a — local |
| Patient drawer | in-place skeleton over the body for 200–440ms when it opens; "Saving…" on the button for 320–740ms | n/a — a form | footer "Not saved · your changes are kept", button "Retry save", toast "Couldn’t save · connection dropped. Everything you entered is still here." with "Retry" for 9s |
| Quick-add drawer | as the patient drawer | n/a — a form | as the patient drawer; plus toasts "Add a first name", "Enter a 10-digit mobile", "1 file(s) over 15 MB skipped" |
| Delete confirm | none — local | n/a — confirm only | n/a — local; "Undo" in the toast restores the row |

## Copy

| Key | Exact string |
| --- | --- |
| title | "Patients" |
| views | "All" · "In clinic today" · "With dues" · "Follow-up due" · "Recall" |
| search placeholder | "Name, mobile or #ID" |
| search label / tooltip | "Search patients" / "Search · press /" |
| filters button | "Filters" |
| clear filters | "Clear all filters" |
| filters popover | "Filters" · "Clear all" · "Apply filter" · "Save as view" · "Saved as view" · "From" · "To" |
| filter sections | "Gender" · "Type" · "Status" · "Conversion" · "Created" · "Follow-up date" |
| created chips | "Any" · "Today" · "Yesterday" · "Last 7 days" · "Last 30 days" · "This month" · "Custom range" |
| follow-up chips | "Any" · "Overdue" · "Today" · "Tomorrow" · "Next 7 days" · "Not set" · "Custom range" |
| saved views | group "Saved views" · chip tooltip "Apply view" · "Remove view" · toasts "View “Female + Aesthetic” saved", "View removed" |
| columns | "Show or hide columns" · "Columns · 6 of 9 shown" · "Show all columns" · "Recommended set hides 3" · "Tap again for the recommended set" · "Search columns" · "6 of 9 shown" |
| primary | "New patient" |
| headers | "ID" · "Patient" · "Gender" · "Type" · "Status" · "Conversion" · "Age" · "Follow-up" · "Due" · "Updated" |
| sort tooltip | "Sort by Due" |
| row actions | "New invoice" · "Collect ₹2,000" · "Edit" · "Delete" |
| selection | "Select all" · "Select" · "3 selected" · "Select all 15" · "Message" · "Export" · "Print" · "Esc" · "Clear selection · Esc" |
| bulk toasts | "WhatsApp drafted for 3 people" · "3 rows exported as CSV" · "Preparing 3 rows for print" |
| end of list | "All patients loaded" |
| fold toggle | "4 columns in rows · Show all" · "Fit to width" · tooltips "Show every column side by side (scrolls sideways)" / "Fold extra columns into each row" |
| empty | "No patient matches" · "Nothing here yet. Try another tab or search." |
| empty, filtered | "No matches" · "Nothing matches these filters. Clear them to see everything again." · "Clear filters" |
| list error | "Couldn’t load this list · connection dropped. Showing the last copy." · "Retry" |
| drawer titles | "New patient" · "Edit patient" |
| drawer subline | "Creates or updates the contact too" |
| quick fill | "Quick fill" · "Walk-in today" · "Referred by patient" · "From Instagram" · "LHR patient" |
| steps | "Contact & personal" · "Clinic, referral & follow-up" · "Next: Clinic, referral & follow-up" · "Edit" · "Open" · "Missing: First name, Mobile" · "Not filled yet" · "Empty" |
| mobile hint | "primary · WhatsApp" |
| age hint | "Age 28" |
| type hint | "pick any" |
| follow-up quick chips | "Tomorrow 10:30" · "In 1 week" · "20 days" · "1 month" |
| drawer footer | "Delete" · "Cancel" · "Create & add another" · "Create patient" · "Save changes" · "Saving…" · "Retry save" · "Not saved · your changes are kept" |
| read-only footer | "View only · your role can’t change this" |
| validation | "Add name and mobile" |
| created | "Patient #3509 created · onboarding task added" |
| onboarding task | "New patient. Collect consent, DOB and a first photo." |
| saved | "Priya Shah saved" |
| save error | "Couldn’t save · connection dropped. Everything you entered is still here." |
| quick-add subline | "What the clinic needs before a visit is completed" |
| quick-add steps | "Patient" · "Clinic" · "Next: Clinic" |
| quick-add hints | "what was signed" · "before photos · filed under today’s visit" · "Take or drop photos" · "JPG or PNG · up to 15 MB each" |
| quick-add toasts | "Add a first name" · "Enter a 10-digit mobile" · "Priya Shah registered as patient #3509 · 2 photos filed" |
| quick-add footer | "Back" · "Create patient" |
| delete confirm | "Delete this patient?" · "It disappears from lists and pickers. You can undo from the toast right after." · "Reason" · "Created by mistake" · "Duplicate" · "No longer needed" · "Other" · "Add a note (optional)" · "Tell the team why (required)" · "Pick a reason to continue" · "Add a short note for “Other”" · "Keep it" · "Delete" |
| deleted | "Priya Shah removed" · "Undo" |
