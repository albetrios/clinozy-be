# Screen: Today

- Route: /today (the visit sheet has no URL of its own in the prototype; it opens over /today)
- Purpose: The clinic floor now — who is enquiring, arriving, waiting, with the doctor, in treatment, at checkout and at the pharmacy — with the desk's work queue beside it and the full-screen visit sheet for the person in front of you.
- Entry points: "All sections" list (header compass button or key "G"; phone: bottom tab bar "More" → All sections bottom sheet), key "1" (Today is the first section), a pinned header tab / phone tab-bar slot once the user pins Today (it is not pinned by default — default pins are Appointments, Leads, Patients, Payments)
- Exit points: Leads with the enquiry's lead selected ("Book", card name) · patient file, Timeline tab (card name) · lead drawer (card name, person without a patient record) · visit sheet (Consult & Rx / Treatment / Checkout) · Medical › Sales with that sale selected ("Dispense") · Leads with the New lead drawer open ("New booking") · command menu ("Walk-in") · Appointments (Work queue outcome "Reschedule") · patient file from the visit sheet ("Full profile")
- Access: every role — Today has no row in Users › Roles & access, so it is never hidden. Role focus dims the lanes outside the signed-in user's roles to 60% opacity (roles add up): Front desk → Enquiries, Arriving, Waiting, Checkout · Doctor → Waiting, With doctor · Therapist → Treatment · Counsellor → With doctor, Checkout · Pharmacist → Pharmacy · Accountant → Checkout · Marketing → Enquiries · Owner → none dimmed
- Layout shell: app shell
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: butter.

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| Page grid | main column (section) + right aside | Full-height grid `minmax(0,1fr) 312px`; each column scrolls on its own. Main column padding 16px 22px 12px, gap 14px, flex column | Phone: one column (`minmax(0,1fr)`), rows auto/auto; the aside drops under the main column and the whole grid scrolls as one page (overflow-y auto, thin scrollbar, overflow-x hidden) — no nested scrollers; main column padding 14px 12px 10px. Tablet: as desktop (two columns, aside 312px — main column 508px at 820, 712px at 1024) | No h1 on this screen (the greeting is the title); on phone the header shows the section chip "Today" (butter) |
| Greeting row | greeting · pulse line · spacer · "New booking" · "Walk-in" | One row, baseline-aligned, gap 14px, wraps when narrow; buttons pushed right | Phone: wraps to three lines — greeting, pulse line, then the two buttons left-aligned. Tablet: as desktop | Greeting 23px/600 heading font, −0.02em, line-height 1.1; pulse 13px tabular, neutral-700. Buttons: padding 7px 14px, 13px, radius 8px, 1px divider border, transparent fill, hover accent-100; "New booking" weight 500 + shadow-sm, "Walk-in" weight 400 |
| Lane tiles | 7 tiles in fixed order: Enquiries · Arriving · Waiting · With doctor · Treatment · Checkout · Pharmacy | Grid `repeat(auto-fill, minmax(104px, 1fr))`, gap 8px — 1440: 9 tracks of ≈113px (7 tiles + 2 empty tracks); 1024: 6 per row + 1; 820: 4 per row + 3 | Phone: one horizontal snap-scroll strip — flex row, `scroll-snap-type: x mandatory`, scrollbar hidden, touch momentum; tiles fixed 128px wide (snap to their start), gap 8px; the strip bleeds to the screen edges (−12px side margins, 12px inner side padding, 2px bottom padding). At 390 three tiles show, the third cut off. Tablet: grid as desktop | See Data display › Lane tiles |
| Selected lane panel | lane name · count · visit cards (or the empty line) | Fills the rest of the main column (flex 1, min-height 150px); its card grid scrolls inside | Phone: grows with its cards (the page scrolls, not the panel); one card per row. Tablet: as desktop, 2 cards per row | Border 1px lane line, fill lane bg, radius 8px, padding 12px 14px, gap 8px. Header: lane name 14px/600 heading font in lane ink, −0.02em + count 12px neutral-700, baseline-aligned, gap 10px |
| Work queue aside | header (title, count, Mine / Everyone) + task cards | 312px column, 1px left hairline, neutral-100 fill; header padding 16px 16px 10px; list padding 0 12px 12px, gap 8px, scrolls on its own | Phone: full width under the lane panel, 1px top hairline instead of the left one, the list flows with the page (no own scroll). Tablet: as desktop | Title "Work queue" 16px/600 heading font; sub 12px neutral-700. Mine / Everyone: one joined control, 1px divider border, radius 6px, two 12px buttons padding 4px 10px, selected fill zinc-100 |

