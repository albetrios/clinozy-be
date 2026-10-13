# Shared patterns (referenced by every screen file)

- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)
- Every Mobile cell gives the phone (< 760px) behaviour; tablet is as desktop unless the cell names a tablet value.

## Viewport modes and padding tokens

Comfortable = ≥ 1440px wide and ≥ 800px tall. Compact = < 1440px wide or < 800px tall (so every tablet). Phone replaces both.

| Token | Comfortable | Compact | Mobile |
| --- | --- | --- | --- |
| Page gutter around list cards | 0 20px 20px | 0 12px 12px | Phone: 0 (cards edge to edge) |
| Header sides | 20px | 12px | Phone: 12px |
| List toolbar padding | 16px 20px | 12px 12px | Phone: 8px 12px |
| Table / list sides | 20px | 16px | Phone: 14px |
| Row side next to the 3px status edge | 17px | 13px | Phone: 11px |
| Drawer sides | 24px | 20px | Phone: 16px |
| Drawer header | 76px tall, padding 14px 24px | 76px, 12px 20px | Phone: 60px, 10px 16px |
| Drawer body | 20px 24px 28px | 16px 20px 20px | Phone: 14px 16px 20px |
| Form grid gap | 16px 12px | 12px 10px | Phone: 12px 10px |
| Step card padding | 14px 16px | 12px 14px | Phone: 12px 14px |

## Right drawer (every form, detail view and confirm)

