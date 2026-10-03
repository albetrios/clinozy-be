# Screen: Leads

- Route: /leads (lead drawer /leads/:leadId · New lead /leads/create)
- Purpose: Enquiries and their conversations, until they become patients.
- Entry points: header tab "Leads" (phone: bottom tab bar or "All sections"), ⌘K "New lead", contact card "+ Lead", "Connected lead" chip in the appointment form (opens the lead drawer), opening a person who has no patient record
- Exit points: lead drawer, New lead drawer, contact editor, appointment form (composer "Book an appointment"), patient record ("Convert to patient"), Tasks (auto tasks)
- Access: view, create and edit — Admin, Doctor, Front desk, Counsellor (role defaults, editable in Users › Roles); delete — Admin. "New lead" is hidden for roles without create.
- Layout shell: app shell
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: lav.

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| Toolbar | h1 "Leads" · view tabs "Mine" · "Unreplied" (count) · "All" · search · "Filters" · columns button (eye) · "New lead" | One wrapping row, padding 16px 20px (12px 12px when the window is < 1440px wide or < 800px tall), gap 10px 8px. Left: h1 20px/600 with a 1px hairline on its right, then the tabs. Right: search 200px (150–220px, 36px), Filters 36px, eye 36px, "New lead" 36px dark button | Phone: h1, eye and the spacer are hidden; row 1 = search full width, 40px, no "/" key hint; row 2 = tabs (scroll sideways if needed) with Filters (36px) pushed right; "New lead" becomes a floating pill (52px tall, radius 999px, right 16px, bottom 74px + safe area, shadow 0 10px 28px -8px rgb(0 0 0 / .45), 14px text) above the bottom tab bar; toolbar padding 8px 12px. Tablet: as desktop with the 12px paddings | Search placeholder "Search name, phone, #ID", tooltip "Search · press /", matches name, mobile and ID ignoring spaces and "#" |
| Lead table card | sticky header, rows, load-more skeleton, end divider | Card with margin 0 20px 20px (0 12px 12px compact), radius 12px, 1px border, shadow 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px -8px rgb(0 0 0 / .06); minimum width 830px with all six columns, the body scrolls sideways inside the card when narrower (header follows) | Phone: card flush to the edges (margin 0, no radius, no side borders, no shadow), header hidden, each row wraps (see Data display). Tablet 820: scrolls sideways (830px minimum); tablet 1024: fits | Virtualised above 40 rows |
| Footer strip | 40px bar under the rows, 1px top border, z50 background | Present, holds no text | Phone: same | Its text slot is empty in every state |
| Lead drawer | backdrop · details pane (left) · chat pane (right) · floating × | Two fixed right-edge panels, full height: total width min(980px, 94vw); chat = max(360px, min(chat width or 420px, total − 400px)); details = total − chat. At 1440: 560 + 420. Backdrop rgb(9 9 11 / .28). × 36px at top 14px, right = total + 12px | Phone: full screen. Fixed 52px top bar: back button "Close lead" (36px) and a segmented "Lead panels" switch "Details" · "Chat" (30px segments; Chat shows the unread count when Details is showing). One pane at a time, starting under the bar (top 52px); Chat is the default pane; the floating × is moved off-screen. Tablet: as desktop — 820: 771 = 400 + 371; 1024: 963 = 543 + 420 | Not modal (no aria-modal); stacking: backdrop 39, panes 40, × 41, phone bar 42 |
| New lead drawer | Contact step, Lead details step, footer | Right drawer min(640px, 100vw − 56px), full height, modal, backdrop rgb(9 9 11 / .45), × 36px floating 10px left of the panel | Phone: full width; the floating × is pushed off-screen, close with "Cancel" | z 70 |
| Contact editor | child drawer over the New lead drawer or the lead drawer | 560px right drawer, backdrop rgb(9 9 11 / .35), × floating left | Phone: width 100% − 46px (the × keeps a 46px gutter on the left); footer "Done" full width, 44px | z 75 |

## Data display

Primitive: table (lead list) · list (chat timeline inside the lead drawer)

### Lead table

| Field | Value |
| --- | --- |
| Columns (ordered) | Lead (32px avatar, lavender, sage when the lead is a patient, with a 14px "P" badge; name 13px, 600 when unread else 500; mobile 11.5px) · Status (24px pill in the status tone) · Source (24px pill: 13px source icon + name) · Interested in (first interest as a 24px pill + "+N" pill whose tooltip lists all) · Team (assignee chip 28px: 22px avatar with a 7px online dot + name; then "Open · Claim" pill when idle past the hold and not mine, "Open to team · Join" when the assignee has left, "Open to team" when it is mine, a 7px dot when it releases within a day, up to 3 involved 28px avatars and "+N") · Updated (relative time, 12px, right aligned, dotted underline, tooltip with the full date) |
| Column widths | minmax(160px,1.5fr) · minmax(104px,.8fr) · minmax(116px,.7fr) · minmax(96px,.9fr) · minmax(150px,1.2fr) · 84px; gap 12px; header 40px, uppercase 11px/600, tracking .03em, z50 background |
| Sortable | Lead (A–Z), Status (pipeline order), Source, Updated (first click newest first). Clicks cycle ascending → descending → off; Updated cycles newest first → off. Interested in and Team are not sortable. Icons arrow-up-down at 45% when idle, arrow-up / arrow-down when active |
| Row height | 53px (10px top and bottom padding around the 32px avatar); 3px left edge in the status dot colour; 1px z100 divider; hover z50; the row of the open lead is z100 |
| Row click | Opens the lead drawer on that lead: marks it read and sets the composer channel to the channel of their last message (else the default channel) |
| Row actions | None in the row. Hover the person (280ms) → contact card; hover the assignee → team card with "Claim <first name>" / "Take over from <first name>" / "Join · take <first name>"; clicking "Open · Claim" claims the lead (toast "You now own <name> · <previous owner> stays involved" + "Undo") |
| Selection | None — no checkboxes, no bulk bar |
| Mobile behaviour | Phone: rows, not cards. The header is hidden and each row becomes a wrapped flex line (gap 6px 12px, padding 12px 14px 12px 11px, 3px status edge kept) flowing person → Status → Source → Interested in → Team → Updated; no column folds into a meta line (this list does not use the shared table) and the columns menu is hidden. Tablet: all six columns, sideways scroll at 820px |
| Pagination | Infinite scroll: within 80px of the end the next 10 leads load after 700ms with "Loading more leads" (3 skeleton rows, 56px), up to 5 pages, then the divider "All leads loaded". Rows render in a window above 40 rows (measured row height, 53px default, 10 rows of overscan) |