## Data display

Primitive: cards — lane tiles (summary), visit cards (inside the selected lane), work-queue cards (aside). No table on this screen.

### Lane tiles

| Field | Value |
| --- | --- |
| Grid | Desktop/tablet: `repeat(auto-fill, minmax(104px, 1fr))`, gap 8px (1440: 9 tracks; 1024: 6 per row; 820: 4 per row). Phone: horizontal snap strip, 128px tiles |
| Anatomy | Button, padding 10px 12px, gap 6px, border 1.5px (selected: lane ink; otherwise lane line), radius 8px, fill lane bg, left-aligned, `aria-pressed` true on the selected tile: (1) label 12px lane ink · (2) count 26px/600 heading font, tabular, −0.02em, line-height 1 · (3) faces row (min-height 22px): up to 4 initials discs 22px (1.5px border in the lane bg, page fill, lane ink, 9.5px), overlapping by 2px, then "+N" 11px neutral-700 with 9px left margin when more than 4 · (4) hint 11px neutral-700 tabular |
| Meta line | Hint: Enquiries "oldest HH:MM" · Arriving "next HH:MM" · every other lane "since HH:MM" (earliest card time in the lane, 24-hour); a lane with 0 people shows "—" |
| Truncation | none — labels are fixed and short; faces stop at 4 + "+N" |
| Actions | Click selects the lane and shows it in the panel below; hover sets the border to the lane ink (no transition). The selection lasts for the session (not persisted). Default selection: the first lane in the signed-in roles' focus that has people → else the first lane with people → else Enquiries |
| Mobile | Phone: 128px tiles in the snap strip, same anatomy. Tablet: as desktop |

| Lane | Tone | Who is in it | Card action | What the action does |
| --- | --- | --- | --- | --- |
| Enquiries | lav | open enquiries (leads) | "Book" | Opens Leads with that lead selected |
| Arriving | sky | booked for today, not checked in | "Check in" | Moves the card to Waiting; toast "<name> checked in · Dr. queue and room notified" + "Undo" |
| Waiting | butter | checked in | "Send in" | Moves the card to With doctor; toast "<name> sent in to the doctor" + "Undo" |
| With doctor | blush | in consult | "Open consult" | Opens the visit sheet on Consult & Rx |
| Treatment | sage | in a session | "Open session" | Opens the visit sheet on Treatment |
| Checkout | butter | ready to pay | "Checkout" | Opens the visit sheet on Checkout |
| Pharmacy | mint | prescription to dispense | "Dispense" | Opens Medical › Sales with that sale selected |

### Visit cards (selected lane)

| Field | Value |
| --- | --- |
| Grid | `repeat(auto-fill, minmax(210px, 1fr))`, gap 8px, top-aligned: 1440 → 4 per row; 1024 and 820 → 2 per row; 390 → 1 per row |
| Anatomy | Card: neutral-100 fill, 1px divider border, radius 8px, padding 10px, gap 6px. (1) Open area (no chrome, gap 2px): name 13.5px/500 left + time 11.5px tabular neutral-700 right; service line 12px neutral-800 · (2) flag pills: 11px, padding 1px 7px, radius 999px, flag tone fill + ink, wrap with 4px gap · (3) action button, full width, padding 5px 8px, radius 8px, 1px lane-line border, lane bg fill, lane ink, 12.5px/500 |
| Meta line | Line 1 "<name>" … "<HH:MM>"; line 2 the visit text verbatim, e.g. "Hydrafacial · Room 2", "Consult · Dr. Mavani", "Laser · GentleMax · Kiran", "Acne scars — asks price, Saturday?" |
| Truncation | none — name, service and flags wrap |
| Actions | Name/service area: an enquiry opens Leads with that lead selected; anyone else opens their patient file (Timeline tab), else their lead drawer, else toast "No patient record yet for <name>". Action button: per the lane table above |
| Mobile | Phone: one card per row at full panel width; the panel grows with its cards. Tablet: 2 per row |

Flags (prototype data, each with its tone): "WhatsApp" lav · "New lead" lav · "Instagram" lav · "Confirmed" sage · "First visit" sky · "Pack 2 left" sage · "Unconfirmed" blush · "Pack 3 left" sage · "Due ₹1,200" butter · "Sulfa allergy" blush · "Waiting 6 min" butter · "In room 9 min" blush · "Session 4 of 6" sage · "₹3,717 to pay" butter · "Rx approved 10:05" mint.