| Field | Desktop | Mobile |
| --- | --- | --- |
| Shape | side drawer from the right edge, full height, over a backdrop rgb(9 9 11 / .45) | Phone: full-screen sheet — width 100%, no shadow, no left border (still slides in from the right); tablet: as desktop |
| Size | width min(<w>, calc(100vw − 56px)). Automatic <w>: 840px when the form holds an items table · 560px for light forms (≤ 8 fields and no textarea, upload, teeth, price, stock or > 5-option chip group) · 680px otherwise. Screens may pass an explicit width (600 · 720 · 820 · 900 · 1040 occur — see each screen file) | Phone: 100% × 100% |
| Trigger | row click, "New …" button, row actions, command-menu actions, contact-card actions | same |
| Dismiss | backdrop click · Esc · floating × · footer close button | Phone: × inside the header, footer close button, Esc (no visible backdrop) |
| × button | fixed, top 14px, 14px left of the drawer edge (right: calc(<w> + 14px)), 36×36, radius 12px, white, shadow 0 4px 14px rgb(0 0 0 / .18), "×" 18px; several drawers fade it in with czpop 200ms after 200ms | Phone: inside the drawer, top 8px, right 8px, 44×44, transparent, no shadow, "×" 22px, z 1000; the header gets 56px right padding so the title clears it |
| Header | 76px (compact 76px), padding 14px 24px (compact 12px 20px), plain white with a 1px bottom hairline; title 18px/600, letter-spacing −0.01em; optional tag pill (22px, bg z100, z600, 11.5px/500); optional sub line 13px z500; optional badge row (24px pills) and "Quick fill" row (11px uppercase label + dashed 24px chips "⚡ <label>") under it | Phone: 60px, padding 10px 56px 10px 16px |
| Body | scrolls vertically only; padding 20px 24px 28px (compact 16px 20px 20px); gap 12px; 6-column form grid, gap 16px 12px (compact 12px 10px): full row = textarea, uploads, items tables, big chip groups · half = names, pickers · third = numbers, mobile, dates, codes (maxLength ≤ 16); the last field of a row stretches to fill it | Phone: padding 14px 16px 20px; a drawer whose top level is two columns (form + side column) becomes one column; a row with an 88px left label stacks (label above, control full width, gap 6px) |
| Field anatomy | label 12px/500 z600 + red required mark oklch(0.53 0.2 25) + optional hint (z500, ellipsis, never wraps); text input 36px, radius 8px, 1px divider border, 13.5px, padding 0 10px, optional z100 prefix tile ("+91") or suffix; textarea padding 9px 10px, 13.5px/1.45, vertical resize; chips 24px pills 12px/500; switch track 34×20 with 16px knob; upload zone 96px tall, 1.5px dashed z300, radius 12px, bg z50 | Phone: same sizes |
| Footer | 1px top hairline, padding 12px 24px (compact 12px 20px), gap 10px; 36px buttons, radius 8px, 13px/500. Left → right: summary text (12.5px z500, ellipsis, takes the free space) · "Delete" (red fill, only when the record can be deleted → delete confirm) · close (outline; "Cancel" by default, "Back" in a stacked child drawer, "Close" on read-only views) · "Save & add another" (outline, where offered) · red "Not saved · your changes are kept" with a 6px dot (only after a failed save) · primary (z900 fill, white; "Save" or the screen's label e.g. "Create patient"; "Saving…" while pending; "Retry save" after a failure) | Phone: wraps — padding 10px 12px calc(10px + safe-area inset), gap 8px; buttons share the row (flex 1), 44px tall, padding 0 12px; the summary text drops to its own last row, centred, 12px (hidden when empty); "Save & add another" is not offered |
| Multi-step | yes — step cards (below); Save with an unfilled required field opens that step instead of saving | same |
| Stacking | a picker's "＋ New … · “<query>”" footer opens the full drawer for that record on top (global layer, z 100); the parent stays open underneath; the child's close reads "Back"; saving closes only the child and selects the new record in the parent field | Phone: the child is also full-screen |
| Initial focus | not moved by the drawer (focus stays where it was) | same |

### Step cards (accordion inside drawers)

| Field | Desktop | Mobile |
| --- | --- | --- |
| Card | radius 12px, padding 14px 16px (compact 12px 14px); open = white + 1px z300 border; closed = bg z50 + 1px divider; one open at a time | Phone: same (12px 14px) |
| Head | 24px number circle (11px/600) + title 13.5px/600 + hint at right 12px z500 ("Edit" for done steps, "Open" for later steps); circle: open = section-tone ink fill, white number · done = green oklch(0.52 0.12 150) with "✓" · has missing required fields (not open) = red oklch(0.53 0.2 25) with "!" · later = z200 with its number | same |
| Collapsed peek | grid of mini tiles (auto-fit, min 150px, gap 6px, indented 34px): uppercase 10.5px/600 label + value 12.5px clamped to 2 lines; an empty field shows a dashed z200 tile reading "Empty" in z400; multi-select fields show each pick as a 20px pill (up to 4, then "+N"); an items table shows one full-width tile: its first column name (or "Items") + "<N> added" (or "None yet") + up to 6 name chips, then "+N"; missing required fields replace the summary with "Missing: <fields>"; click the peek to open the step | same |
| Next | each open step ends with a right-aligned 32px outline button "Next: <step title> →" | same |
| Sequence varies by input? | defined per screen — the shared card shows the steps a screen declares, in order (see each screen's Multi-step flow) | same |
| Motion | opened body: czacc 240ms cubic-bezier(.2,.8,.2,1) | same |

## Delete confirm

| Field | Desktop | Mobile |
| --- | --- | --- |
| Shape | side drawer from the right, `role="alertdialog"`, z 180–182, over a backdrop rgb(9 9 11 / .32) | Phone: stays a side drawer min(480px, calc(100vw − 56px)) — 334px at 390 — with 56px of dimmed screen on the left; × moves inside to top 8px, right 8px, 44×44, transparent; footer keeps 36px buttons; tablet: as desktop |
| Trigger | every Delete / Cancel / Void: row action, bulk bar, drawer footer "Delete" | same |
| Size | width min(480px, calc(100vw − 56px)), full height | Phone: 334px at 390 |
| Dismiss | backdrop click · × · "Keep it" (Esc does not close it) | same |
| × button | fixed, top 14px, right calc(min(480px, 100vw − 56px) + 10px), 36×36, 1px divider border, radius 8px, white, shadow-md, czpop 200ms after 200ms | Phone: top 8px, right 8px, 44×44, transparent |
| Header | min-height 76px, padding 20px <drawer sides> 12px, hairline; title 16px/600 "<Action> this <record type>?" — never the record's name (e.g. "Delete this lead?", "Cancel this purchase order?", "Void this sale?"); the record as a grey pill (24px, bg z100, 12.5px/500, ellipsis, e.g. "Rhea Shah · #2363"); one-line effect 13px z600 | same |
| Body | "Reason" (11px/600 uppercase) radio chips, 28px, 12.5px/500, tones blush · butter · lav · stone in order, selected = 1.5px ring in its ink; note textarea 2 rows, maxLength 160 | same |
| Footer | bg z50, hairline, padding 12px <table sides>: hint at left 12px z500 · "Keep it" (36px outline) · action button (36px, label = the action, e.g. "Delete"; red oklch(0.53 0.2 25) fill with white text once allowed, else bg z100, text z400, cursor not-allowed) | same |
| Multi-step | no | no |
| Initial focus | not moved | same |
| After confirm | the action runs and a toast offers "Undo" | same |

| Kind | Reasons | Effect line |
| --- | --- | --- |
| Delete (default) | "Created by mistake" · "Duplicate" · "No longer needed" · "Other" | "It disappears from lists and pickers. You can undo from the toast right after." |
| Cancel (purchase orders) | "Ordered by mistake" · "Supplier can’t deliver" · "Price changed" · "Other" | "The order stops here. Stock and supplier dues are not changed." |
| Void (sales) | "Billed by mistake" · "Wrong items" · "Customer changed mind" · "Other" | "The sale is voided and its invoice is cancelled. Stock goes back." |
| Appointment cancel (caller-supplied) | "Patient cancelled" · "Rescheduling later" · "Doctor unavailable" · "Booked by mistake" · "Other" | "The slot is released and reminders stop. You can restore it until the time passes." |
| Photo delete (caller-supplied) | "Wrong patient" · "Blurry / retake" · "Duplicate" · "Other" | default effect line |

Note placeholder: "Add a note (optional)"; with "Other": "Tell the team why (required)". Hint: "Pick a reason to continue" (no reason) · "Add a short note for “Other”" (Other without note) · empty when ready.

## Dropdown (the only picker)

| Field | Desktop | Mobile |
| --- | --- | --- |
| Shape | floating listbox panel (`role="listbox"`), never pushes layout, over a transparent tap-outside layer ("Close list", z 300; panel z 301) | Phone: bottom sheet — fixed to the bottom, full width, max-height 72%, top radius 16px, no bottom border, safe-area padding, czsheet 260ms; the tap-outside layer dims to rgb(9 9 11 / .4); tablet: as desktop |
| Trigger | 32px (sm) · 36px (md) · 44px (lg) button, radius 8px, 1px divider border (open: z400 + 3px ring rgb(161 161 170 / .25)); placeholder "Select…"; multi-select shows up to 3 picks as chips then "+N"; optional clear ×; `chevron-down` 14px rotates 180° when open | Phone: same heights (list-toolbar Filters 40px) |
| Position / size | fixed; width min(viewport − 16, max(trigger width, min width — 240px unless the field sets one)); left-aligned to the trigger (right-aligned when set), 8px from viewport edges; opens 6px below, or above (czddup) when there is less room below than needed and less than above; max-height max(150px, min(340px or the field's max, free space)) | Phone: full width, max 72% of the screen |
| Search row | shown for dynamic data always, and for static lists of more than 7 options or when the field can create: 40px, Lucide `search` 15px, input 13.5px (placeholder from the field, default "Search <label>"), 14px spinner while loading, kbd "esc"; typing in dynamic data waits 250ms, then shows skeleton rows for the fetch; remote fields wait 300ms + 450ms latency | Phone: same |
| Rows | min-height 36px, padding 4px 8px, radius 6px, 13px; leading 26px avatar (initials 9.5px/600, 12px green "P" badge for patients) or 10px tone dot with a 3px halo or 24px tinted icon tile (radius 6px) or 24px pill; label (selected single = 600) with the matched text highlighted on oklch(0.94 0.08 95); sub 11.5px z500 on the same line, wrapping under it when narrow; meta 11.5px z500 at right; then a 16px check (single, in the tone ink) or an 18px checkbox (multi, radius 6px); hover bg = tone bg 55% with white, selected = 70%; group headers 11px/600 uppercase with a 6px tone square; destructive options red after a separator | Phone: same |
| Recent | single-select lists with more than 7 options start with the group header "Recent" (uppercase; last 3 picks, per section + field, saved `cz.ddRec`) then "All" | same |
| Create | missing typed name → dashed 36px row "＋ <create label> “<query>”" (e.g. "Add supplier “Medisafe”"; default "Create “<query>”"); footer (min 44px, bg z50): 20px dark ＋ tile · "<New thing> · “<query>”" (e.g. "New supplier · “Medisafe”") · "full details" (11.5px z500) — opens that record's full drawer stacked on top | same |
| Paging | 30 rows per page; scrolling within 64px of the end (or arrowing into the last 3) loads the next page after 380ms with 2 skeleton rows ("Loading more") | same |
| Keys | ↑↓ (skip disabled, wrap) · PgUp/PgDn ±8 · Home/End · ↵ select (or create) · Esc closes and returns focus · Tab closes · type-ahead when there is no search | Phone: same keys when a keyboard is attached |
| Dismiss | outside click/tap, Esc, picking in a single-select (multi stays open) | Phone: tap on the dimmed area |

## List toolbar

| Field | Desktop | Mobile |
| --- | --- | --- |
| Layout | one wrapping row, gap 10px 8px, padding per tokens; order: h1 · tabs · (space) · search · saved views · Filters · columns · primary "New" | Phone: h1 hidden (the header chip names the section); row 1 = search (40px, grows, min 180px) + Filters (40px), row 2 = tabs scrolling sideways with no scrollbar (Leads: search takes row 1 alone, row 2 = tabs + 36px Filters at right); columns button hidden; primary button floats (below); tablet: tabs min 120px wide, grow, max their content, scroll sideways; h1 18px |
| h1 | 20px/600, letter-spacing −0.015em, padding-right 10px + 1px hairline at right | Phone: hidden; tablet: 18px |
| Tabs | segmented track: padding 3px, bg z100, radius 8px; 28px triggers, padding 0 12px, 12.5px/500, optional 14px icon; selected = white with a 1px shadow ring; tabs that don't fit fold from the right into a 28px "More" + `chevron-down` button (aria-label "More sections") that opens a listbox (min 200px); the selected tab always stays visible | Phone: 36px track on its own row, scrolls sideways |
| Search | label with Lucide `search` 15px; collapsed to a 36px square icon button while empty and unfocused; click or "/" expands it to flex 0 1 200px (min 150px, max 220px) in 220ms; stays open while it has text; placeholder per screen (e.g. "Name, mobile or #ID"); kbd "/"; title "Search · press /"; focus = border z400 + 3px ring rgb(161 161 170 / .25); waits 300ms after typing, then re-fetches the table; clearing is instant | Phone: always open, full width of row 1, 40px, padding 0 12px, kbd hidden |
| Saved views | after a filter is saved: 36px track (bg z100, padding 3px) of 28px chips "<view name>" with an 18px "×" ("Remove view"); title "Apply view" | Phone: in the wrapping flow |
| Filters | 36px outline button: Lucide `list-filter` 15px + "Filters" + dark 18px count pill when applied; while applied a joined 30px "×" ("Clear all filters", bg z100, border z400) sits on its right; opens the Filters popover | Phone: 40px on the search row (Leads: 36px beside the tabs); popover becomes a bottom sheet |
| Columns | 36px square, Lucide `eye` 16px, aria-label "Show or hide columns", title "Columns · <N> of <M> shown", dark 18px badge with the number of hidden columns; opens a plain multi-select listbox (min 260px, right-aligned) starting with "Show all columns" (sub "Recommended set hides <N>" / "Tap again for the recommended set"), searchable ("Search columns") above 8 columns | Phone: hidden (phone rows fold columns themselves) |
| Primary | 36px, padding 0 14px 0 12px, radius 8px, z900 fill, 13px/500, Lucide `plus` 16px + "New <thing>" (e.g. "New patient"); some screens split it with a 32px "⌄" segment ("More create actions" / "Create something else") or pair it with an outline button (Payments: "Pay" + "Receive") | Phone: floating pill — fixed, right 16px, bottom calc(74px + safe-area inset), z 36, 52px tall, padding 0 20px 0 16px, radius 999px, 14px, gap 8px, shadow 0 10px 28px −8px rgb(0 0 0 / .45); split or paired buttons float side by side (gap 8px), each a 52px pill (chevron segment min 44px wide) |
| View bar | sub-views of the selected tab sit under the toolbar: underlined text tabs (36px, 13px, 2px bottom border on the selected one, gap 20px) on a hairline, margin 0 20px 12px, then that view's chips after a 1px divider | Phone: wraps in place |

## Filters popover

| Field | Desktop | Mobile |
| --- | --- | --- |
| Shape | popover under the Filters button, right edges aligned, 6px gap, over a transparent tap-outside layer ("Close filters") | Phone: bottom sheet — fixed to the bottom, full width, max-height 82%, top radius 16px, czsheet 260ms; the tap-outside layer stays transparent (no dim); tablet: as desktop |
| Size | 340px (max calc(100vw − 40px)), max-height calc(100vh − 160px), radius 12px, shadow-lg, czddin 160ms | Phone: 100% wide, ≤ 82% tall |
| Header | "Filters" 13.5px/600 · "Clear all" 12px z500 text button at right; padding 12px 14px 0 | same |
| Body | sections, gap 14px: 11px/600 uppercase label + 24px chips (12px/500) in each value's colour, selected = 1.5px ring in its ink; one section per filterable column, then "Created" (Any · Today · Yesterday · Last 7 days · Last 30 days · This month · Custom range) and, where records have follow-ups, "Follow-up date" (Any · Overdue · Today · Tomorrow · Next 7 days · Not set · Custom range); "Custom range" adds "From" / "To" 32px date pickers | same |
| Footer | hairline, padding 10px 14px: "Save as view" (32px outline; reads "Saved as view" when the current filters are saved; only with ≥ 1 filter) · "Apply filter" (32px primary) at right | same |
| Behaviour | choices stay pending until "Apply filter"; Apply, "Clear all" and the joined × each re-fetch the table (skeleton rows); no skeleton and no counts inside the popover; toasts "View “<first two values joined by +>” saved" (or "View “My view” saved") / "View removed" | same |

## Table

| Field | Desktop | Mobile |
| --- | --- | --- |
| Primitive | table — never cards | Phone: still rows, but each row wraps like a compact card (below) |
| Frame | card: 1px divider border, radius 12px, shadow 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px −8px rgb(0 0 0 / .06), inside the page gutter | Phone: edge to edge — no side borders, radius or shadow |
| Header | one row above the scroller (never scrolls away), bg z50, hairline; 40px header buttons, 11px/600 uppercase, letter-spacing .03em, z500; sortable headers show Lucide `arrow-up-down` 12px at 45% opacity, and `arrow-up` / `arrow-down` at 100% when sorted (bg z150, ink z900); title "Sort by <column>"; click cycles ascending → descending → off | Phone: hidden |
| Columns | 18px checkbox track, then columns; primary column minmax(0,1fr); the recommended set shows by default (columns button for the rest); when columns don't fit they fold into the primary cell's meta line instead of scrolling | Phone: keeps the primary column + one key column + actions. Key column = highest-ranked other column: an explicit priority wins, then right-aligned (amount) columns, then plain columns, then low-priority labels (Updated, Note, Detail, Team, Email, Remark, Created, "… by", Gender, Age, Conversion, Specialty, Default), IDs last; ties → leftmost |
| Row | grid, gap 12px, padding 10px 20px 10px 17px (compact 10px 16px 10px 13px), 3px left status edge in the row's status colour, 1px z100 bottom border, hover bg z50 (120ms); primary cell = person chip (32px avatar, 14px "P" badge, name 13px/500, sub 12px z500) or text 13px (+ 11.5px sub); ID cells 22px z100 pills; status cells 24px pills; people cells 28px person chips | Phone: wrapping flex, gap 6px 12px, padding 12px 14px 12px 11px; primary cell takes the free width; key column sits top-right (max 46% wide, right-aligned); actions on their own full-width line, right-aligned |
| Meta line | folded columns under the primary cell: 11.5px/1.4, gap 2px 12px, each item "<column label> <value>" (label z500, value z700/500, optional 6px dot in the value's colour); indented 42px when the primary cell is a person; no separators; empty and "—" values skipped | Phone: up to 4 items, most important first; also drops "All branches", "Active" and "—" |
| Row click | opens the record's right drawer | Phone: tap opens the full-screen drawer |
| Row actions | actions column sticky to the right edge (solid background, shadow −8px 0 8px −8px rgb(0 0 0 / .08)), sized to fit; direct 32px icon buttons (1px border, radius 8px, icon only, always visible, tooltip = action name); destructive last, after a 1px × 18px separator, light-red bg + red icon, and always through the delete confirm; optional 30px "More actions" (Lucide `ellipsis`) | Phone: bottom line of the row, right-aligned; buttons ≥ 40×36 (labelled ones 36px tall, padding 0 12px 0 10px); "More actions" 40×36 with a 1px border; tablet: buttons ≥ 36×36 |
| Selection | 18px checkbox (radius 6px, 1.5px border) hidden until row hover / focus or any row is selected (always shown on touch screens); tri-state "Select all" in the header; shift-range; selecting docks a dark 44px bulk bar into the footer (czbulk 220ms): 18px white check tile · "<N> selected" 13px/600 · underlined "Select all <N>" (when partial) · divider · bulk actions (30px, icon + label 12.5px/500) · kbd "Esc" · × "Clear selection" (title "Clear selection · Esc"); Esc clears | Phone: no checkboxes and no footer — no selection or bulk bar |
| Footer | 44px, hairline, bg z50, padding 0 <table sides>, 12px z500: count/summary at left (e.g. "12 appointments", never "x of N"); at right, when columns are folded, a 28px outline button "<N> columns in rows · Show all" (Lucide `maximize-2`; tooltip "Show every column side by side (scrolls sideways)") ↔ "Fit to width" (Lucide `minimize`; tooltip "Fold extra columns into each row") | Phone: hidden |
| Length | the whole list is loaded; above 60 rows only the visible rows + a 10-row overscan render; the list ends with "All <records> loaded" (12px z500 between two hairlines, e.g. "All patients loaded") | same |
| Mobile behaviour | columns fold into the meta line; sideways scroll only after "Show all" (header and rows share one min-width) | Phone: collapse to wrapped rows as above (no horizontal scroll, no "Show all") |
| Pagination | none visible — whole list, virtualised; no page controls, no totals | same |

## Item rows inside drawers (items tables)

| Field | Desktop | Mobile |
| --- | --- | --- |
| Frame | 1px divider border, radius 12px; header row 34px, bg z50, 10.5px/600 uppercase .04em z500; rows grid, gap 8px, padding 6px 10px, 1px z100 bottom border; footer row "+ <add label>" (32px dashed z300 button) + total at right 13px/600 | Phone: header row hidden; each row wraps (gap 8px 10px, padding 10px 12px): first cell takes the whole first line, the other cells follow, the last cell is pushed right, a full-width note line keeps its own row |
| Quick line | where offered, a 44px input above the table ("↵ add" kbd, parsed shorthand shown as 22px green pills) + a 44px "Browse" button; matches float in a popover (max 360px, czddin) with footer "↑↓ choose · ↵ add · Esc clear"; no match: "No match. Check the spelling or try fewer letters." | Phone: same, full width |
| Browse | floating popover (radius 12px, czddin): group chips (24px) + × "Close browse"; grid of 180px tiles (name, sub + price, or a green [− n +] stepper once added); footer 44px "<N> added" (none yet: "Tap a tile to add"; over 60 tiles: "· Showing 60 of <N> · type to narrow") + "Done"; empty group: "Nothing in this group matches." | Phone: same popover |

## Chat column (one shared column)

One conversation column bound to the current person (the lead chat). It appears in the lead drawer, the lead edit form, the appointment form (edit mode), the task drawer and the patient file.

| Field | Desktop | Mobile |
| --- | --- | --- |
| Placement | right-hand column of its host. Lead drawer: total width min(980px, 94vw), chat width max(360px, min(420px or the dragged width, total − 400px)), resizable from its 7px left edge (360–680px; double-click resets; title "Drag to resize · double-click to reset"). Appointment form: beside a 560–760px form. Task drawer: second column of the min(900px, 100vw − 40px) drawer. Patient file: right column while its chat toggle is on (only at ≥ 760px) | Phone: lead drawer → full-width "Chat" pane under a 52px bar (36px back button `chevron-left` + segmented "Details" · "Chat"; Chat is the default; a green count pill on "Chat" shows unread messages when it is not selected); patient file → the chat replaces the file content while on (off by default); appointment form and task drawer → no chat column |
| Header | height = the host's header height (76px; phone 60px), padding 10px <table sides>, white, hairline: 34px avatar (lav for a lead, sage for a patient) with a 14px green "P" badge for patients · name 13.5px/600 · phone 11.5px z500 | Phone: same |
| Thread | bg z50, padding 14px <table sides>, gap 10px, newest at the bottom; top divider line (11px z500 between hairlines): "Lead created · <time> · via <source>", or for a person without a lead "Patient · chat only · no lead" / "Contact · chat only · no lead" | Phone: same |
| System lines (contact history) | centred clickable chips, max 86% wide, min-height 28px, padding 4px 14px 4px 5px, 1px divider border, white, radius 999, 11.5px z600: 18px tone circle with a 12px icon · text (ellipsis) · time (z500). History is merged from the person's appointments (+ reminders), prescriptions, treatments, invoices, payments, check-ins, reviews and task outcomes, oldest → newest, with the conversation; clicking opens the appointment form or the patient-file section; reminders and task outcomes are not clickable | Phone: same |
| Messages | bubbles max 68% wide, padding 9px 13px, radius 8px, 13.5px/1.45. Outgoing (right): channel tone bg + line (WhatsApp sage, Instagram blush, SMS butter, Email lav); incoming (left): channel tone bg mixed 55% with white; call log: sky; note: butter with a dashed line. Meta 11px: sender ("<team member>", "<team member> · call", "<team member> · note", or the contact's first name; hover opens the team card "Sent this") · "·" · 12px channel glyph · time · delivery ("· Sent" / "· Delivered" / "· Read" in green / "· Queued" in butter ink / "Sending…" / "Not sent" + 22px "Retry" pill) | Phone: same |
| Empty | dashed card (1px z300, radius 12px, padding 18px 14px, centred): "No conversation yet" 12.5px/600 + situational line 12px z500 + three 28px starter chips; a chip switches to WhatsApp and fills the box | Phone: same |
| Composer | top hairline, padding 10px <table sides> 12px, bg = tone of the chosen channel (WhatsApp sage, Instagram blush, Call log sky, Note butter; 200ms). Row 1: "Send via" segmented control (`role="tablist"`, track padding 3px, 32px buttons, 14px glyphs; labels only when the column is ≥ 460px wide): WhatsApp (only if the contact is on WhatsApp) · Instagram (disabled at 45% with tooltip "No Instagram on this contact" when there is no handle) · "Call log" (`phone`) · "Note" (`pencil`); selected = solid fill (WhatsApp oklch(0.52 0.13 150), Instagram #DD2A7B, Call log oklch(0.50 0.12 235), Note oklch(0.52 0.11 70)) with white glyph, 600. Then, on the same wrapping row: reply hint or channel-mismatch chip, outage line, preference warning. Box: 1px border in the channel's ink, radius 12px, white; textarea 3 rows (min 60px), 13.5px/1.5, maxLength 1000; ↵ sends, Shift+↵ new line. "Fill in" row when the text holds {{variables}}: dashed butter chips, one per variable, each replacing the first remaining {{…}} with the clinic value. Bottom bar: "Suggest" (`sparkles` 14px, 30px, 12px/600; tooltip "Suggestions and templates · or type /") and a 30px Book button (`calendar` 15px, aria-label "Book an appointment", tooltip "Book an appointment · reason from their message") — both hidden for Call log and Note — then the send button at right (30px, `send` 13px, filled in the channel colour) | Phone: same; the column is the whole screen |
| Suggestions popover | above the box (full composer width, 8px gap), max-height 340px, padding 12px, radius 12px, shadow-lg, czddup 160ms: `sparkles` + "Suggested for <First>" + × ("Close suggestions"); smart chips (28px pills, 13px icon, 12px/600) picked from the contact's last message; label "Templates · type / in the box to search" (10.5px/600 uppercase z500); template rows (24px tone tile + name 12.5px/600 + preview 11.5px z500 ellipsis). Typing "/" first opens it and filters by the text after "/"; picking fills the box and closes it | Phone: same, inside the full-screen column |
| Drafts | unsent text is kept per lead while moving between leads and restored on return (in memory, not saved across reloads) | same |
| Side effects | the first outgoing reply on a New or Re-targeted lead sets it to Contacted (system line "Status → Contacted (first reply)"); logging a call on a New lead does the same ("Status → Contacted (call logged)"); sending on another channel makes it the lead's default channel; a sent message reads "Sending…" then "Delivered" after 1000ms; during a WhatsApp outage WhatsApp messages stay "Queued" | same |

| Key | Exact string |
| --- | --- |
| Placeholder · message | "Message to <First> on <Channel>" (no name: "Message to the lead on WhatsApp") |
| Placeholder · note | "Note for the team, not sent to <First>" |
| Placeholder · call log | "What happened on the call?" |
| Send button | "Send WhatsApp" · "Send Instagram" · "Log call" · "Add note" |
| Reply hint | "<First> last wrote here" |
| Channel mismatch chip | "<First> wrote on <Channel> · Switch" |
| Outage | "WhatsApp down · replies will queue" |
| Preference warnings | "Prefers no calls · message instead" (Call log + No calls) · "Prefers contact after 6 pm" |
| Empty title | "No conversation yet" |
| Empty line · visit coming | "<First>’s <service> is <today / tomorrow / on 9 Oct> at <4:00 pm> · a quick WhatsApp keeps the slot" |
| Empty line · past visits only | "Every WhatsApp, call and note with <First> shows here" |
| Empty line · no visits | "Start with a WhatsApp · replies land here" |
| Starters · visit today, not checked in | "Are you on your way?" · "Send directions" · "Offer a new time" |
| Starters · visit later | "Confirm the visit" · "Prep instructions" · "Send directions" |
| Starters · past visits only | "Ask how it went" · "Book the next session" · "Share an offer" |
| Starters · no visits | "Say hello" · "Offer a consultation" · "Send directions" |
| Starter texts | "Hi <First>, we are ready for your <service> at <time>. Are you on your way?" · "Hi <First>, here is the clinic location: maps.app/cresence-skin. See you at <time>!" · "Hi <First>, if <time> does not work today, reply with a time that suits you and we will move it." · "Hi <First>, a reminder of your <service> <day> at <time>. Reply Yes to confirm." · "Hi <First>, before your <service> <day>: come without makeup and avoid sun for 24 hours. See you at <time>!" · "Hi <First>, here is the clinic location: maps.app/cresence-skin. See you <day> at <time>." · "Hi <First>, how is your skin feeling after the last visit? Any questions for the doctor?" · "Hi <First>, shall we book your next session? Reply with a day that suits you." · "Hi <First>, we have a special on your usual treatment this month. Want the details?" · "Hi <First>, this is <user name, e.g. Riya S.> from Cresence Skin. Happy to help with anything you need." (no name: "Hi there, …") · "Hi <First>, our doctor can see you this week. Shall I book a consultation?" · "Hi <First>, here is the clinic location: maps.app/cresence-skin." |
| Smart chips | "Share price" (butter, `wallet`; tooltip "They asked about price") · "Offer 2 slots" (sky, `calendar`; tooltip "They asked about timing") · "Send location" (lav, `map-pin`) · "Explain <keyword>" (mint, `sparkles`) · fallback set "Greet" (sage, WhatsApp glyph) · "Offer 2 slots" · "Follow up" (butter, `phone`) |
| Templates | Greeting (sage): "Hi <First>, this is <user first name> from Cresence Skin 😊 How can I help you today?" · Price (butter): "<Offering> is <₹ price>[ for <n> sessions]. It includes a consultation with the doctor. Shall I book you in?" · Free slots (sky): "We have <slot> or <slot> open for <interest>. Which one suits you?" · Location (lav): "We are at {{address}} · Google Maps: {{maps link}}. Parking is available right outside." · Reminder (sky): "Hi <First>, a reminder of your visit {{day time}}. Reply Yes to confirm or tell us a better time." · Aftercare (mint): "Hi <First>, how is the skin feeling today? Keep it moisturised, use sunscreen and avoid scrubs for 48 hours." · Follow-up (butter): "Hi <First>, just checking in about <interest>. Would you like me to hold a slot for you this week?" · Review (sage): "Thank you for visiting us, <First>! If you loved it, a quick Google review helps us a lot: {{review link}}" |
| Explain text | "Great question! <Offering> works well for this — most people see results in <n sessions / a few weeks>. The doctor will check and plan it at your consultation." |
| Template search empty | "No template matches “<query>”" |
| Fill in | "Fill in" + chips "address" · "maps link" · "day time" · "review link" |
| History · appointment | "Appointment #<id> · <service> · <status> · <doctor>" (`calendar`, status tone) |
| History · reminder | "Reminder sent · <service> · <date time>" (WhatsApp glyph, sage) |
| History · prescription | "Rx #<id> · <medicines> · <doctor>" (`pill`, sage) |
| History · treatment | "<treatment> · session <n> · <therapist>" (`sparkles`, lav) |
| History · invoice | "<type> invoice #<id> · <₹ bill> · <₹ due> due" or "… · Paid" (`receipt`, butter when due, else sage) |
| History · payment | "Received <₹ amount> · <mode> · #<invoice>" or "Refund …" (`wallet`, mint) |
| History · check-in | "Check-in · <feeling> · <score>/10 · after <service>" (`message-square`, sage; blush when Worse) |
| History · review | "<source> review · <rating>★" (`star`, butter; blush at ≤ 3★) |
| History · task | "Task · <title> → <result>" (`circle-check`, plum) |
| Times | "Today 4:00 pm" · "Tomorrow" · "Yesterday" · "9 Oct 4:00 pm" (12-hour, lowercase am/pm) |

## Command menu (⌘K)

| Field | Desktop | Mobile |
| --- | --- | --- |
| Shape | centered dialog (`aria-label="Command menu"`), 12vh from the top, over rgb(9 9 11 / .35) (czfade 150ms); the app's only centered dialog (the photo viewer and the signed-out screen are full-screen) | Phone: same centered dialog, full width minus 32px (358px at 390); tablet: as desktop |
| Trigger | header search button · ⌘K / Ctrl K (toggles) · ⌘K command actions | Phone: header search icon |
| Size | width min(640px, 100% − 32px), max-height min(560px, 76vh), radius 12px, shadow 0 24px 64px rgb(0 0 0 / .22), czddin 160ms | Phone: 358px at 390, ≤ 76vh |
| Header | 52px input row: `search` 15px · input 15px, placeholder "Search or jump to…", aria-label "Search" (focused on open) · kbd "esc" | same |
| Results | `role="listbox"`, padding 6px; group headers 11px/600 uppercase z500; rows 40px, radius 8px: 15px icon (z500) · title 13.5px/500 · sub at right 12px z500 (max 45%); active row bg z100. Groups and limits: "Actions" (always): "New lead" (Leads) · "New appointment" (Appointments) · "New patient" (Patients) · "New receipt" (Payments) · "Open tasks" (Tasks), max 5 · "Go to" (once typing; sub "Screen"): Leads, Appointments, Patients, Medical, Stock, Payments, Tasks, Offerings, Users, max 4 · "Patients" (from 2 letters; name, 3+ phone digits or #ID; sub "#<id> · •••• <last 4 digits>"), max 6 · "Leads" (sub "#<id> · <status>"), max 5 · "Invoices" (title "<type> invoice #<id>", sub "<patient> · <date>"), max 4 | Phone: same; opening a patient from here leaves the patient-file chat closed |
| Footer | 36px, bg z50, 11.5px z500: kbd "↑" kbd "↓" "move" · kbd "↵" "open" · right: "Type 2+ letters to search patients, leads and invoices" (until 2 letters) | same |
| Keys | ↑↓ wrap · ↵ opens · Esc closes | Phone: same keys when a keyboard is attached |
| Dismiss | backdrop click, Esc, ⌘K | Phone: tap outside |
| Initial focus | the input | same |

## Contact card (hover on any person)

| Field | Desktop | Mobile |
| --- | --- | --- |
| Shape | popover anchored to the person trigger (`role="dialog"`, aria-label "Contact"), z 80 | Phone: no phone rule — the same 320px popover, opened by the touch-emulated hover, clamped 8px inside the screen |
| Trigger | hovering any person (name chips in tables, drawers, chat): opens 280ms after hover, then stays hidden while the contact loads (650ms) and appears with data; leaving the trigger and card closes it after 220ms; hovering the card keeps it | Phone: tap |
| Placement | below → above → right → left of the trigger (below when ≥ 260px free, 6px gap, 8px viewport margin); max-height min(520px, free space), at least 200px; transform-origin at the anchored corner | Phone: same rule |
| Size | 320px, radius 12px, shadow 0 16px 40px −12px rgb(0 0 0 / .22), 0 4px 12px −4px rgb(0 0 0 / .08), czddin 160ms | same |
| Header | tinted (patient oklch(0.975 0.012 150), lead oklch(0.975 0.012 295), else z50), padding 14px 12px 14px 14px: 48px avatar (16px "P" badge for patients) · name 15px/600 (a link to the patient file with "↗" when a patient record exists; title "Open patient file") · patient ID in tone ink 600 + "Since <date>" or "Lead since <date>" 11.5px z600 · pills: "Patient" / "Lead" / "Contact" + up to 2 tags · 28px "Edit contact" (`pencil` 13px) and, inside forms only, "Change contact" (`refresh-cw` 13px, title "Pick a different contact") | same |
| Body | scrolls; section labels "Reach", "Team", "About" are 11px/600 uppercase z500: "Reach" — one 32px-tile row per number / handle (WhatsApp glyph on sage, `phone` on sky, Instagram glyph on blush): value 13px/600 + sub ("WhatsApp · primary", "Phone · alternate", "Instagram") + 28px links (WhatsApp, Call, "Open Instagram") + "Copy" (`copy`; toast "Copied <value>"); none: "No phone or handle saved yet" · "Team" chips (28px) with "Open · Claim" when an open lead can be claimed · "About" rows with 14px icons: `users` gender · age ("Female · 32 yrs"), `message-square` language, `map-pin` area, `house` household, `tag` "Came via <source>", `wallet` credits ("<₹> to return to them · <₹> they owe the clinic"), `sparkles` reviews ("<N> reviews · latest 5★ on Google · 20 Sep"), `shield` consent pills "✓ Data" / "✕ Photos" / "✓ Marketing" (sage when given, z100 when not; tooltip "Consent · Data") | same |
| Footer | bg z50, hairline, padding 10px 14px 12px, equal grid of 32px outline buttons: "+ Lead" (title "New enquiry for this contact") · "+ Appointment" ("Book for this contact") · "+ Patient" ("Create a patient record for this contact"; only when not a patient → toast "Patient record created for <name> · contact updated") | same |

## Team card (hover on a team member)

| Field | Desktop | Mobile |
| --- | --- | --- |
| Shape | popover anchored to the person (`role="dialog"`, aria-label = name), z 80, 320px, radius 12px, shadow-lg, czddin 160ms; placement as the contact card | Phone: same popover (no phone rule) |
| Trigger | hover a team avatar / name (owners, "Sent this" in chat, assignees): opens 160ms after hover, hidden while loading (220–480ms), closes 200ms after leaving | Phone: tap |
| Header | padding 14px: 48px avatar in the member's tone + 12px status dot (online green oklch(0.65 0.14 150), offline z300) · name 15px/600 · role 12px z600 · "Online now" / "Offline" 11.5px with a 6px dot · kind pill at right (22px): "Assigned" (dark), "Sent this" (sage), "Treating" (doctor), others z100 | same |
| Body | optional 36px dark button "Assign to yourself" (or the caller's label); "Reach" (11px/600 uppercase label): `phone`, `mail`, `house` (branches, e.g. "Adajan · Vesu"), `clock` ("Works 10:00 – 19:00"), 13px icons, 12.5px z700 | same |
| Footer | bg z50, hairline, 11px z500: "Updated HH:MM" ("Fetching latest…" while loading) | same |

## Toasts

| Field | Desktop | Mobile |
| --- | --- | --- |
| Shape | bottom-centred bar (`role="status"`), bottom 16px, z 50, padding 10px 16px, gap 14px, radius 8px, bg z900, text z50 13px, shadow-lg, max-width 80%; no enter animation | Phone: bottom calc(76px + safe-area inset) (above the tab bar), max-width calc(100% − 24px), width fits the text |
| Action | optional outline button (1px z400 border, z300 text, padding 3px 10px, radius 8px, 12.5px): "Undo" by default, "Retry" for failures | same |
| Duration | 5200ms (failures 9000ms); a new toast replaces the current one | same |
| Auto-undo | any toast whose text contains removed, deleted, cancelled, discarded, archived or stopped gets "Undo", which restores the previous data | same |

## Tooltip (one for the app)

| Field | Desktop | Mobile |
| --- | --- | --- |
| Shape | single portal element, z 100000, padding 5px 8px, radius 6px, bg z900, text z50 11.5px/500, line-height 1.3, no wrap; 4px arrow pointing at the control | Phone: never shown; tablet: as desktop |
| Trigger | any element with a tooltip text, every row-action button, any icon button with aria-label + title; shows 160ms after hover (fade + 2px rise, 120ms ease); on touch screens a tap shows it for 1400ms; hides on scroll, wheel, key press and 60ms after a click | Phone: never shown; tablet touch: shown for 1400ms on tap |
| Placement | 8px above the control, centred, 6px from viewport edges; flips below when there is no room above; arrow follows the control | Phone: never shown |

## Upload tray

| Field | Desktop | Mobile |
| --- | --- | --- |
| Shape | floating panel (`role="status"`, aria-live polite, aria-label "Uploads"), fixed right 20px, bottom 20px, z 95, 320px, max-height 320px, radius 12px, shadow 0 12px 32px rgb(0 0 0 / .14), czddin 160ms | Phone: no phone rule — same 320px panel at right 20px, bottom 20px (over the 58px tab bar) |
| Header | 40px, 12.5px/600: "Uploading <left> of <total>…" → "All uploads complete" | same |
| Rows | 28px tile (`camera` on blush for images, `file` on stone otherwise, 14px) · name 12.5px/500 (ellipsis) over a 4px progress bar (z900, green when done; 150ms) · meta 11.5px z500 "<n>%" → "✓ <size>" ("1.2 MB", "84 KB"); each finished row leaves after 1400ms; the tray closes when empty | same |
| Limits | files over 10 MB (photo uploads 15 MB) are skipped with the toast "<n> file(s) over 10 MB skipped" | same |

## Photo viewer

| Field | Desktop | Mobile |
| --- | --- | --- |
| Shape | full-screen dialog (aria-label "Photo viewer"), z 96, bg rgb(9 9 11 / .94), rows 56px · image · 64px, czfade 150ms; the only full-bleed overlay | Phone: same full-screen layout (no phone rule) |
| Top bar | bg rgb(9 9 11 / .6), padding 0 16px, gap 12px: name 14px/600 + meta 12px z400 ("<body part> · <date> · <album>") · position "<n> of <total>" 12px z400 · zoom group (36px: "−" "Zoom out (−)", "<zoom>%" "Fit to screen (0)", "+" "Zoom in (+)") · 40px round buttons: "Edit details" (`pencil`; "Edit name, date, body part"), "Delete photo" (`trash`; hover red; → delete confirm), "Close viewer" ("×"; "Close (Esc)") | Phone: same (tooltips hidden) |
| Image | min(92%, 1100px) × 92%, radius 8px, contained; zoom steps ×1.25 (buttons, + / −) and ×1.12 (wheel), transform 120ms ease; cursor zoom-in, grab when zoomed; drag pans only while zoomed; prev / next 40px round buttons 16px from the sides when there are 2+ photos ("Previous (←)", "Next (→)"); no file: `image` 20px + "Sample photo · no file attached" | same |
| Hints row | 12px z400, centred, gap 16px: "← → browse" · "Scroll or + − zoom" · "Drag to move · double-click to reset" · "Esc close" | same |
| Keys | ← → browse · + − zoom · 0 fit · Esc close; wheel zooms, double-click toggles 2× ↔ fit | Phone: same keys when a keyboard is attached; no pinch or swipe — zoom and browse with the on-screen buttons |

## Global behaviour

| Field | Value |
| --- | --- |
| Esc order | command menu → open dropdown → table selection → open drawer → other popovers |
| "/" | focuses the visible list search |
| j / k | in the Leads list only: move a keyboard row focus (2px z300 inset bar + bg z50); ↵ opens the focused lead |
| Double-click guard | every button ignores a repeat click within 450ms (toggles, tabs, ×, steppers and menu triggers excepted) |
| Hover cards | fetch first, then show — never a skeleton popover |
| Overlays | every backdrop is a full-screen transparent (or dimmed) layer; click / tap outside always closes |

## States (defaults for every screen)

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Page / section switch | content is replaced in place by #efeff1 bars (0.72em tall, radius 6px, widths cycling 64% / 48% / 60%, czsk shimmer 1.1s); avatars stay round, icons hide, inputs become 8px-radius bars; clicks off, cursor progress. Page 260–560ms, section 200–440ms, +280–600ms on 10% of loads | per screen | toast "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" (9s; 5% of page and table loads); the last rows stay |
| Table | the same bars inside the rows (header stays) for 160–380ms after a search, sort or filter | illustration (96px dashed ring, tinted 68px disc, 40px white tile with the section icon 18px, 10px and 6px dots) + title 15px/600 + hint 12.5px z500 (max 320px) + optional 36px primary button; with filters applied: `search` icon, "No matches", "Nothing matches these filters. Clear them to see everything again."; fallback title "Nothing here yet" | as Page |
| Drawer open | the same bars in the top-most drawer's scroll area for 200–440ms | per screen | n/a — local data |
| Drawer save | primary reads "Saving…" for 320–740ms | n/a — a save has no empty state | 10% of saves (or offline): drawer stays open with the draft, footer red "Not saved · your changes are kept", button "Retry save", toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" (9s) |
| Dropdown | remote / dynamic search: 4 skeleton rows (bars 62% / 48% / 70% / 40%, czddsk 1.2s) + spinner in the search row; paging: 2 rows "Loading more" | "Nothing to pick yet" (or the field's own text); with a query: "No results for “<query>”" + "Try a name, phone number or ID" (remote) / "Check the spelling or try fewer letters" | n/a — local data |
| Command menu | none — instant local search | "No matches. Try a name, phone or #ID." | n/a — local data |
| Chat column | the host drawer's bars | "No conversation yet" card | a failed message (seeded only, sends never fail) shows "Not sent" + "Retry"; WhatsApp outage: "WhatsApp down · replies will queue", messages "Queued" |
| Hover cards | hidden until loaded (contact 650ms, team 220–480ms) | contact: "No phone or handle saved yet" | n/a — the card simply does not open |
| Upload tray | "Uploading <left> of <total>…" with per-file bars | tray hidden | "<n> file(s) over 10 MB skipped" |
| Photo viewer | n/a — opens on a loaded image | "Sample photo · no file attached" | n/a — local files |

## Icons (shared)

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Section: Today · Leads · Appointments · Patients | Lucide `house` · `user-plus` · `calendar` · `users` | 16px (tab bar 16px) | yes |
| Section: Medical · Clinic stock · Payments · Tasks | `pill` · `package` · `wallet` · `square-check` | 16px | yes |
| Section: Offerings · Users · Blueprint | `tag` · `shield` · `clipboard-list` | 16px | yes |
| All sections / tab bar More | `compass` | 16px header, 18px tab bar | yes |
| Pin toggle · branch picker | `map-pin` | 14px · 13px | yes |
| Search | `search` | 15px | yes |
| How data connects · Appearance "System" | `share-2` | 15px · 13px | yes |
| Appearance Light · Dark | `sun` · `moon` | 13px | yes |
| Log out · back buttons | `chevron-left` | 15–16px | yes |
| Every dropdown chevron | `chevron-down` (rotates 180° open) | 14px | no |
| Dropdown check · multi checkbox | `check` | 12px | yes |
| Close / remove | `x` (or the "×" glyph on drawers) | 13px · 18px glyph | yes |
| New buttons · create rows | `plus` | 16px · 14px | no |
| Filters | `list-filter` | 15px | no |
| Columns | `eye` | 16px | yes |
| Sort | `arrow-up-down` · `arrow-up` · `arrow-down` | 12px | yes |
| More actions | `ellipsis` | 14px | yes |
| Show all · Fit to width | `maximize-2` · `minimize` | 14px | no |
| Edit · Delete · Copy | `pencil` · `trash` · `copy` | 13px | yes |
| Change contact | `refresh-cw` | 13px | yes |
| WhatsApp · Instagram | key `wa`, key `insta` — brand glyphs, not Lucide | 12–15px | yes |
| Call · Email · SMS | `phone` · `mail` · `message-square` | 12–15px | yes |
| Chat Suggest · Book · Send | `sparkles` · `calendar` · `send` | 14px · 15px · 13px | yes |
| History lines | `calendar` · `pill` · `sparkles` · `receipt` · `wallet` · `message-square` · `star` · `circle-check` | 12px | yes |
| Upload tray | `camera` · `file` | 14px | yes |
| Photo viewer | `pencil` · `trash` · `chevron-left` (next = rotated 180°) · `image` | 16–20px | yes |
| About rows (contact card) | `users` · `message-square` · `map-pin` · `house` · `tag` · `wallet` · `sparkles` · `shield` | 14px | yes |

Library: Lucide (stroke 1.6 for section/content icons, 2 for chevrons, checks, ×, plus and search inside pickers) · Weight: outline

## Motion (shared)

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Popover / dropdown / hover card (czddin) | opacity 0→1, translateY(−4px) scale(.985) → none | 160ms | cubic-bezier(.2,.8,.2,1) |
| Popover opening upward (czddup) | opacity, translateY(4px) scale(.985) → none | 160ms | cubic-bezier(.2,.8,.2,1) |
| Phone bottom sheet (czsheet) | translateY(28px) + opacity 0 → none | 260ms | cubic-bezier(.32,.72,0,1) |
| Drawer panel (czdrawer) | translateX(100%) → 0 | 340ms | cubic-bezier(.32,.72,0,1) |
| Drawer backdrop (czbd) | background-color from transparent | 340ms | cubic-bezier(.32,.72,0,1) |
| Floating × (czpop) | opacity 0, scale(.9) → none | 200ms after a 200ms delay | cubic-bezier(.2,.8,.2,1) |
| Lead drawer panes | transform | 340ms | cubic-bezier(.32,.72,0,1) |
| Command menu backdrop · photo viewer (czfade) | opacity | 150ms | ease |
| Signed-out screen (czfade) | opacity | 300ms | ease |
| Step body (czacc) | opacity, translateY(−4px) → none | 240ms | cubic-bezier(.2,.8,.2,1) |
| Bulk bar (czbulk) | translateY(100%) → none | 220ms | cubic-bezier(.32,.72,0,1) |
| List search expand | flex-basis, max-width, min-width (bg 120ms) | 220ms | cubic-bezier(.2,.8,.2,1) |
| Header tabs · tab-bar pill | background, color, box-shadow | 160ms | ease |
| Segmented tabs | background, color, box-shadow | 150ms | ease |
| Chevrons | rotate 180° | 150ms | ease |
| Tooltip | opacity, translateY(2px) → none (160ms show delay) | 120ms | ease |
| Row checkbox reveal | opacity | 120ms | ease |
| Chat composer tint | background, border-color | 200ms | ease |
| Skeleton shimmer (czsk) | background-position | 1.1s, infinite | ease |
| Dropdown skeleton (czddsk) | background-position | 1.2s, infinite | ease |
| Spinner (czspin) | rotate 360° | 700ms, infinite | linear |
| Upload progress | width | 150ms | ease |

Reduced-motion: every animation and transition runs 1ms with no delay and one iteration (shimmer and spinners stop), and smooth scrolling is off — global, no exceptions.