Views: "Mine" (default — assigned to me), "Unreplied" (assigned to me with unread messages; count chip), "All". Contact-only threads created by appointments never appear.

### Chat timeline (lead drawer · chat pane)

Shared chat internals (bubbles, system pills, composer, templates) are in _patterns.md; this section and the composer form below give everything the lead drawer adds or pins down.

| Field | Value |
| --- | --- |
| Grid | One column, newest at the bottom, gap 10px, padding 14px 20px (16px compact, 14px phone) on z50; the divider "Lead created · <created> · via <source>" sits above the first entry |
| Anatomy | System pill centred: 28px tall, radius 999px, 18px tinted icon disc, text 11.5px, time. Message bubble max 68% wide, padding 9px 13px, radius 8px, 13.5px / 1.45: their messages left on the channel tint at 55%, ours right on the channel tint, call logs on sky, notes on butter with a dashed border |
| Meta line | 11px under each bubble: "<who> · <channel icon> <time> · <status>" — who = their first name, or the team member's name + " · call" / " · note"; status "Delivered", "Read", "Queued" or "Sent"; "Sending…" while sending; "Not sent" + "Retry" pill when it failed |
| Truncation | System pills one line with ellipsis; bubbles wrap |
| Actions | A system pill that points at a record (appointment, Rx, invoice, payment, check-in) opens it; "Retry" resends; hovering a team name shows the team card |
| Mobile | Phone: the Chat pane fills the screen under the 52px bar; same anatomy |

## Forms

### Lead drawer — details pane (draft, then "Save lead")

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | source | chip group, single | Source | n/a — chips | Chips in order Instagram · Google · WhatsApp · Facebook · Walk-in · Referral · Re-target, each with its icon; selected = 1px ring in its tone | no | one value; held as a draft until "Save lead" |
| 2 | interests | chip group, multi + inline add | Interested in | "Add interest" (dashed pill input, 90px) | Chips Clinical · Peel · LHR · Hydrafacial · PRP + any custom ones; selected chips show square-check 12px; Enter or blur adds, Esc clears | no | max 30 characters; duplicates ignored (case-insensitive); draft until Save |
| 3 | people | person picker button (36px, full width) | Assigned & involved | "+ Add involved" (when nobody is involved) | Opens "People on this lead"; "Claim" (dark 20px pill) when the lead is open to the team and not mine; "Release" (tooltip "Let anyone on the team take it") when it is mine and held | no | Applies at once, not a draft. Only the assignee can reassign, and only to allowed roles (Front desk → Front desk, Counsellor; Counsellor → Front desk, Counsellor, Doctor; Doctor → Doctor, Therapist, Counsellor, Front desk) |
| 4 | status | 4-tile track + "Close as" chips | Progress | n/a — tiles | Tiles New · Contacted · Follow-up · Clinic visited; "Close as" No response · Not interested · Invalid · Lost | no | any status in any order; draft until Save |
| 5 | facts | read-only grid (min 150px cells) | Info | n/a — read-only | Created · Last message · Patient · Open tasks · Re-target reason (re-target leads, full width); Patient shows "Convert to patient" when not a patient and status is Contacted or Follow-up | n/a — read-only | n/a — read-only |