### Work queue cards (aside)

| Field | Value |
| --- | --- |
| Grid | One column, gap 8px; cards 288px wide on desktop/tablet (312px aside − 24px padding); phone full width − 24px (366px at 390) |
| Anatomy | Card: page fill, 1px divider border, radius 8px, padding 10px, gap 6px. Row 1: kind pill (11px, padding 1px 8px, radius 999px, kind tone) left · due (11.5px tabular; blush ink when overdue, else neutral-700) right. Then: who 13px/500 · why 12px neutral-800, line-height 1.4 · "Owner: <name>" 11.5px neutral-700 · outcome buttons (wrap, gap 5px; 12px, padding 4px 9px, 1px divider border, radius 8px, transparent; hover accent-100 fill + accent-400 border). Once closed: the outcome buttons are replaced by "✓ <result>" (12px, green ink) and the card drops to 70% opacity |
| Meta line | who "<name> · <context>" (e.g. "Priti Soni · 11:30 today"); due "Due 10:50" · "Overdue 40 min" · "Today" · "This week" · "Wed 30 Sep" · "Tomorrow" · "Due 12:00" · "Due 11:00" |
| Truncation | none — every line wraps |
| Actions | Outcome button → the task closes with that result; toast "<name>: <result>" + "Undo" (5.2 s; Undo reopens it). "Reschedule" also navigates to Appointments. Header toggle: "Mine" (default — tasks owned by the signed-in user) / "Everyone". The header count "<N> open" counts every open task regardless of the toggle |
| Mobile | Phone: the aside sits under the main column, cards full width, the list scrolls with the page. Tablet: as desktop |

Kinds and tones: "Confirm" sky · "No-show" blush · "Payment due" butter · "Feedback" sage · "Recall" lav · "Call back" lav. The Work queue is Today's own list (seeded separately); it is not the rule-driven queue of the Tasks screen.

## Forms

Today itself has no form. The visit sheet carries three working areas.

### Visit sheet · Consult & Rx

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | complaint | text input, read-only in the prototype (maxLength 120) | "Complaint" | none — prefilled "Review of dark patches; wants to continue laser" | none | no | ≤ 120 chars |
| 2 | findings | text area (draft box, min-height 54px) | "Findings" | "Type, or use “Dictate a draft”. Drafts stay marked until you edit and sign." | "Dictate a draft" (lav button, top-right of the column) shows "Listening… drafting" for 1200 ms, then fills a dashed lav draft box headed "Draft from dictation · edit before signing" | no | none |
| 3 | diagnosis | multi-select chips (12.5px, padding 4px 10px, radius 8px; selected = blush) | "Diagnosis" | none | Options: "Melasma" · "Post-acne marks" · "Acne vulgaris" · "Hair reduction review"; "Melasma" preselected | no | none |
| 4 | plan | text input, read-only in the prototype (maxLength 120) | "Plan" | none — prefilled "Continue laser 4/6 today. Review in 8 weeks." | none | no | ≤ 120 chars |
| 5 | prescription lines | line list: number · medicine (13px/500) · "<dose> · qty <qty> · <duration>" (12px) · review pill toggle "Review" (blush) ↔ "✓ Reviewed" (sage) · "Remove" button | "Prescription" | empty state box "No medicines yet. Copy the last prescription (each line must be reviewed) or add below." | "Copy 12 Aug prescription" (outline, top-right) adds 3 unreviewed lines; "Add" chips "+ Tranexamic acid 250 mg" · "+ Ceramide moisturiser" · "+ Hydroquinone 2% cream" add a line with dose "Doctor to set", qty 1, duration "—" | yes — at least 1 line | every line must be "✓ Reviewed" before Approve |
| 6 | print language | single-select pills (12px, padding 3px 10px, radius 999px; selected = butter) | "Print in" | none | "English" (default) · "ગુજરાતી" · "हिंदी" | yes (preset) | none |

- Error display: no error copy — Approve stays at 55% opacity with a divider border and reads "Review <N> line(s) first" (N = unreviewed lines) or "Review the line(s) first" (no lines yet); clicks are ignored.
- Submit: "Approve · print · send to pharmacy" — full-width button at the bottom of the Prescription column (padding 10px 14px, 14px/500, butter fill, accent border once ready).
- Loading: the button reads "Approving…" for 750 ms; the tab row's right label reads "Saving…".
- Success: the sheet closes; the card moves to its next lane (Treatment for a visit with a session, otherwise Checkout) and joins the pharmacy queue; toast "Prescription approved for <name> · printed in <language> · sent to pharmacy · moved to <lane key>" (e.g. "moved to checkout").
- Dirty-state guard: none — closing the sheet keeps the Rx lines and the dictation draft in memory until Approve.

### Visit sheet · Treatment

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | fluence | text input 90px, read-only in the prototype (maxLength 20) | "Fluence" row, "Today" column | none — prefilled "18 J/cm²" | "Session 3" column shows "18 J/cm²" | no | ≤ 20 chars |
| 2 | spot size | text input 90px, read-only (maxLength 20) | "Spot size" row | none — prefilled "15 mm" | Session 3: "15 mm" | no | ≤ 20 chars |
| 3 | pulse | text input 90px, read-only (maxLength 20) | "Pulse" row | none — prefilled "3 ms" | Session 3: "3 ms" | no | ≤ 20 chars |
| 4 | areas treated | multi-select pills (12px, padding 3px 10px, radius 999px; selected = sage) | "Areas treated" | none | "Upper lip" · "Chin" · "Jawline" · "Cheeks" · "Neck"; Upper lip and Chin preselected | no | none |

- Error display: none — the action cannot fail in the prototype.
- Submit: "Complete session 4 of 6" — full-width sage button (padding 10px 14px, 14px/500) with the note "Uses exactly one pack session and creates a day-2 feedback call. Cancelled or wrong sessions are reversed with a reason, never deleted." under it.
- Loading: "Recording…" for 750 ms.
- Success: the button and note are replaced in place by "✓ Session 4 recorded · 2 left · feedback call Tue 29 Sep (Kiran) · Reverse with reason" (sage box; "Reverse with reason" is a link); the card moves to Checkout; a Work queue task "Feedback" — "<name> · laser 4/6", "Day-2 check on redness. Created by session completion.", due "Tue 29 Sep", owner Kiran, outcomes "All well" · "Concern" — is added; toast "Session 4 of 6 recorded once for <name> · 2 left · feedback task for Tue". The sheet stays open — and in the prototype the toast (z 50) sits under the sheet (z 85), so it is only seen after the sheet closes.
- Dirty-state guard: none.

### Visit sheet · Checkout (2 · Payment)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | mode | single-select buttons, equal width (padding 8px 0, 13px, radius 8px; selected = butter) | none (row of "UPI" · "Cash" · "Card" · "Split") | none | "UPI" preselected; "Split" has no split rows in the prototype | yes (preset) | none |
| 2 | amount | numeric text input (inputmode numeric, maxLength 9, 18px tabular, padding 9px 12px) | "Amount received (₹)" | none — prefilled "3717" | "Balance after this payment: ₹<balance>" under it; when 0 < amount < ₹3,717: "Partial payment. The balance becomes a due with a reminder task." (12px, butter ink) | yes | digits only are read; amount ≤ 0 → Receive does nothing; amount above the total → balance shows ₹0 (not blocked) |

- Error display: none — an invalid amount silently blocks the button.
- Submit: "1 · Bill" first — "Create bill" (outline, full width) → "Creating…" 750 ms → "✓ INV/26-27/0412 finalised. Changes now go through Cancel bill or Credit note." (links). Only then does "2 · Payment" show its fields; the primary "Receive ₹<amount> by <mode>" (full width, padding 11px 14px, 14px/500, primary fill) sits under them, with "Shown as received only after the server confirms. Pressing twice cannot record two payments. Receipt prints and goes on WhatsApp." below.
- Loading: "Waiting for server…" for 750 ms, then 900 ms more before the sheet closes; the tab row reads "Saving…".
- Success: the sheet closes; the card moves to Pharmacy when the visit has a prescription, otherwise it leaves the floor; toast "₹<amount> received by <mode> · RCT/26-27/0388 · receipt sent on WhatsApp".
- Dirty-state guard: none — reopening resets the bill to draft and the amount to 3717.

## Popups

### Visit sheet