- Error display: no field errors. A failed save shows the footer line "Not saved · your changes are kept" (red, 6px dot) and the toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" (9s).
- Submit: "Save lead", footer right, 36px; disabled (z200 fill, z400 text, not-allowed cursor) until something changed; "Discard" (outline) appears only while there are changes; "Remove lead" (red #dc2626, 36px) sits at the footer left.
- Loading: button reads "Saving…" for 320–740ms; "Retry save" after a failure (10% of saves fail on purpose).
- Success: toast "Lead saved", or, when the status changed, "<name> → <status>" with "Undo" (Follow-up adds " · follow-up task for tomorrow"); the drawer stays open.
- Dirty-state guard: none. The draft survives closing the drawer but is dropped when a row is opened again or "Discard" is pressed.

### New lead drawer

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | contact | search input, 44px, autofocus | n/a — no visible label (aria "Search existing patient or contact") | "Search by name or mobile" | Results from 2 characters, max 5: patients ("Patient <ID> · last visit <date>", action "Re-create lead") and contacts ("<kind> · <mobile>", action "Use contact"); "No existing match" | yes — a contact with a name and a 10-digit mobile | checked on "Create lead" |
| 2 | quick start | chips 28px | Quick start | n/a — chips | "Walk-in" (tooltip "At the desk now · source Walk-in, status Clinic visited"), "Phone call" ("Enquiry by phone"), "Instagram DM" ("DM on Instagram") | no | sets source and status |
| 3 | new contact | row button, 40px | New contact | n/a — button | Opens the contact editor | no | n/a — opens a drawer |
| 4 | source | chip group, single | Source | n/a — chips | Default WhatsApp; same chips as the drawer | no | one value |
| 5 | interests | chip group, multi + inline add | Interested in | "Add interest" | Same as the drawer | no | max 30 characters, no duplicates |
| 6 | people | person picker button | Assigned & involved | "+ Add involved" | Default assignee = me; anyone can be assigned here | no | assignee cannot also be involved |

- Error display: toast only — "Add a name and a 10-digit mobile"; failed save → footer "Not saved · your changes are kept" + the shared save toast.
- Submit: "Create lead" (36px, dark), footer right, always enabled; "Cancel" (outline) before it; footer left note "Creates or updates one contact".
- Loading: "Saving…", then "Retry save" after a failure.
- Success: toast "Lead #<id> created"; the drawer closes; the new lead is first in the list and selected (the drawer does not open); its first timeline entry is "Lead created".
- Dirty-state guard: none — "Cancel", ×, backdrop and Esc close without asking.

### Contact editor (child drawer)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | contact id | copy button (mono, 32px) | n/a — shows "C-<5 digits>" | n/a — read-only | "One contact · shared by leads, patients and chats"; tooltip "Contact ID · click to copy" | n/a — read-only | n/a — read-only |
| 2 | name | text | Name | "Full name" | Shown in every lead, patient and chat of this contact | yes (for a new lead) | max 60 |
| 3 | mobiles | repeatable tel rows | Mobile numbers | "98250 11241" | "+91" prefix; per row "★ Primary" / "☆ Set primary", a "WhatsApp" checkbox, "×" (only with 2+ numbers); "+ Add number" | yes (one, for a new lead) | 10 digits; a pasted 91 prefix is stripped; shown as "98250 11241" |
| 4 | instagram | repeatable text rows (after "+ Instagram") | Instagram | "@handle" | "×" removes a handle; "+ Add handle" | no | max 30 |
| 5 | default channel | single chips, 32px | Default channel · switches to the last channel used | n/a — chips | WhatsApp · Call · SMS · Instagram | no | one value |
| 6 | preferences | multi chips + custom | Contact preferences | "Type a preference" (custom input) | No calls · Sundays only · Weekdays only · After 6 pm · Mornings · Evenings · Weekends only · Gujarati · Hindi · English · Female doctor · Text before calling · "+ Custom" | no | custom max 40; duplicates ignored |

- Error display: none in the drawer; the New lead form checks name and mobile on "Create lead".
- Submit: "Done" (primary), footer right; phone: full width, 44px.
- Loading: none — local until the lead is saved.
- Success: opened from a lead → saved to the lead, toast "Contact updated · applies everywhere"; opened from New lead → back to the form with the contact card.
- Dirty-state guard: none — × and backdrop close; values typed so far stay in the form.

### Lead composer (chat pane)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | mode | segmented tabs, 32px | Send via | n/a — tabs | WhatsApp (only if the contact is on WhatsApp) · Instagram (disabled at 45% with tooltip "No Instagram on this contact" when there is no handle) · Call log · Note; icon-only unless both the dragged chat width and 34% of the window are ≥ 460px | yes (one) | n/a — always set |
| 2 | message | textarea, 3 rows, min 60px | n/a — aria "Message" | "Message to <first name> on WhatsApp" / "… on Instagram" · Call log: "What happened on the call?" · Note: "Note for the team, not sent to <first name>" | Enter sends, Shift+Enter adds a line; "/" at the start opens templates | yes | max 1000; blank does nothing |

- Error display: per message — "Not sent" + "Retry".
- Submit: "Send WhatsApp" / "Send Instagram" / "Log call" / "Add note", 30px, bottom right of the box, filled in the channel colour.
- Loading: "Sending…" under the bubble, "Delivered" after 1000ms; while WhatsApp is down the bubble reads "Queued".
- Success: the bubble appears at the bottom; the first reply to a New or Re-targeted lead moves it to Contacted (system pill "Status → Contacted (first reply)"); a call logged on a New lead → "Status → Contacted (call logged)".
- Dirty-state guard: none; an unsent message is kept per lead and comes back when that lead is opened again.

## Popups

### Lead drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | Side drawer — two fixed right-edge panels side by side (details left, chat right), full height, not modal |
| Shape (mobile) | Phone: full-screen panel with a fixed 52px top bar; one pane at a time (Details or Chat), Chat first. Tablet: as desktop |
| Trigger | Row click; "Connected lead" chip in the appointment form; opening a person with no patient record |
| Size | Total min(980px, 94vw); chat max(360px, min(dragged width or 420px, total − 400px)); the 7px handle on the chat's left edge drags 360–680px, arrow keys move it 20px (300–640px), double-click resets (tooltip "Drag to resize · double-click to reset") |
| Dismiss | Backdrop click, Esc (after any open popover), floating ×; phone: back button "Close lead" |
| Header | Details pane, 76px (60px phone): h2 "Edit lead" 20px/600 · ID button "#<id>" (mono 12px, copy icon on hover, tooltip "Lead #<id> · created <created> · click to copy") · "Re-target" pill on re-target leads (tooltip = re-target reason); sub "Make your changes, then Save lead". Chat pane, same height: 34px avatar, name 13.5px/600, mobile 11.5px |
| Footer | Details pane: "Remove lead" (left) · "Not saved · your changes are kept" (after a failed save) · "Discard" (only when changed) · "Save lead". Chat pane: composer |
| Multi-step | Yes — three always-open cards: 1 Lead details · 2 Progress · Info |
| Initial focus | None set; the composer is not focused |

### New lead drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | Side drawer, right, full height, modal |
| Shape (mobile) | Phone: full width; the × is off-screen. Tablet: as desktop |
| Trigger | "New lead" (toolbar or phone pill), ⌘K "New lead", contact card "+ Lead" |
| Size | min(640px, 100vw − 56px) |
| Dismiss | Backdrop, Esc, floating ×, "Cancel" |
| Header | 76px: h2 "New lead" 20px/600, sub "Name and mobile are enough to start" |
| Footer | "Creates or updates one contact" (left) · "Cancel" · "Not saved · your changes are kept" (after a failure) · "Create lead" |
| Multi-step | Yes — see Multi-step flow |
| Initial focus | Contact search input (autofocus) when no contact is set; none otherwise |

### Contact editor

| Field | Value |
| --- | --- |
| Shape (desktop) | Side drawer (child), right, full height, modal, over the current drawer |
| Shape (mobile) | Phone: 100% − 46px wide; "Done" becomes full width, 44px. Tablet: as desktop |
| Trigger | "New contact" in New lead; "Edit" (pencil) in the contact card of the lead or of the New lead contact |
| Size | 560px |
| Dismiss | Backdrop, floating ×, "Done" |
| Header | "Edit contact" 20px/600, sub "Saved once · used by every lead, patient and chat"; a tinted band below: 48px avatar, name ("New contact" until typed; for a patient it links to the file with "↗", tooltip "Open patient file"), badges, and "+ Lead" · "+ Appointment" · "+ Patient" (non-patients only) buttons for known contacts |
| Footer | "Done" (primary), right |
| Multi-step | Yes — 1 Identity & reach · 2 Contact preferences |
| Initial focus | None set |

### Filters popover

| Field | Value |
| --- | --- |
| Shape (desktop) | Popover under the Filters button, right-aligned, 6px gap; moves left or flips above when it would leave the viewport |
| Shape (mobile) | Phone: bottom sheet — fixed to the bottom, full width, max height 82%, top radius 16px, no dimming. Tablet: as desktop |
| Trigger | "Filters" button (count badge when filters are applied; joined "×" button "Clear all filters") |
| Size | 340px wide, max height 100vh − 140px, padding 12px |
| Dismiss | Outside click, Esc, "Apply filter" |
| Header | "Filters" (13.5px/600) + "Clear all" (right) |
| Footer | Sticky "Apply filter" (32px, primary), right |
| Multi-step | No |
| Initial focus | None |

Sections, top to bottom: "Status" (single: New · Contacted · Follow-up · Clinic visited · No response · Not interested · Invalid · Lost; tap again to clear) · "Source · pick any" (multi, with icons, "Clear") · "Ownership · hold after idle days" (Any · Open to claim · Releasing today · Held) · "Team · assigned or involved" (picker "Anyone on the team" / "<name>" / "<n> people" that expands an inline list with "Search team", checkboxes, "No match"; "Clear") · "Created" (Any · Today · Yesterday · Last 7 days · Last 30 days · This month · Custom range) · "Follow-up date" (Any · Overdue · Today · Tomorrow · Next 7 days · Not set · Custom range). "Custom range" adds "From" and "To" date pickers. Nothing applies until "Apply filter"; then the list reloads (600ms load-more skeleton plus row shimmer).

### People on this lead

| Field | Value |
| --- | --- |
| Shape (desktop) | Popover anchored to the "Assigned & involved" button, below it (above when there is less room) |
| Shape (mobile) | Phone: same popover inside the pane, clamped 8px from its edges. Tablet: as desktop |
| Trigger | "Assigned & involved" button |
| Size | Button width clamped 320–440px; max height min(460px, available), at least 160px |
| Dismiss | Outside click, Esc |
| Header | Sticky search "Search team" (44px), then "Assigned to · who handles this lead now" |
| Footer | "✓ Involved = everyone who worked on this lead. Added automatically when they reply, call, note or book · you can add someone too" |
| Multi-step | No |
| Initial focus | None |

Rows: 30px avatar · name · "<role> · <activity>" · "Assign" / "Assigned" (32px; disabled at 40% with tooltip "Only the assignee (<name>) can reassign" or "<my role> can’t assign to <role>") · involved toggle 32px "+" / "✓" (hover on ✓ shows "×" in red). Assigning: system pill "Assigned to <name> · <previous> stays involved", toast "<name> is now assigned · notified" + "Undo". Involved: "Added <name> as involved" / "Removed <name> from involved". Empty search: "No match".

### Columns menu

| Field | Value |
| --- | --- |
| Shape (desktop) | Dropdown under the eye button, right-aligned |
| Shape (mobile) | Phone: not offered (eye hidden). Tablet: as desktop |
| Trigger | Eye button (tooltip "Columns · <n> of 5 shown"; 18px badge with the hidden count) |
| Size | min 260px |
| Dismiss | Outside click, Esc |
| Header | "Show all columns" (sub "All 5 columns shown" / "<n> hidden") |
| Footer | "<n> of 5 shown" |
| Multi-step | No |
| Initial focus | The option list (↑ ↓ move, Enter toggles) |

Toggles: Status · Source · Interested in · Team · Updated. Lead is always shown.

### Suggestions popover (composer)

| Field | Value |
| --- | --- |
| Shape (desktop) | Popover above the message box, full box width |
| Shape (mobile) | Phone: same, inside the Chat pane. Tablet: as desktop |
| Trigger | "Suggest" (tooltip "Suggestions and templates · or type /") or typing "/" at the start of the message; hidden in Call log and Note modes |
| Size | Max height 340px, padding 12px |
| Dismiss | "×" ("Close suggestions"), picking an item, clearing the "/" text |
| Header | sparkles icon + "Suggested for <first name>" |
| Footer | n/a — the list ends with the templates |
| Multi-step | No |
| Initial focus | None — typing continues in the message box |

Smart chips from their last message: "Share price" (price words), "Offer 2 slots" (timing words), "Send location" (address words), "Explain <term>" (treatment words); otherwise "Greet" · "Offer 2 slots" · "Follow up". Then "Templates · type / in the box to search" and 8 templates; no match → "No template matches “<query>”". Template placeholders show a "Fill in" row of dashed buttons that drop in the clinic's value.

### Remove lead confirm

| Field | Value |
| --- | --- |
| Shape (desktop) | Shared delete confirm from _patterns.md (480px right drawer, role alertdialog) |
| Shape (mobile) | As the shared confirm on phone |
| Trigger | "Remove lead" |
| Size | 480px |
| Dismiss | "Keep it", ×, backdrop |
| Header | "Remove lead this lead?" · grey pill with the lead's name · "The lead leaves every list and the owner’s queue. Chat history is kept. You can undo from the toast right after." |
| Footer | hint · "Keep it" · "Remove lead" (red, disabled until a reason) |
| Multi-step | No |
| Initial focus | None |

Reasons: Duplicate · Test entry · Spam · Other ("Other" needs a note: "Tell the team why (required)"). Done → toast "Lead #<id> removed · <reason>" + "Undo".

## Multi-step flow

### New lead

- Steps (ordered): Contact → Lead details.
- **Sequence varies by input?** yes:
  - No contact yet ("New lead", ⌘K "New lead"): 1 Contact (open) → 2 Lead details (locked: grey number, hint "After contact", summary "Source, interest and who handles it"; tapping it shows the toast "Pick or add the contact first").
  - Existing patient picked from search: the Contact step is replaced by a contact card (38px sage avatar with "P", name, mobile + " · +N more" when there are extra numbers or handles, "Change" button) and a single step 1 Lead details; source becomes Re-target and the lead is linked to the patient; toast "Existing patient <ID> · new lead will be linked".
  - Existing contact (not a patient) picked: contact card (lavender avatar) + 1 Lead details; toast "Using existing contact <name>".
  - "New contact": the contact editor opens; after "Done" with a name the form shows the contact card + 1 Lead details.
  - Opened from a contact card "+ Lead": contact card + 1 Lead details (name and mobile already known).
  - "Change" on the card, or "Change" in its hover card: contact cleared, source back to WhatsApp, back to the two-step sequence.
  - Quick start chips change values, not steps: Walk-in → source Walk-in, status Clinic visited; Phone call → source Phone call, status Contacted; Instagram DM → source Instagram, status New; toast "<chip> preset applied". Without a preset the status is New.
- Progress indicator: 24px numbered circles — open step dark (z900), filled step green, locked step grey.
- Navigation: no Next buttons; Lead details opens on its own once a contact exists.
- Per-step validation: Lead details stays locked until there is a contact; "Create lead" checks name + 10-digit mobile.
- Edit mode: the lead drawer is the edit surface. The form has an edit variant ("Edit lead", "Changes apply to this person everywhere", "Save changes", with the chat column) but no visible control opens it.

### Lead drawer cards

- Steps (ordered): 1 Lead details · 2 Progress · Info (unnumbered).
- **Sequence varies by input?** no — every lead shows the same three cards, always open (stacked, not an accordion). Info adds "Re-target reason" for re-target leads and "Convert to patient" when the lead is not a patient and its status is Contacted or Follow-up.
- Progress indicator: card circles green when filled (Lead details: a source and at least one interest; Progress: always), dark otherwise.
- Navigation: none.
- Per-step validation: none.
- Edit mode: always editable; changes are a draft until "Save lead".

### Lead status

- Steps (ordered): New → Contacted → Follow-up → Clinic visited; closing states No response · Not interested · Invalid · Lost; Re-targeted (system re-target leads only).
- **Sequence varies by input?** yes:
  - Tap a tile or a "Close as" chip, then "Save lead": system pill "Status → <status>", toast "<name> → <status>" + "Undo", in any order.
  - Follow-up (saved): also a Follow-up task due Tomorrow for me (outcomes "Reached" · "No answer"); toast adds " · follow-up task for tomorrow".
  - No response (saved): a "Call back" task due Tomorrow ("Status moved to No response. Follow up with the lead."), skipped if one is already open.
  - First WhatsApp or Instagram reply to a New or Re-targeted lead: Contacted, automatically.
  - Call logged on a New lead: Contacted, automatically.
  - Appointment saved as Checked in or Completed in the appointment form: every open lead of that person → Clinic visited ("Status → Clinic visited · checked in for appointment #<id>").
  - "Convert to patient": status Clinic visited, patient linked, toast "Patient record created for <name> · lead stays linked" + "Undo".
- Progress indicator: track tiles — done: tone ink fill, white text, white disc with an ink check, bottom bar 100%; current: tone tint, ringed dot with a 3px halo, bar 50%; next: 30% tint, dashed numbered circle, bar 0%; small label "Done" / "Current" / "Next"; tooltips "<status> · completed" / "<status> · current step" / "Move to <status>".
- Navigation: tiles and chips; no Next button.
- Per-step validation: none.
- Edit mode: the same control in every state.

### Contact editor

- Steps (ordered): 1 Identity & reach → 2 Contact preferences.
- **Sequence varies by input?** no.
- Progress indicator: numbered circles, green once a name is filled.
- Navigation: "Next: Contact preferences →"; either card opens on click, one at a time.
- Per-step validation: none.
- Edit mode: prefilled from the lead; same steps.

## Preview / animated panels

| Field | Value |
| --- | --- |
| Surfaces | 2 — details pane and chat pane of the lead drawer |
| Switching | Desktop and tablet: both visible side by side. Phone: the "Lead panels" tabs "Details" · "Chat" in the top bar |
| Surface per input type | Phone opens on Chat; the choice persists between leads. Chat tab shows an 18px green count of unread messages while Details is showing |
| Frame sequence | Open: both panes slide in together from the right; close: they slide out, then hide |
| Frame durations | 340ms, cubic-bezier(.32,.72,0,1); hidden 340ms after closing |
| Progressive reveal | None — both panes arrive together; on phone only the active pane is visible |
| Static fallback | Reduced motion: the panes appear in 1ms |

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Section (nav, tab bar) | user-plus | 16 | no |
| Search | search | 15 | no |
| New lead | plus | 16 | no |
| Filters | list-filter | 15 | no |
| Columns | eye | 16 | yes (aria "Show or hide columns") |
| Sort | arrow-up-down / arrow-up / arrow-down | 12 | no |
| Picker chevrons | chevron-down (2px stroke) | 14 | no |
| Source: WhatsApp | `wa` — brand glyph, not Lucide | 12–13 | no |
| Source: Instagram | `insta` — brand glyph, not Lucide | 12–13 | no |
| Source: Google | search | 12–13 | no |
| Source: Facebook, Referral | users | 12–13 | no |
| Source: Walk-in | house | 12–13 | no |
| Source: Re-target, Re-target pill | refresh-cw | 12–13 | no |
| Selected interest | square-check | 12 | no |
| Add interest, New contact | plus | 12–13 | no |
| Copy ID | copy | 12 | no |
| Convert to patient | user-plus | 13 | no |
| Phone bar back | chevron-left | 16 | yes (aria "Close lead") |
| Pane tab Details | users | 14 | no |
| Pane tab Chat | `wa` — brand glyph, not Lucide | 14 | no |
| Mode WhatsApp / Instagram | `wa` / `insta` — brand glyphs | 14 | yes (aria = mode name) |
| Mode Call log | phone | 14 | yes |
| Mode Note | pencil | 14 | yes |
| Suggest | sparkles | 14 | no |
| Book an appointment | calendar | 15 | yes (aria "Book an appointment") |
| Send | send | 13 | no |
| Templates | `wa` (Greeting), wallet (Price), calendar (Free slots), map-pin (Location), bell (Reminder), sparkles (Aftercare, Review), phone (Follow-up) | 13 | no |
| Message channel in meta | `wa`, `insta`, message-square (SMS), mail (Email), phone (Call) | 12 | yes (tooltip = channel) |
| Quick start | house, phone, `insta` | 13 | no |
| Contact editor | copy, `insta` ("+ Instagram"), `wa` (WhatsApp checkbox), `wa` / phone / message-square / `insta` (default channel) | 12–13 | no |
| Close | "×" text glyph | 18 | yes (aria "Close") |

Library: Lucide (inline SVG) · Weight: regular, 1.6px stroke (picker chevrons 2px)

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Lead drawer panes | transform translate3d(total + 40px, 0, 0) → 0; visibility off 340ms after close | 340ms | cubic-bezier(.32,.72,0,1) |
| Lead drawer backdrop | none — appears at once | 0ms | n/a — no transition |
| New lead / contact editor panel | transform translate3d(100%, 0, 0) → 0 | 340ms | cubic-bezier(.32,.72,0,1) |
| New lead / contact editor backdrop | background-color transparent → dim | 340ms | cubic-bezier(.32,.72,0,1) |
| Floating × (New lead, contact editor) | opacity, scale .9 → 1, after 200ms | 200ms | cubic-bezier(.2,.8,.2,1) |
| Card body open | opacity 0 → 1, translateY −4px → 0 | 240ms | cubic-bezier(.2,.8,.2,1) |
| Filters, people popover, dropdowns | opacity, translateY −4px → 0, scale .985 → 1 (+4px when flipped up) | 160ms | cubic-bezier(.2,.8,.2,1) |
| Phone bottom sheets (filters, dropdowns) | translateY 28px → 0, opacity 0 → 1 | 260ms | cubic-bezier(.32,.72,0,1) |
| Suggestions popover | opacity, translateY 4px → 0, scale .985 → 1 | 160ms | cubic-bezier(.2,.8,.2,1) |
| Tabs, mode tabs | background, color (+ box-shadow on mode tabs) | 150ms | ease |
| Composer area, Send button | background | 200ms | ease |
| Chevrons | transform rotate 0 → 180deg | 150ms | ease |
| Copy-ID icon | opacity, width | 150ms | ease |
| Row shimmer (filter, search, view, sort) | background-position | 1100ms loop | ease |
| Load-more skeleton | background-position | 1200ms loop | ease-in-out |
| Contact card / team card | delay before showing | 280ms / 160ms | n/a — delay |

Reduced-motion: every animation and transition runs 1ms with no delay and one iteration (skeleton shimmer stops), no smooth scrolling.

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Lead table (filter, search, view, sort) | Rows stay; their text turns into shimmering grey bars and clicks are blocked for 160–380ms | "No leads match" (centred, 12.5px) | Toast "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" (9s, ~5% of loads) |
| Load more | "Loading more leads" — 3 skeleton rows (56px) | End divider "All leads loaded" | n/a — load-more never fails in the prototype |
| Lead drawer save | "Saving…" | "Pick a lead on the left" (no lead) | Footer "Not saved · your changes are kept" + "Retry save" + toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" |
| Chat timeline | n/a — messages are local, no fetch | "No conversation yet" + one of three subs + 3 starter chips | Per message "Not sent" + "Retry"; banner text "WhatsApp down · replies will queue" |
| New lead / contact editor open | Body text turns into shimmer bars for 200–440ms | n/a — always has fields | n/a — no load error |
| New lead search | n/a — local results | "No existing match" | n/a — local |
| People popover, Team filter list | n/a — local | "No match" | n/a — local |
| Suggestions | n/a — local | "No template matches “<query>”" | n/a — local |
| New lead save | "Saving…" | n/a — form | Footer "Not saved · your changes are kept" + "Retry save" |

## Copy

| Key | Exact string |
| --- | --- |
| title | "Leads" |
| views | "Mine", "Unreplied", "All" |
| search | "Search name, phone, #ID" |
| primary | "New lead" |
| empty | "No leads match" |
| loading more | "Loading more leads" |
| end | "All leads loaded" |
| filters | "Filters", "Clear all", "Status", "Source · pick any", "Clear", "Ownership · hold after idle days", "Any", "Open to claim", "Releasing today", "Held", "Team · assigned or involved", "Anyone on the team", "<n> people", "Search team", "No match", "Created", "Follow-up date", "From", "To", "Apply filter", "Clear all filters" |
| date presets | "Any", "Today", "Yesterday", "Last 7 days", "Last 30 days", "This month", "Custom range"; "Overdue", "Tomorrow", "Next 7 days", "Not set" |
| statuses | "New", "Contacted", "Follow-up", "Clinic visited", "No response", "Not interested", "Invalid", "Lost", "Re-targeted" |
| sources | "Instagram", "Google", "WhatsApp", "Facebook", "Walk-in", "Referral", "Re-target" |
| interests | "Clinical", "Peel", "LHR", "Hydrafacial", "PRP" |
| team pills | "Open · Claim", "Open to team · Join", "Open to team" |
| team tooltips | "No activity for <n> days · anyone can claim it", "<name> has left the clinic · anyone on the team can join and take it", "Released to the team today if nobody follows up" / "… tomorrow if nobody follows up" |
| claim / release | "You now own <name> · <owner> stays involved", "<name> is open for anyone to claim", "Claimed by <me> after <n> idle days · <owner> stays involved", "Released to the team · anyone can claim" |
| drawer header | "Edit lead", "Make your changes, then Save lead", "Re-target", "Lead ID #<id> copied" |
| drawer cards | "Lead details", "Source", "Interested in", "Add interest", "Assigned & involved", "Claim", "Release", "+ Add involved", "Progress", "Close as", "Info", "Created", "Last message", "None yet", "Patient", "Linked", "Not yet", "Convert to patient", "Open tasks", "Re-target reason" |
| drawer footer | "Remove lead", "Discard", "Save lead", "Saving…", "Retry save", "Not saved · your changes are kept" |
| phone bar | "Close lead", "Details", "Chat" |
| save toasts | "Lead saved", "<name> → <status>", " · follow-up task for tomorrow", "Patient record created for <name> · lead stays linked" |
| created line | "Lead created · <created> · via <source>"; contact-only threads: "Patient · chat only · no lead" / "Contact · chat only · no lead" |
| chat empty | "No conversation yet"; "<first name>’s <service> is <today / tomorrow / on D Mon> at <h:mm am> · a quick WhatsApp keeps the slot"; "Every WhatsApp, call and note with <first name> shows here"; "Start with a WhatsApp · replies land here" |
| starters · visit today | "Are you on your way?" → "Hi <first>, we are ready for your <service> at <time>. Are you on your way?"; "Send directions" → "Hi <first>, here is the clinic location: maps.app/cresence-skin. See you at <time>!"; "Offer a new time" → "Hi <first>, if <time> does not work today, reply with a time that suits you and we will move it." |
| starters · visit later | "Confirm the visit" → "Hi <first>, a reminder of your <service> <when> at <time>. Reply Yes to confirm."; "Prep instructions" → "Hi <first>, before your <service> <when>: come without makeup and avoid sun for 24 hours. See you at <time>!"; "Send directions" → "Hi <first>, here is the clinic location: maps.app/cresence-skin. See you <when> at <time>." |
| starters · past visits | "Ask how it went" → "Hi <first>, how is your skin feeling after the last visit? Any questions for the doctor?"; "Book the next session" → "Hi <first>, shall we book your next session? Reply with a day that suits you."; "Share an offer" → "Hi <first>, we have a special on your usual treatment this month. Want the details?" |
| starters · no visits | "Say hello" → "Hi <first>, this is <my name> from Cresence Skin. Happy to help with anything you need."; "Offer a consultation" → "Hi <first>, our doctor can see you this week. Shall I book a consultation?"; "Send directions" → "Hi <first>, here is the clinic location: maps.app/cresence-skin." |
| reply hint | "<first name> last wrote here" (mode = channel of their last message); otherwise the button "<first name> wrote on <channel> · Switch" |
| composer warnings | "WhatsApp down · replies will queue", "Prefers no calls · message instead" (Call log + "No calls"), "Prefers contact after 6 pm" |
| modes | "WhatsApp", "Instagram", "Call log", "Note", "No Instagram on this contact" |
| placeholders | "Message to <first> on <channel>", "What happened on the call?", "Note for the team, not sent to <first>" |
| send labels | "Send WhatsApp", "Send Instagram", "Log call", "Add note" |
| message meta | "Sending…", "Delivered", "Read", "Queued", "Sent", "Not sent", "Retry" |
| auto status | "Status → Contacted (first reply)", "Status → Contacted (call logged)", "Status → <status>" |
| suggest | "Suggest", "Suggestions and templates · or type /", "Book an appointment · reason from their message", "Suggested for <first>", "Templates · type / in the box to search", "Fill in", "Close suggestions" |
| smart chips | "Share price", "Offer 2 slots", "Send location", "Explain <term>" → "Great question! <offering> works well for this — most people see results in <n sessions / a few weeks>. The doctor will check and plan it at your consultation.", "Greet", "Follow up" |
| template · Greeting | "Hi <first>, this is <me> from Cresence Skin 😊 How can I help you today?" |
| template · Price | "<offering> is ₹<price> for <n> sessions. It includes a consultation with the doctor. Shall I book you in?" (" for <n> sessions" only when the offering has more than one) |
| template · Free slots | "We have <slot> or <slot> open for <interest>. Which one suits you?" |
| template · Location | "We are at {{address}} · Google Maps: {{maps link}}. Parking is available right outside." |
| template · Reminder | "Hi <first>, a reminder of your visit {{day time}}. Reply Yes to confirm or tell us a better time." |
| template · Aftercare | "Hi <first>, how is the skin feeling today? Keep it moisturised, use sunscreen and avoid scrubs for 48 hours." |
| template · Follow-up | "Hi <first>, just checking in about <interest>. Would you like me to hold a slot for you this week?" |
| template · Review | "Thank you for visiting us, <first>! If you loved it, a quick Google review helps us a lot: {{review link}}" |
| fill-in values | address "Shop 12, Silver Point, Vesu, Surat"; maps link "maps.app.goo.gl/cresence"; review link "g.page/r/cresence/review"; day time "<day> at <h:mm am>" (fallback "tomorrow at 11 am") |
| people popover | "Search team", "Assigned to · who handles this lead now", "Assign", "Assigned", "Currently assigned", "Assign to <name>", "Only the assignee (<name>) can reassign", "<role> can’t assign to <role>", "Involved · worked on this lead", "✓ Involved = everyone who worked on this lead. Added automatically when they reply, call, note or book · you can add someone too" |
| people events | "Assigned to <name> · <previous> stays involved", "<name> is now assigned · notified", "Added <name> as involved", "Removed <name> from involved" |
| columns | "Show all columns", "All 5 columns shown", "<n> hidden", "<n> of 5 shown", "Columns · <n> of 5 shown" |
| remove | "Remove lead this lead?", "The lead leaves every list and the owner’s queue. Chat history is kept. You can undo from the toast right after.", "Duplicate", "Test entry", "Spam", "Other", "Keep it", "Lead #<id> removed · <reason>" |
| new lead | "New lead", "Name and mobile are enough to start", "Contact", "Search by name or mobile", "Quick start", "Walk-in", "Phone call", "Instagram DM", "No existing match", "New contact", "Re-create lead", "Use contact", "Change", "Pick a different contact", "After contact", "Source, interest and who handles it", "Pick or add the contact first", "Creates or updates one contact", "Cancel", "Create lead" |
| new lead toasts | "<chip> preset applied", "Existing patient <ID> · new lead will be linked", "Using existing contact <name>", "Add a name and a 10-digit mobile", "Lead #<id> created" |
| contact editor | "Edit contact", "Saved once · used by every lead, patient and chat", "One contact · shared by leads, patients and chats", "Contact ID · click to copy", "Identity & reach", "Name", "Full name", "Mobile numbers", "★ Primary", "☆ Set primary", "WhatsApp", "+ Add number", "+ Instagram", "Instagram", "@handle", "+ Add handle", "Default channel · switches to the last channel used", "Call", "SMS", "Contact preferences", "+ Custom", "Type a preference", "Next: Contact preferences", "Done", "Contact updated · applies everywhere" |
| contact editor tooltips | "Primary number · used for calls, SMS and matching", "Make this the primary number", "On WhatsApp · click to turn off", "Not on WhatsApp · click to turn on", "Remove number", "Remove this handle", "<number> is now the primary number", "Removed <handle>", "Contact ID C-<id> copied" |
| linked contact | "Linked to <name> · <kind> · channels and preferences reused", "New contact in the household of <name>", "Undo" |
| preferences | "No calls", "Sundays only", "Weekdays only", "After 6 pm", "Mornings", "Evenings", "Weekends only", "Gujarati", "Hindi", "English", "Female doctor", "Text before calling" |