| Field | Value |
| --- | --- |
| Shape (desktop) | full page — a fixed white overlay over the whole viewport (header included), z 85, no backdrop; a transparent full-height "Close visit" button fills the space left of the panel (a 12px strip at the left edge) |
| Shape (mobile) | Phone: the same full-screen overlay with no phone restyle — the desktop column grids stay (History `1fr 300px`, Consult & Rx `240px 1fr 1.15fr`, Treatment `1fr 1.1fr`, Checkout `1.2fr 1fr`), so at 390px the Consult note and Prescription columns shrink to ≈70–80px with words breaking, History keeps its 300px aside, the sheet overflows 30px sideways and the header chips wrap one per line. Tablet: as desktop (fits at 820 and 1024) |
| Trigger | Lane-card actions "Open consult" (With doctor → Consult & Rx), "Open session" (Treatment → Treatment), "Checkout" (Checkout → Checkout) |
| Size | 100vw × 100vh |
| Dismiss | "Close · Esc" button, Esc key, the "Close visit" strip; it also closes itself after Approve and after Receive; "Full profile" closes it and opens the patient file |
| Header | Butter band, padding 14px 22px 12px, 1px bottom hairline. Line 1: name 21px/600 heading font · meta 12.5px tabular ("F · 29 · PT-0412 · +91 98250 ··· 41"; others "PT-0436 · +91 98··· ···08" pattern) · pill "Registered patient" (11px, sage line + ink, radius 999px). Line 2 chips (12px, padding 2px 9px, radius 6px): "Allergy: Sulfa drugs" (blush) · "Laser pack · 3 of 6 left" (sage) · "Due ₹1,200" (butter) · "Consent: data ✓ · photos ✓ · marketing ✗" (outline) · "Visit: <lane> · since 10:40" (outline). Right: "Full profile" (12.5px/500, shadow-sm) · "Close · Esc" — no × |
| Footer | none — each tab has its own action at the bottom of its column. Tab row (padding 8px 22px 0, bottom hairline): tabs "History" · "Consult & Rx" · "Treatment" · "Checkout" (13.5px, padding 8px 14px, 2px accent underline on the current tab) and at the right "All changes saved 10:42" / "Saving…" (11.5px) |
| Multi-step | yes — four tabs, see Multi-step flow |
| Initial focus | none — no element is focused on open |

### Command menu ("Walk-in")

| Field | Value |
| --- | --- |
| Shape (desktop) | centred dialog near the top (12vh from the top) over a dim backdrop rgb(9 9 11 / .35) — the global command menu, specified in shell.md |
| Shape (mobile) | Phone: the same dialog at full width inside 16px side padding. Tablet: as desktop |
| Trigger | "Walk-in" (same as the header search / ⌘K) |
| Size | width min(640px, 100%); max-height min(560px, 76vh) |
| Dismiss | backdrop click, Esc |
| Header | 52px search field, placeholder "Search or jump to…", "esc" key hint |
| Footer | "↑ ↓ move · ↵ open" key hints + "Type 2+ letters to search patients, leads and invoices" |
| Multi-step | no |
| Initial focus | the search field (20 ms after open) |

"New booking" does not open a popup on Today: it switches to Leads with the New lead drawer open (see leads.md).

## Multi-step flow

- Steps (ordered): visit sheet tabs History → Consult & Rx → Treatment → Checkout; inside Checkout, "1 · Bill" → "2 · Payment".
- **Sequence varies by input?** yes —
  - Opening tab by lane: With doctor → Consult & Rx · Treatment → Treatment · Checkout → Checkout (History is reached only by its tab).
  - After Approve, the card moves to its next lane: a visit with a pending session (Rhea Shah) → Treatment; every other prescribed visit → Checkout.
  - After Complete session → Checkout (sheet stays open).
  - After Receive: visit with a prescription → Pharmacy; visit without → leaves the floor.
  - Floor order overall: Enquiries ("Book" → Leads) · Arriving → Waiting ("Check in") → With doctor ("Send in") → Treatment or Checkout (Approve) → Checkout (Complete session) → Pharmacy or off the floor (Receive) · Pharmacy → Medical › Sales ("Dispense").
  - Role does not change the steps; it only dims lanes and picks the default lane.
  - Phone: same steps and tabs (no step is hidden on phone).
- Progress indicator: 2px accent underline on the current tab; Checkout numbers its blocks "1 · Bill" / "2 · Payment"; Treatment shows a 6-segment pack bar (8px tall, radius 8px, gap 4px: 3 done sage, today outlined 1.5px sage, 2 grey).
- Navigation: tabs are free in any order; History's "Next for this visit" buttons jump to Consult & Rx, Treatment and Checkout; no Back / Next buttons.
- Per-step validation: Approve is blocked until there is at least one Rx line and every line is reviewed; "2 · Payment" shows its fields only after "Create bill"; Receive ignores an amount ≤ 0.
- Edit mode: n/a — the sheet always opens on the live visit; there is no create-versus-edit split.

## Preview / animated panels

n/a — Today has no animated or auto-switching panel; the lane strip only scrolls.

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Section (All sections list, pinned header tab) | Lucide `house` (key `home`) | 16 | no |
| Phone tab bar, fifth slot while Today is open and unpinned | Lucide `compass`, labelled "Today" | 18 | no |

No icons inside the room or the visit sheet — arrows and marks are text glyphs ("→", "✓", "✗"). The command menu's icons are in shell.md.

Library: Lucide · Weight: regular (2px stroke)

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Page skeleton bars (first open) | flat #efeff1 fill, background-position shimmer (czsk) | 1100ms, infinite | ease |
| Lane tile hover / selection | border-color | 0ms (no transition) | none |
| Lane strip (phone) | native scroll with x-mandatory snap to tile start | browser default | browser default |
| Visit sheet open / close | none — appears and disappears at once | 0ms | none |
| Command menu backdrop | opacity 0→1 (czfade) | 150ms | ease |
| Command menu panel | opacity 0→1, translateY −4px→0, scale .985→1 (czddin) | 160ms | cubic-bezier(.2,.8,.2,1) |
| Toast | appears at once; auto-hides | 5200ms visible (9000ms with "Retry") | none |

Reduced-motion: every animation and transition runs 1ms with no delay, iteration count 1 (the skeleton shimmer stops), no smooth scrolling.

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Today page (first open in a session) | Page skeleton: every leaf text in the main column and the Work queue list becomes a #efeff1 bar (radius 6px, czsk shimmer), avatar discs become grey circles, icons are hidden, clicks are blocked (cursor progress); 260–560 ms (10% of loads +280–600 ms). Later visits show cached data at once | n/a — the 7 lane tiles always render | 5% of loads end with toast "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" (9 s, re-fetches); content stays |
| Lane tile | same page skeleton | count "0", no faces, hint "—" | n/a — local data |
| Selected lane panel | same page skeleton | "No one here right now." (12.5px, neutral-700) under the lane header (lane name + "0 people") | n/a — local data |
| Work queue | same page skeleton | no message — the list under the header is simply empty | n/a — local data; every outcome has "Undo" in its toast |
| Lane actions "Check in" / "Send in" | none — instant | n/a — an action, not a list | n/a — instant local move; "Undo" in the toast |
| Visit sheet | none — opens with the visit already loaded | Prescription: "No medicines yet. Copy the last prescription (each line must be reviewed) or add below." · Findings: "Type, or use “Dictate a draft”. Drafts stay marked until you edit and sign." · Payment before the bill: "Create the bill first. A bill says what is owed; a payment records money received. They are separate records." | n/a — the prototype's visit-sheet actions never fail and define no error copy |
| Visit sheet actions | "Listening… drafting" (1200 ms) · "Approving…" · "Recording…" · "Creating…" · "Waiting for server…" (750 ms each); tab row "Saving…" | n/a — actions, not lists | n/a — the actions never fail in the prototype |

Success: lane moves and visit-sheet actions confirm with the toasts in Copy; Complete session and Create bill also confirm inline.

## Copy

| Key | Exact string |
| --- | --- |
| greeting | "Good morning, <first name>" before 12:00 · "Good afternoon, <first name>" 12:00–16:59 · "Good evening, <first name>" from 17:00 — clinic clock (device time held to 09:00–19:59) |
| greeting first name by first role | Front desk: the user's first name ("Riya") · Doctor "Dr. Mavani" · Therapist "Kiran" · Counsellor "Nidhi" · Pharmacist "Farah" · Accountant "Mehul" · Marketing "Jay" · Owner "Dr. Mavani" · none "there" |
| pulse | "<n> in clinic · <n> waiting · <n> arriving · <Ddd> <D> <Mon>, <HH:MM>" — e.g. "6 in clinic · 2 waiting · 3 arriving · Sat 3 Oct, 10:42" (in clinic = Waiting + With doctor + Treatment + Checkout + Pharmacy; arriving = Arriving) |
| buttons | "New booking" · "Walk-in" |
| lane labels | "Enquiries" · "Arriving" · "Waiting" · "With doctor" · "Treatment" · "Checkout" · "Pharmacy" |
| lane hints | "oldest 10:12" · "next 11:00" · "since 10:40" · "—" · "+2" |
| lane count | "1 person" · "<n> people" (also "0 people") |
| lane empty | "No one here right now." |
| card actions | "Book" · "Check in" · "Send in" · "Open consult" · "Open session" · "Checkout" · "Dispense" |
| check-in toast | "<name> checked in · Dr. queue and room notified" + "Undo" |
| send-in toast | "<name> sent in to the doctor" + "Undo" |
| no record toast | "No patient record yet for <name>" |
| Work queue title | "Work queue" |
| Work queue sub | "<n> open · each has an owner and a due time" |
| scope | "Mine" · "Everyone" |
| owner line | "Owner: <name>" (yours read "<first name> (you)") |
| closed line | "✓ <result>" |
| outcome toast | "<name>: <result>" + "Undo" |
| seed task — Confirm | "Priti Soni · 11:30 today" · "Laser session not confirmed. Reminder read at 08:10, no reply." · "Due 10:50" · "Confirmed" → "Confirmed · Kiran and GentleMax held" · "No answer" → "No answer · retry at 11:00, SMS sent" · "Reschedule" → "Opened slot finder · reminders will move with the booking" |
| seed task — No-show | "Vikram Bhatt · 09:30" · "Missed consult. First no-show this year." · "Overdue 40 min" · "Rebooked" → "Rebooked · old reminders cancelled" · "Not interested" → "Closed · reason saved to history" · "No answer" → "Retry tomorrow 10:00" |
| seed task — Payment due | "Rhea Shah · ₹1,200" · "Balance on laser pack. She is in clinic now." · "Today" · "Collect at checkout" → "Added to today’s checkout" · "Send UPI link" → "UPI link queued on WhatsApp" |
| seed task — Feedback (Kiran) | "Pooja Nair · peel yesterday" · "Day-1 after-care check." · "Due 12:00" · "All well" → "Closed · next session reminder stays" · "Concern" → "Escalated to Dr. Mavani with call notes" |
| seed task — Recall | "Tanvi Shah · last visit 6 Jun" · "Melasma review due at 12 weeks." · "This week" · "Booked" → "Booked · confirmation queued" · "Later" → "Snoozed 7 days" |
| seed task — Feedback | "Meera Joshi · hydrafacial" · "Day-3 check after her first facial." · "Wed 30 Sep" · "Happy" → "Closed · review link sent" · "Unhappy" → "Escalated to owner" |
| seed task — Payment due (Mehul J.) | "Rohit Pillai · ₹12,000" · "PRP balance, 46 days old." · "Tomorrow" · "Send UPI link" → "UPI link queued" · "Called" → "Promise to pay logged" |
| seed task — Call back (Nidhi (counsellor)) | "Kabir Mehta · lead" · "Asked for a call about hair PRP cost." · "Due 11:00" · "Reached" → "Logged · counsellor quote task created" · "No answer" → "Retry 14:00" |
| session feedback task | "<name> · laser 4/6" · "Day-2 check on redness. Created by session completion." · "Tue 29 Sep" · "All well" → "Closed" · "Concern" → "Escalated to doctor" |
| sheet close strip | aria-label and title "Close visit" |
| sheet kind pill | "Registered patient" |
| sheet chips | "Allergy: Sulfa drugs" · "Laser pack · 3 of 6 left" · "Due ₹1,200" · "Consent: data ✓ · photos ✓ · marketing ✗" · "Visit: <Enquiry\|Arriving\|Waiting\|With doctor\|Treatment\|Checkout\|Pharmacy> · since 10:40" |
| sheet buttons | "Full profile" · "Close · Esc" |
| sheet tabs | "History" · "Consult & Rx" · "Treatment" · "Checkout" |
| saved label | "All changes saved 10:42" · "Saving…" |
| History filters | "Show" · "All" · "Clinical" · "Money" · "Messages" · "Audit" |
| History rows | "Today 10:40" Visit "Checked in by Asha at front desk" · "Today 08:02" WhatsApp "Appointment reminder · read" · "12 Aug 2026" Consult "Dr. Mavani · Melasma, improving · Rx 3 items" · "12 Aug 2026" Session "Laser 3 of 6 · Kiran · 18 J/cm², 15 mm spot" · "12 Aug 2026" Payment "₹4,200 UPI · RCT/26-27/0211" · "14 Aug 2026" Change "Alternate phone added by Asha" · "02 Jul 2026" Package "6-session laser pack · ₹24,000 · ₹1,200 due" · "01 Jul 2026" Call "Counsellor call with Nidhi · chose the pack" · "28 Jun 2026" Lead "WhatsApp enquiry converted to patient" (pill tone by filter: Clinical blush, Money butter, Messages lav, Audit stone) |
| History note | "Private photos and clinical notes appear only for roles allowed to see them." |
| History aside | "Next for this visit" · "Consult & prescription →" · "Laser session 4 of 6 →" · "Checkout · ₹1,200 due carried →" · "The visit sheet stays the same person from check-in to follow-up. Each tab writes to its own record: clinical, session, bill, pharmacy." |
| Consult history | "Relevant history" · "12 Aug · Dr. Mavani" "Melasma, improving. Tretinoin, SPF 50, azelaic acid." · "12 Aug · Laser 3/6" "18 J/cm², 15 mm. Mild redness, settled in 1 day." · "02 Jul · First consult" "Skin type IV. Sulfa allergy (rash, 2019)." · "Safety: sulfa allergy. Not pregnant (asked 12 Aug). No isotretinoin." |
| Consult note | "Consult note" · "Dictate a draft" · "Listening… drafting" · "Complaint" · "Findings" · "Diagnosis" · "Plan" · "Draft from dictation · edit before signing" · "Malar patches lighter than on 12 Aug, about 30% by photo comparison. No irritation from tretinoin. Continue plan, add tranexamic acid if slow." |
| Prescription | "Prescription" · "Copy 12 Aug prescription" · "Review" · "✓ Reviewed" · "Remove" · "Add" · "Print in" · "Approve · print · send to pharmacy" · "Review <n> line(s) first" · "Review the line(s) first" · "Approving…" |
| copied lines | "Tretinoin 0.025% cream 20 g" "Thin layer at night · qty 1 tube · 8 weeks" · "Sunscreen SPF 50 gel 50 g" "Morning; reapply every 3 h outdoors · qty 2 · Ongoing" · "Azelaic acid 15% gel 30 g" "Morning on patches · qty 1 · 8 weeks" |
| approve toast | "Prescription approved for <name> · printed in <English\|ગુજરાતી\|हिंदी> · sent to pharmacy · moved to <lane key>" |
| Treatment | "Laser hair reduction · face" · "Kiran · GentleMax · Room 2" · "Pack: 6 sessions, bought 2 Jul · 3 used · today is session 4 · valid until 2 Jan 2027" · "Doctor’s instruction: Keep 18 J/cm². Skip patch near left jaw if still red." · "Setting" · "Session 3" · "Today" · "Fluence" · "Spot size" · "Pulse" · "Areas treated" · "Complete session 4 of 6" · "Recording…" |
| session success | "✓ Session 4 recorded · 2 left · feedback call Tue 29 Sep (Kiran) · Reverse with reason" · toast "Session 4 of 6 recorded once for <name> · 2 left · feedback task for Tue" |
| Photo comparison | "Photo comparison" · "Same angle · capture order kept · location data removed" · "1 · Baseline · 2 Jul" · "2 · Session 1 · 2 Jul" · "3 · Session 2 · 18 Jul" · "4 · Session 3 · 12 Aug" · "Capture today" · "Tablet camera · guide overlay" · "Up to 6 in view" · "Visible to doctor, therapist and counsellor. Photo consent given 2 Jul; marketing use not allowed." |
| Bill | "1 · Bill" · "Pulled from today’s visit · nothing retyped" · "Consultation · Dr. Mavani" "₹800" "GST exempt" · "Chemical peel" "₹3,500" "Discount 10% → ₹3,150" · "Laser session 4 of 6" "₹0" "From pack · no charge" · "Subtotal after discount" "₹3,950" · "Discount (before tax) · 10% peel · by Nidhi" "−₹350" · "GST 18% on ₹3,150" "₹567" · "Previous due · laser pack" "₹1,200" · "Advance paid 12 Aug" "−₹2,000" · "To pay now" "₹3,717" |
| Bill note | "Totals are calculated by the server. Pharmacy is billed separately until the combined-bill decision is made." |
| Bill actions | "Create bill" · "Creating…" · "✓ INV/26-27/0412 finalised. Changes now go through Cancel bill or Credit note." |
| Payment | "2 · Payment" · "Create the bill first. A bill says what is owed; a payment records money received. They are separate records." · "UPI" · "Cash" · "Card" · "Split" · "Amount received (₹)" · "Balance after this payment: ₹<n>" · "Partial payment. The balance becomes a due with a reminder task." · "Receive ₹<amount> by <mode>" · "Waiting for server…" · "Shown as received only after the server confirms. Pressing twice cannot record two payments. Receipt prints and goes on WhatsApp." |
| receive toast | "₹<amount> received by <mode> · RCT/26-27/0388 · receipt sent on WhatsApp" |
| load error toast | "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" |
