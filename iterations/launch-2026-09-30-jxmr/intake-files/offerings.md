# Screen: Offerings

- Route: /offerings (tab Offerings) · /offerings/offers (tab Offers); drawers /offerings/create, /offerings/:offeringId/edit, /offerings/offers/create, /offerings/offers/:offerId/edit — proposed, the prototype switches screen state without URLs
- Purpose: What the clinic sells: offerings (treatments, packages, LHR, products, consultations) with their prices, and the limited-time offers that change those prices.
- Entry points: header pinned tab "Offerings" (when pinned) · "All sections" compass list · ⌘K "Go to" → "Offerings" (after typing) · phone: tab bar (when pinned) or "More" → All sections sheet · the stacked "New offering" drawer opens from Payments › invoice line picker ("New offering · “query”" … "full details")
- Exit points: Offering drawer · Offer drawer · Delete confirm · stacked "New offering" returns to the invoice it was opened from
- Access: section permission "Offerings" — View to see the screen (default preset: Admin only; no other built-in role starts with it), Create for "New offering" / "New offer", Edit for row Edit / Pause / Resume and an editable drawer, Delete for every Delete; the Lowest price control needs the special permission "See the lowest price"
- Layout shell: app shell
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: lime.

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| Toolbar | h1 "Offerings" · view tabs "Offerings" / "Offers" · search · "Filters" · columns button (eye) · "New offering" / "New offer" | one row, padding 16px 20px (12px 12px when compact: < 1440px wide or < 800px tall); h1 20px/600 with a hairline on its right; tabs next to it; search collapsed to a 36px icon until clicked or "/" is pressed, then 200px (150–220px); Filters, eye and New pushed right | Phone: h1 hidden (the header chip names the page); row 1 = search field always open (40px, full width minus Filters, "/" kbd hidden) + "Filters" (40px); row 2 = the two tabs as a sideways-scrolling strip; eye button hidden; "New offering" / "New offer" becomes a 52px pill FAB fixed 16px from the right edge and 74px above the bottom (over the 58px tab bar). Tablet: one row, h1 18px, tabs become a scrolling strip (min 120px) so search · Filters · eye · New stay on the row | New button text follows the open tab |
| Table card | the Offerings or Offers table, its 40px sticky header and a 44px footer | white card, 1px border, 12px radius, shadow 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px −8px rgb(0 0 0 / .06), fills the remaining height; margin 0 20px 20px (0 12px 12px compact) | Phone: full-bleed (no radius, side borders or shadow, margin 0); header row, footer and row checkboxes hidden; rows reflow (see Data display). Tablet: as desktop; columns that don't fit fold into the row's meta line and the footer shows "N columns in rows · Show all" | the footer is empty on desktop unless rows are selected |
| Bulk bar | "N selected" · "Select all N" · "Export" · "Print" · "Esc" · × | replaces the footer content (dark, 44px) while ≥ 1 row is selected | Phone: never shown (no checkboxes). Tablet: as desktop | slides up 220ms; Esc clears the selection |
| End line | "All offerings loaded" / "All offers loaded" between two hairlines | under the last row, 12px grey | Phone and tablet: same | shown whenever the table has rows |
| Drawers | Offering drawer · Offer drawer · stacked New offering · Delete confirm | right side drawers over a backdrop rgb(9 9 11 / .45) | Phone: Offering, Offer and stacked drawers are full-screen sheets; Delete confirm stays a right drawer 100vw − 56px wide | see Popups |

## Data display

### Offerings tab

Primitive: table

| Field | Value |
| --- | --- |
| Columns (ordered) | checkbox · ID (grey pill "#274") · Offering (name 13px/500; grey sub-line = description, or "Valid 60 days" when it has a validity) · Category (pill in the category colour) · Price (right-aligned, 600: the price billed today; sub-line "was ₹1,500 · 20% off" in sage ink, or "list price" in grey) · Offer (pill of the best running offer in that offer's colour; tooltip = its value, e.g. "20% off") · Branches (branch chips in each branch's colour, or a grey "All branches" chip; empty cells when only one branch is open) · Duration ("45 min", or "—") · Sessions ("6 sessions + 1 free", "1 session"; sub-line "valid 180 days") · Status ("Active" sage with dot / "Inactive" grey with dot) · Updated (22px avatar of who saved it + "Sep 25 · 11:44"; hidden by default) · row actions |
| Column widths | 24px · 64px · minmax(200px, 1.6fr) · 120px · 130px · minmax(130px, 1fr) · minmax(120px, .9fr) · 84px · 130px · 104px · minmax(150px, 1fr) · actions sized to their buttons (107px for Edit + Delete); 12px column gap; Updated hidden by default — eye button title "Columns · 8 of 9 shown" |
| Sortable | ID, Offering, Category, Price (by the billed price), Duration, Sessions, Status, Updated — header click cycles ascending → descending → off (12px arrow-up-down at 45% opacity, then arrow-up / arrow-down); Offer and Branches are not sortable; default order = newest ID first |
| Row height | 10px top and bottom padding (≈ 53px with a two-line cell); 20px sides (16px compact); 3px left edge in the offering's colour |
| Row click | opens the Edit offering drawer |
| Row actions | always visible 32px icon buttons with tooltips: Edit (pen-line) · 1px separator · Delete (trash; fill oklch(0.955 0.03 25), border oklch(0.88 0.06 25), icon oklch(0.5 0.19 25); hover fill oklch(0.92 0.05 25)) → Delete confirm; a role without Edit loses Edit, without Delete loses Delete |
| Selection | checkbox fades in on row hover (stays visible once any row is selected); tri-state "Select all" in the header; shift-click selects a range; Esc clears; bulk actions "Export" (toast "3 rows exported as CSV") and "Print" (toast "Preparing 3 rows for print") |
| Mobile behaviour | Phone: rows, not cards — full-bleed blocks separated by 1px hairlines, keeping the 3px colour edge, padding 12px 14px 12px 11px. Line 1: Offering name + its sub-line (left, takes the space) and Price + its sub-line (right-aligned, at most 46% wide). Under the name, one meta line of the first 4 non-empty values from Category · Offer · Branches · Duration · Sessions · Status · ID, each item = 6px colour dot (badge values) + grey label + value in #3f3f46/500, 11.5px, items 12px apart with no separator (ID has no label), skipping "All branches", "Active" and "—". Row actions on their own right-aligned line (40 × 36px buttons). Tablet 820: keeps Offering · Category · Price and folds ID · Offer · Branches · Duration · Sessions · Status into the name's meta line (footer "6 columns in rows · Show all" ↔ "Fit to width"); tablet 1024: keeps Offering · Category · Price · Offer · Branches, folds ID · Duration · Sessions · Status ("4 columns in rows · Show all"); tablet keeps every folded value (nothing dropped); row action buttons 36px |
| Pagination | one scroller with every row; virtualised above 60 rows (10-row overscan); end line "All offerings loaded" |

### Offers tab

Primitive: table

| Field | Value |
| --- | --- |
| Columns (ordered) | checkbox · Offer (offer pill in its colour, then a grey code pill such as "GLOW20" when it has one) · Type (value 600: "20% off", "₹500 off", "at ₹3,999", "+1 session" / "+2 sessions"; grey sub-line "% off" / "₹ off" / "Fixed price" / "Extra sessions") · Applies to (first two offering names joined with ", " plus " +1" for the rest; sub-line = the note) · Branches (branch chips or a grey "All branches" chip; empty with one open branch) · Valid ("22 Sep 2026 – 2 Oct 2026"; missing ends read "Now" and "no end"; sub-line "Ends today" / "Ends tomorrow" / "Ends in 28 days" while running, "Starts 1 Nov 2026" when scheduled, "Over" when ended, nothing when paused) · Status (pill with dot: "Running" sage · "Scheduled" sky · "Paused" butter · "Ended" stone) · Updated (avatar + time; hidden by default) · row actions |
| Column widths | 24px · minmax(190px, 1.3fr) · 150px · minmax(200px, 1.4fr) · minmax(120px, .9fr) · minmax(170px, 1fr) · 110px · minmax(140px, .9fr) · actions 145px (three buttons); eye title "Columns · 5 of 6 shown" |
| Sortable | none — fixed order Running → Scheduled → Paused → Ended, newest first inside each group |
| Row height | as the Offerings tab; 3px left edge in the offer's colour |
| Row click | opens the Edit offer drawer |
| Row actions | Edit (pen-line) · Pause (pause) or Resume (play) — not on Ended offers · separator · Delete (trash, red); Pause toasts "Navratri glow paused", Resume "Navratri glow running again" |
| Selection | as the Offerings tab (Export · Print) |
| Mobile behaviour | Phone: rows, not cards. Line 1: the offer pill(s) on the left; on the right (at most 46% wide, right-aligned) the Type value + kind, followed by the meta line: Applies to · Branches · Valid · Status (first 4 non-empty, skipping "All branches" and "—"); actions (Edit · Pause/Resume · Delete) on their own right-aligned line. Tablet 820: keeps Offer · Type and folds Applies to · Branches · Valid · Status into the Type cell ("4 columns in rows · Show all"); tablet 1024: keeps Offer · Type · Applies to · Branches, folds Valid · Status ("2 columns in rows · Show all") |
| Pagination | one scroller; end line "All offers loaded" |

## Forms

### Offering drawer (New offering / Edit offering)

Grid: 6 columns, gap 16px rows × 12px columns (12px × 10px compact and on phone); "full" = 6, "half" = 3, "third" = 2 columns; the last field of a row widens to fill it unless it is a short third. Phone: the grid keeps its 6 columns — at 390 a half field is 159px and a third 103px (Price · Offer price · Sessions and GST rate · GST · Lowest price stay three across), label hints truncate with an ellipsis and the "Hidden · tap to set" toggle text is clipped. Tablet: as desktop.

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | name | text, half (stays alone on its row) | Name | "e.g. LHR Full Face" | none | yes (red " *") | ≤ 60 characters; first letter capitalised as you type; empty → step marked "Missing: Name" |
| 2 | category | chips, single, full | Category | none (chip group) | none | yes — one is always picked (default "Treatment") | "Consultation" (sky) · "Treatment" (sage) · "Package" (lav) · "LHR" (blush) · "Product" (butter) |
| 3 | tone | 6 colour swatches (30px circles), full | Colour | none (swatches) | "used for this offering everywhere" | no (default sage) | lav · sky · butter · blush · sage · mint; the picked one shows "✓" and a 1.5px ring |
| 4 | branches | chips, multi, full — only when more than one branch is open | Available at | none (chip group) | "hidden from bookings and bills elsewhere" | no | "All branches" (on while nothing else is picked; picking it clears the rest) + one chip per open branch in its colour; picked chips show a square-check icon |
| 5 | price | money, "₹" prefix box, third | Price | "0" | "list price · shown on the invoice" | yes | digits and one "." only, ≤ 7 characters; 0 counts as empty → "Missing: Price"; toast "Add a price" |
| 6 | offer | money, "₹" prefix, third | Offer price | the Price value, else "0" | "what you bill · leave empty = list price"; once below Price: "what you bill · 17% below list" | no | toast "Offer price can’t be above the price"; empty or ≥ Price saves as the Price |
| 7 | sessions | stepper (36px "−" and "+" around the value), third, quick chips "1" · "4" · "6" · "8" · "10" | Sessions | none | "treatments allowed against one invoice" | no (default 1) | "−" stops at 0; saved as at least 1 |
| 8 | gst | text, third, "%" suffix | GST rate | "0" | none | no (default 0) | digits and one "." only |
| 9 | gstIncl | toggle, third | GST | none (toggle) | none | no (default Exclusive) | "Inclusive" / "Exclusive" |
| 10 | floorShown | toggle, third — only for roles with "See the lowest price" | Lowest price | none (toggle) | none | no (reads Hidden each time the drawer opens) | "Hidden · tap to set" / "Shown · only you can see it" |
| 11 | min | money, "₹" prefix, half — only while the toggle reads Shown | Lowest price | the Offer price (else the Price, else "0") | "the desk can never bill below this" | no | toast "Lowest price can’t be above the offer price"; a new offering saved with none set gets 85% of its offer price, rounded to ₹50 |
| 12 | billedToday | read-only info box (38px, grey fill), full — only when Price > 0 | Billed today | none (read-only) | none | no (read-only) | "₹7,500 · +1 free session · 17% below list" (format under Preview) |
| 13 | offersOnThis | one read-only info box per offer that hasn't ended, full — only on a saved offering that has one | the offer's name, e.g. "Peel pack + 1 free" | none (read-only) | none | no (read-only) | "+1 session · Running · till 31 Oct 2026" |
| 14 | duration | stepper, half, "min" suffix, quick chips "15m" · "20m" · "30m" · "45m" · "60m" · "90m" | Duration | none | none | no (default 30) | ≥ 0 |
| 15 | validity | stepper, half, "days" suffix, quick chips "None" · "3 mo" · "6 mo" · "1 yr" (0 / 90 / 180 / 365) | Validity | "0" | "0 = no expiry · sessions left after this are lost" | no (default 0) | ≥ 0 |
| 16 | terms | text, full | Search terms | "laser, face, hair removal" | "comma separated" | no | ≤ 80 characters; split on commas, blanks dropped |
| 17 | description | textarea, 3 rows, full | Description | "What is included" | none | no | ≤ 1000 characters |
| 18 | active | toggle, full | Status | none (toggle) | none | no (default Active) | "Active · bookable" / "Inactive · hidden" |

- Error display: no inline error text. Required fields carry a red " *". Pressing Save while a required field is empty opens the first step that has one; a closed step with a gap shows a red "!" circle and "Missing: Name, Price". The other rules arrive as toasts after "Saving…".
- Submit: "Create offering" (new) / "Save changes" (edit), footer far right, dark fill, never disabled; new only and not on phone: "Create & add another" (outline) saves, then reopens a blank drawer.
- Loading: the Save button reads "Saving…" for 320–740ms; fields stay editable.
- Success: drawer closes; toast "Offering #275 created" / "Offering #273 saved"; a new row appears at the top.
- Dirty-state guard: none — Cancel, ×, the backdrop and Esc close at once and drop the edits.
- Read-only: a role without Edit opening an existing offering gets no Save button and the footer summary "View only · your role can’t change this"; without Delete the Delete button is gone.

### Offer drawer (New offer / Edit offer)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | name | text, half | Name | "e.g. Diwali glow" | none | yes | ≤ 60 characters; toast "Name the offer" |
| 2 | code | text, half | Code | "GLOW20" | "optional · for ads" | no | upper-cased and stripped of spaces as you type, ≤ 12 characters |
| 3 | kind | chips, single, full | Type | none (chip group) | none | yes — one is always picked (default "% off") | "% off" (lav) · "₹ off" (sky) · "Fixed price" (butter) · "Extra sessions" (sage); switching resets the value to 10 / 500 / empty / 1 |
| 4 | value | depends on Type, half | "Discount" / "Amount off" / "Offer price" / "Free sessions" | "0" | none | yes | % off: stepper, "%" suffix, quick chips "10%" · "15%" · "20%" · "25%"; ₹ off and Fixed price: money field with "₹" prefix; Extra sessions: stepper, "sessions" suffix; 0 or empty → toast "Set the discount" / "Set the amount" / "Set the free sessions" |
| 5 | tone | 8 colour swatches, full | Colour | none (swatches) | "marks this offer on offerings and bills" | no (default blush) | blush · lav · sky · butter · sage · mint · peach · plum |
| 6 | offerings | dropdown, multi, full | Offerings | "Search offerings" | "pick one or more" | yes | active offerings only, grouped by category, each with its colour dot, sub = category, right meta = billed price; picked ones show as pills in the trigger; empty → "Missing: Offerings", toast "Pick at least one offering" |
| 7 | branches | chips, multi, full — only when more than one branch is open | Branches | none (chip group) | "where the desk can use it" | no | "All branches" + branch chips, as on the offering |
| 8 | from | date dropdown, half | Starts | "Pick a date" | none | no (empty = "Now") | options: today, the next 120 days, then the past 60 days, labelled "Today · Sat 3 Oct", "Tomorrow · Sun 4 Oct", "Mon 5 Oct", grouped "Today" / "Coming up" / "Sep 2026"; stored as "3 Oct 2026" |
| 9 | to | date dropdown, half | Ends | "Pick a date" | none | no (empty = "no end") | same list; toast "Ends before it starts" when earlier than Starts |
| 10 | preview | one read-only info box per picked offering, half, at most 6 | the offering's name | none (read-only) | none | no (read-only) | "₹1,200 → ₹1,080" (price before → after, never below its lowest price) or "2 → 3 sessions" |
| 11 | note | textarea, full | Note | "Who it is for, how the desk should mention it" | none | no | ≤ 1000 characters |
| 12 | live | toggle, full | Status | none (toggle) | none | no (default Live) | "Live · applies automatically" / "Paused" |

- Error display: as the Offering drawer (red " *", "Missing: Offerings" on the closed step, toasts for the rest).
- Submit: "Create offer" (new) / "Save offer" (edit), footer far right; no "Create & add another".
- Loading: "Saving…" for 320–740ms.
- Success: drawer closes; toast "<offer name> created · applies automatically" / "<offer name> saved" (e.g. "Navratri glow saved").
- Dirty-state guard: none — Cancel, × and the backdrop close at once (Esc does not close this drawer).

### New offering (stacked over the invoice drawer)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | name | text, half | Name | "e.g. Priya Shah" | none | yes | prefilled with what was typed in the invoice line picker; toast "Add a name" |
| 2 | duration | stepper, half, "min" suffix | Duration | none | none | no (default 30) | ≥ 0 |
| 3 | category | chips, single, full | Category | none (chip group) | none | yes — one is always picked (default "Treatment") | the 5 categories, as above |
| 4 | price | money, "₹" prefix, half | Price | "0" | none | yes | toast "Enter the price" when ≤ 0 |

- Error display: red " *" and the step's "Missing: Price" (see Multi-step flow — the steps cannot be opened in the prototype).
- Submit: "Add offering", footer far right; the left button reads "Back".
- Loading: "Saving…" for 320–740ms.
- Success: toast "Offering Hydra facial added"; the drawer closes and the new offering is placed on the invoice line.
- Dirty-state guard: none — "Back", × and the backdrop drop the draft.

## Popups

### Offering drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer from the right, full height, over a backdrop rgb(9 9 11 / .45) |
| Shape (mobile) | Phone: full-screen sheet (100% width, no shadow or left border); header 60px with 56px right padding; × becomes a 44px transparent button inside the top-right corner (8px inset); footer buttons 44px tall and stretched, the summary text drops under them centred at 12px; "Create & add another" removed; safe-area padding at the bottom. Tablet: as desktop, 680px |
| Trigger | "New offering" (toolbar, or phone FAB) · row click · row Edit |
| Size | min(680px, 100vw − 56px); header 76px, padding 14px 24px (12px 20px compact); body padding 20px 24px 28px (16px 20px 20px compact, 14px 16px 20px phone); footer padding 12px 24px (12px 20px compact; phone 10px 12px plus the safe area) |
| Dismiss | backdrop click · × (36px white tile, 12px radius, floating 14px left of the drawer edge, 14px from the top) · "Cancel" · Esc |
| Header | title 18px/600 "New offering" / "Edit offering" + grey ID pill "#273" (edit) · sub-line 13px grey "Used in bookings, invoices and packages"; under it a strip of pills: category (its colour) · billed price (offering colour, when a price is set) · "6 sessions" (when > 1); new only: a "Quick fill" row (label 11px uppercase) of dashed 24px pills "⚡ Single session" (sage) · "⚡ 6-session pack" (lav) · "⚡ LHR 10-pack" (blush) · "⚡ Consultation" (sky) |
| Footer | left: summary 12.5px grey "Underarm Peel · 6 sessions · Package · ₹7,500 · 6 sessions" (new: "Untitled · Treatment"); right, in order: "Delete" (36px, fill oklch(0.53 0.2 25), white text; edit only) · "Cancel" (outline) · "Create & add another" (new, not phone) · 6px oklch(0.53 0.2 25) dot + "Not saved · your changes are kept" in the same red, 12px/500 (after a failed save) · "Create offering" / "Save changes" / "Saving…" / "Retry save" (dark) |
| Multi-step | yes — accordion step cards (see Multi-step flow) |
| Initial focus | none — focus stays on the page; nothing is auto-focused |

### Offer drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer from the right, full height |
| Shape (mobile) | Phone: full-screen sheet, same rules as the Offering drawer. Tablet: as desktop |
| Trigger | "New offer" (toolbar on the Offers tab, or phone FAB) · row click · row Edit |
| Size | min(680px, 100vw − 56px) |
| Dismiss | backdrop · × · "Cancel" — Esc does not close it |
| Header | "New offer" / "Edit offer" + grey pill with the offer name (edit) · sub-line "A limited-time price on one or more offerings · applies by itself"; pill strip: offer name (or "New offer") in its colour · value, e.g. "10% off" |
| Footer | summary "Navratri glow · 20% off · 3 offerings" (new: "New offer · 10% off") · "Delete" (edit) · "Cancel" · "Create offer" / "Save offer" |
| Multi-step | yes — 3 step cards |
| Initial focus | none |

### Stacked New offering

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer stacked on top of the invoice drawer (z-index above it, its own backdrop) |
| Shape (mobile) | Phone: full-screen sheet. Tablet: as desktop, 560px |
| Trigger | Payments › invoice › line item picker "Select offering…" → footer row "New offering · “Hydra facial”" … "full details" |
| Size | min(560px, 100vw − 56px) |
| Dismiss | backdrop · × · "Back" — Esc does not close it |
| Header | "New offering" · sub-line "Service, treatment or package you bill"; no pills, no Quick fill |
| Footer | "Back" (outline) · "Add offering" (dark); no summary, no Delete |
| Multi-step | yes — auto-split into 3 steps |
| Initial focus | none |

### Filters popover

| Field | Value |
| --- | --- |
| Shape (desktop) | popover under the "Filters" button, right-aligned to it; flips up when there is no room below |
| Shape (mobile) | Phone: bottom sheet — full width, top corners 16px, max-height 82%, slides up 260ms; transparent backdrop. Tablet: as desktop |
| Trigger | "Filters" |
| Size | 340px wide (max 100vw − 40px), max-height 100vh − 160px, body scrolls |
| Dismiss | click outside · "Apply filter" applies and closes |
| Header | "Filters" (13.5px/600) · "Clear all" (12px grey link) right |
| Footer | "Save as view" / "Saved as view" (only when a filter is set) · spacer · "Apply filter" (dark) |
| Multi-step | no |
| Initial focus | none |

Sections are built from the column values present (a column gets a section when it has 2–10 distinct values and fewer values than rows): Offerings tab → "Category" · "Offer" · "Branches" · "Status" · "Created"; Offers tab → "Branches" · "Status" · "Created". "Created" chips: "Any" · "Today" · "Yesterday" · "Last 7 days" · "Last 30 days" · "This month" · "Custom range" (Custom range adds From / To date dropdowns). Chips are 24px pills in a tone, picked = 1.5px ring. Applied filters turn the button grey with a count badge and a joined "×" ("Clear all filters").

### Columns menu

| Field | Value |
| --- | --- |
| Shape (desktop) | dropdown under the eye button, aligned to its right edge |
| Shape (mobile) | Phone: not available — the eye button is hidden. Tablet: as desktop |
| Trigger | eye button (36px; dark count badge = hidden columns) |
| Size | min 260px wide |
| Dismiss | click outside · Esc |
| Header | search "Search columns" (Offerings tab only — more than 8 columns) |
| Footer | "8 of 9 shown" |
| Multi-step | no |
| Initial focus | the search field (Offerings tab); on Offers the list panel, first option highlighted |

Rows: group "View" → "Show all columns" (sub "Recommended set hides 1"; when all are shown, sub "Tap again for the recommended set" and a second tap restores the default) · group "Columns" → one checkbox row per column except the first one (ID on Offerings, Offer on Offers) and the action column.

### Delete confirm

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer from the right (role alertdialog), above every other drawer |
| Shape (mobile) | Phone: stays a right drawer, 100vw − 56px wide (334px at 390), 36px buttons. Tablet: as desktop |
| Trigger | row "Delete" · drawer footer "Delete" |
| Size | min(480px, 100vw − 56px) |
| Dismiss | "Keep it" · × (36px tile floating 10px left of it) · backdrop (rgb(9 9 11 / .32)) |
| Header | "Delete this offering?" / "Delete this offer?" · grey pill with the record (row delete: the row's first plain-text cell, e.g. "Back Peeling"; drawer delete: the footer summary) · "It disappears from lists and pickers. You can undo from the toast right after." |
| Footer | hint "Pick a reason to continue" (then "Add a short note for “Other”" while Other has no note) · "Keep it" (outline) · "Delete" (grey and not-allowed until a reason is picked, then fill oklch(0.53 0.2 25)) |
| Multi-step | no |
| Initial focus | none |

Reason chips "Created by mistake" · "Duplicate" · "No longer needed" · "Other"; note field "Add a note (optional)", or "Tell the team why (required)" after "Other". After Delete: toast "Offering #272 removed" / "Navratri glow removed" with "Undo".

### Dropdowns (Offerings picker, Starts / Ends, Filters date range)

| Field | Value |
| --- | --- |
| Shape (desktop) | floating popover under its trigger, flips up when there is no room |
| Shape (mobile) | Phone: bottom sheet — full width, max-height 72%, top corners 16px, dim backdrop rgb(9 9 11 / .4), slides up 260ms. Tablet: as desktop |
| Trigger | the field's trigger (36px) |
| Size | max(trigger width, 240px), capped at 100vw − 16px; max-height 340px (min 150px), 6px from the trigger; option rows ≥ 36px |
| Dismiss | click outside · Esc · picking (single) / "Done" (multi) |
| Header | search field (40px) — always for the Offerings picker and the date lists (more than 7 options) |
| Footer | multi: count + "Done" |
| Multi-step | no |
| Initial focus | the search field |

## Multi-step flow

### Offering drawer

- Steps (ordered): no running/scheduled/paused offer on this offering (every new one) → "1 Offering, price & sessions" (sections OFFERING + PRICE & SESSIONS) · "2 Time, validity & details" (TIME & VALIDITY + DETAILS). A saved offering with at least one offer that hasn't ended → "1 Offering, price & sessions" · "2 Offers on this, time & validity" (OFFERS ON THIS + TIME & VALIDITY) · "3 Details".
- **Sequence varies by input?** yes — 2 steps when the offering has no live offer, 3 when it has one (above). Inside the steps: "Available at" only when more than one branch is open; the Lowest price toggle only for roles with "See the lowest price" and its ₹ field only while it reads Shown; "Billed today" only once Price > 0. Category changes nothing — a Package shows exactly the same fields as a Treatment; the Quick fill pills only prefill (Single session → Treatment, 1 session, no validity, 30 min · 6-session pack → Package, 6, 180 days, 45 min · LHR 10-pack → LHR, 10, 365 days, 60 min, blush · Consultation → Consultation, 1, no validity, 20 min, sky). Phone: same steps.
- Progress indicator: one bordered card per section (12px radius, padding 14px 16px, 12px 14px compact); the first card of each step carries a 24px numbered circle + step title 13.5px/600 + grey one-line summary of its values ("Treatment · All branches · 1 · 0", first 4) + "Open" / "Edit" on the right. Circle colours: open step = lime ink fill, white number; earlier steps = green oklch(0.52 0.12 150); later = #e4e4e7 with grey number; a closed step with an empty required field = red "!" and "Missing: Name, Price". Closed steps show a peek grid (tiles ≥ 150px: uppercase 10.5px label + value, dashed "Empty" when blank, colour as a swatch, ≤ 8 tiles). The open card is white with a #d4d4d8 border, closed cards grey.
- Navigation: "Next: Time, validity & details →" (32px outline button, right-aligned) closes the open step and opens the next; any step header or peek opens that step; one step open at a time; nothing is skippable or locked.
- Per-step validation: no — "Next" never blocks; Save jumps to the first step with an empty required field.
- Edit mode: prefilled, same steps, any step can be opened; opens on step 1, except that reopening the same record (or another New offering) returns to the step that was open last.

### Offer drawer

- Steps (ordered): "1 Offer" (Name, Code, Type, value, Colour) · "2 Where it applies" (Offerings, Branches, Starts, Ends, previews) · "3 Notes" (Note, Status).
- **Sequence varies by input?** no — always 3 steps. Inside step 1 the value field follows Type: "% off" → "Discount" stepper "%" with quick chips · "₹ off" → "Amount off" "₹" · "Fixed price" → "Offer price" "₹" · "Extra sessions" → "Free sessions" stepper "sessions". Step 2 adds one preview box per picked offering (max 6). Branches only with more than one open branch. Phone: same.
- Progress indicator: as the Offering drawer.
- Navigation: "Next: Where it applies →", "Next: Notes →"; headers open any step.
- Per-step validation: no; Save jumps to "Where it applies" while no offering is picked.
- Edit mode: prefilled, same 3 steps; opens on step 1 (or the step last open for that same offer).

### Stacked New offering

- Steps (ordered): "1 Offering" (Name) · "2 Details" (Duration, Category) · "3 Payment" (Price) — the single section is auto-split by field type.
- **Sequence varies by input?** no.
- Progress indicator: as above.
- Navigation: "Next: Details →". In the prototype the step headers and "Next" do nothing in this stacked drawer, so steps 2–3 never open and "Add offering" does nothing while Price is empty (see the gap list).
- Per-step validation: no.
- Edit mode: n/a — create-only drawer.

## Preview / animated panels

| Field | Value |
| --- | --- |
| Surfaces | 2 live price previews: "Billed today" in the Offering drawer · the per-offering "before → after" boxes in the Offer drawer |
| Switching | automatic — recomputed on every keystroke and chip change |
| Surface per input type | Billed today = best running offer applied to the Offer price (or Price) for the header's branch (branch-limited offers count only when the header has exactly that one branch picked), never below the lowest price: "₹1,350" + " · Navratri glow" (a % / ₹ / fixed offer) + " · +1 free session" (an extra-sessions offer) + " · 10% below list" (when below Price). Offer previews: "% off", "₹ off", "Fixed price" → "₹1,200 → ₹1,080"; "Extra sessions" → "2 → 3 sessions" |
| Frame sequence | none — the text is replaced in place, no animation |
| Frame durations | none — no animation |
| Progressive reveal | "Billed today" appears once Price > 0; one preview box appears per picked offering, in pick order, up to 6 |
| Static fallback | the same text (it is already static) |

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Tab "Offerings" · section · empty state | tag | 14 / 14 / 18 | no |
| Tab "Offers" | sparkles | 14 | no |
| Search | search | 15 | no |
| Filters | list-filter | 15 | no |
| Columns | eye | 16 | yes (aria-label "Show or hide columns") |
| New offering / New offer · empty "Clear filters" | plus | 16 / 14 | no |
| Row Edit | pen-line | 13 | yes (aria-label "Edit") |
| Row Delete | trash | 13 | yes (aria-label "Delete") |
| Row Pause / Resume | pause / play | 13 | yes |
| Sort | arrow-up-down / arrow-up / arrow-down | 12 | no |
| Bulk "Export" / "Print" | file / printer | 14 | no |
| Bulk tick · clear | check / x | 12 / 14 | no / yes ("Clear selection") |
| Picked multi chip | square-check | 12 | no |
| Dropdown chevron | chevron-down (rotates 180° open) | 14 | no |
| Empty state with filters | search | 18 | no |
| Fold control | maximize-2 (on "N columns in rows · Show all") / minimize (on "Fit to width") | 14 | no |

Library: Lucide · Weight: 1.6px stroke (sort arrows, chevron, check, x: 2px)

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Drawer panel | transform translateX 100% → 0 | 340ms | cubic-bezier(.32,.72,0,1) |
| Drawer backdrop | background-color transparent → rgb(9 9 11 / .45) | 340ms | cubic-bezier(.32,.72,0,1) |
| Step card body | opacity 0 → 1, translateY −4px → 0 | 240ms | cubic-bezier(.2,.8,.2,1) |
| Filters popover · dropdowns · columns menu | opacity 0 → 1, translateY −4px (up: +4px) → 0, scale .985 → 1 | 160ms | cubic-bezier(.2,.8,.2,1) |
| Phone bottom sheets (dropdowns, Filters) | translateY 28px → 0, opacity 0 → 1 | 260ms | cubic-bezier(.32,.72,0,1) |
| Toolbar search | flex-basis / width 36px → 200px | 220ms | cubic-bezier(.2,.8,.2,1) |
| Bulk bar | translateY 100% → 0 | 220ms | cubic-bezier(.32,.72,0,1) |
| Tabs, toggles, row hover, checkboxes | background, colour, knob position, opacity | 120–150ms | ease |
| Skeleton bars | background-position shimmer, infinite | 1100ms | ease |

Reduced-motion: every animation and transition runs 1ms with no delay and a single iteration (the skeleton shimmer stops), and smooth scrolling is off.

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Offerings table | in-place skeleton: every text, avatar and input in the rows becomes a #efeff1 bar shimmering 1.1s, icons hidden, header and toolbar untouched — 260–560ms on entering the screen, 160–380ms (sometimes +280–600ms) after a search, sort, tab or filter change | 96px art (dashed ring, sky disc, 40px white tile with a sky tag icon) · "No offering matches" (15px/600) · "Nothing here yet. Try another tab or search." (12.5px grey); with filters: search icon · "No matches" · "Nothing matches these filters. Clear them to see everything again." + dark button "Clear filters" | toast "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" (9s; rows stay; ~5% of fetches) |
| Offers table | as above | "No offers yet" · "Nothing here yet. Try another tab or search." (filtered: as above) | as above |
| Offering drawer | drawer skeleton 200–440ms on open (body text becomes shimmer bars); "Saving…" on the button | a new offering opens with defaults (Treatment, sage, 1 session, 30 min, no validity, GST 0 Exclusive, Active); blank fields peek as dashed "Empty" | footer red "Not saved · your changes are kept", button "Retry save", toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" (9s; ~10% of saves) |
| Offer drawer | as the Offering drawer | defaults: "% off", 10, blush, all branches, no dates, Live | as the Offering drawer |
| Stacked New offering | as the Offering drawer | Name prefilled from the search, Treatment, 30 min | as the Offering drawer |
| Filters popover | none — opens instantly | sections only exist for columns with values; "Created" is always there | n/a — built from rows already loaded |
| Dropdowns | open instantly; in the Offerings picker typing waits 250ms, then shows skeleton rows (bars at 62 / 48 / 70 / 40% width) and a spinner in the search for 160–380ms; date lists filter instantly | "Nothing to pick yet" (no query) or "No results for “xyz”", both with "Check the spelling or try fewer letters" | n/a — the lists are local, nothing can fail |

Success: toasts (5.2s) "Offering #275 created" · "Offering #273 saved" · "Offering #272 removed" + "Undo" · "<offer name> created · applies automatically" · "<offer name> saved" · "Navratri glow removed" + "Undo" · "Navratri glow paused" · "Navratri glow running again" · "Offering Hydra facial added" · "3 rows exported as CSV" · "Preparing 3 rows for print" · "View “Package” saved" · "View removed". Toasts sit bottom-centre 16px above the edge; phone: 76px above the bottom (over the tab bar), max width 100% − 24px.

## Copy

| Key | Exact string |
| --- | --- |
| title | "Offerings" |
| tab offerings | "Offerings" |
| tab offers | "Offers" |
| search placeholder (Offerings) | "Search name or search term" |
| search placeholder (Offers) | "Search offers or codes" |
| search label | "Search offerings" |
| search tooltip | "Search · press /" |
| filters | "Filters" |
| clear filters (aria) | "Clear all filters" |
| columns (aria) | "Show or hide columns" |
| columns tooltip | "Columns · 8 of 9 shown" |
| new (Offerings) | "New offering" |
| new (Offers) | "New offer" |
| heads (Offerings) | "ID" · "Offering" · "Category" · "Price" · "Offer" · "Branches" · "Duration" · "Sessions" · "Status" · "Updated" |
| heads (Offers) | "Offer" · "Type" · "Applies to" · "Branches" · "Valid" · "Status" · "Updated" |
| sort tooltip | "Sort by Price" |
| price sub | "was ₹1,500 · 20% off" / "list price" |
| sessions cell | "6 sessions + 1 free" / "1 session"; sub "valid 180 days" |
| offering sub | "Valid 60 days" |
| duration empty | "—" |
| all branches | "All branches" |
| status | "Active" / "Inactive" |
| offer type values | "20% off" · "₹500 off" · "at ₹3,999" · "+1 session" / "+2 sessions" |
| offer kinds | "% off" · "₹ off" · "Fixed price" · "Extra sessions" |
| offer valid | "<starts> – <ends>", e.g. "22 Sep 2026 – 2 Oct 2026"; a blank start reads "Now", a blank end "no end" ("Now – no end") |
| offer valid sub | "Ends today" · "Ends tomorrow" · "Ends in 28 days" · "Starts 1 Nov 2026" · "Over" |
| offer states | "Running" · "Scheduled" · "Paused" · "Ended" |
| row actions | "Edit" · "Pause" · "Resume" · "Delete" |
| end line | "All offerings loaded" / "All offers loaded" |
| empty (Offerings) | "No offering matches" |
| empty (Offers) | "No offers yet" |
| empty hint | "Nothing here yet. Try another tab or search." |
| empty filtered | "No matches" / "Nothing matches these filters. Clear them to see everything again." / "Clear filters" |
| fold control | "6 columns in rows · Show all" / "Fit to width" |
| fold tooltip | "Show every column side by side (scrolls sideways)" / "Fold extra columns into each row" |
| bulk | "3 selected" · "Select all 11" · "Export" · "Print" · "Esc" |
| bulk clear (aria) | "Clear selection" (tooltip "Clear selection · Esc") |
| filters panel | "Filters" · "Clear all" · "Category" · "Offer" · "Branches" · "Status" · "Created" · "Apply filter" · "Save as view" / "Saved as view" |
| created chips | "Any" · "Today" · "Yesterday" · "Last 7 days" · "Last 30 days" · "This month" · "Custom range" · "From" · "To" |
| columns menu | "Show all columns" · "Recommended set hides 1" · "Tap again for the recommended set" · "View" · "Columns" · "Search columns" · "8 of 9 shown" |
| offering drawer title | "New offering" / "Edit offering" |
| offering drawer sub | "Used in bookings, invoices and packages" |
| quick fill | "Quick fill" · "⚡ Single session" · "⚡ 6-session pack" · "⚡ LHR 10-pack" · "⚡ Consultation" |
| offering steps | "Offering, price & sessions" · "Time, validity & details" · "Offers on this, time & validity" · "Details" |
| offering sections | "Offering" · "Price & sessions" · "Offers on this" · "Time & validity" · "Details" |
| field labels | "Name" · "Category" · "Colour" · "Available at" · "Price" · "Offer price" · "Sessions" · "GST rate" · "GST" · "Lowest price" · "Billed today" · "Duration" · "Validity" · "Search terms" · "Description" · "Status" |
| field hints | "used for this offering everywhere" · "hidden from bookings and bills elsewhere" · "list price · shown on the invoice" · "what you bill · leave empty = list price" · "what you bill · 17% below list" · "treatments allowed against one invoice" · "the desk can never bill below this" · "0 = no expiry · sessions left after this are lost" · "comma separated" |
| placeholders | "e.g. LHR Full Face" · "0" · "laser, face, hair removal" · "What is included" |
| toggles | "Inclusive" / "Exclusive" · "Hidden · tap to set" / "Shown · only you can see it" · "Active · bookable" / "Inactive · hidden" |
| quick chips | "1" · "4" · "6" · "8" · "10" · "15m" · "20m" · "30m" · "45m" · "60m" · "90m" · "None" · "3 mo" · "6 mo" · "1 yr" |
| billed today | "₹7,500 · +1 free session · 17% below list" |
| offer on this | "+1 session · Running · till 31 Oct 2026" |
| offering footer summary | "Untitled · Treatment" / "Underarm Peel · 6 sessions · Package · ₹7,500 · 6 sessions" |
| offering buttons | "Cancel" · "Create & add another" · "Create offering" · "Save changes" · "Delete" · "Saving…" · "Retry save" |
| next step | "Next: Time, validity & details" + "→" |
| step hints | "Open" · "Edit" · "Missing: Name, Price" · "Empty" |
| offering validation | "Add a name" · "Add a price" · "Offer price can’t be above the price" · "Lowest price can’t be above the offer price" |
| offer drawer title | "New offer" / "Edit offer" |
| offer drawer sub | "A limited-time price on one or more offerings · applies by itself" |
| offer steps | "Offer" · "Where it applies" · "Notes" |
| offer labels | "Name" · "Code" · "Type" · "Discount" / "Amount off" / "Offer price" / "Free sessions" · "Colour" · "Offerings" · "Branches" · "Starts" · "Ends" · "Note" · "Status" |
| offer hints | "optional · for ads" · "marks this offer on offerings and bills" · "pick one or more" · "where the desk can use it" |
| offer placeholders | "e.g. Diwali glow" · "GLOW20" · "0" · "Search offerings" · "Pick a date" · "Who it is for, how the desk should mention it" |
| offer quick chips | "10%" · "15%" · "20%" · "25%" |
| offer status toggle | "Live · applies automatically" / "Paused" |
| offer previews | "₹1,200 → ₹1,080" · "2 → 3 sessions" |
| offer footer summary | "New offer · 10% off" / "Navratri glow · 20% off · 3 offerings" |
| offer buttons | "Cancel" · "Create offer" · "Save offer" · "Delete" |
| offer validation | "Name the offer" · "Pick at least one offering" · "Set the discount" · "Set the amount" · "Set the free sessions" · "Ends before it starts" |
| date options | "Today · Sat 3 Oct" · "Tomorrow · Sun 4 Oct" · "Today" · "Coming up" |
| stacked title | "New offering" |
| stacked sub | "Service, treatment or package you bill" |
| stacked steps | "Offering" · "Details" · "Payment" |
| stacked buttons | "Back" · "Add offering" |
| stacked placeholder | "e.g. Priya Shah" |
| stacked validation | "Add a name" · "Enter the price" |
| invoice picker row | "New offering · “Hydra facial”" + "full details" |
| delete title | "Delete this offering?" / "Delete this offer?" |
| delete body | "It disappears from lists and pickers. You can undo from the toast right after." |
| delete reasons | "Reason" · "Created by mistake" · "Duplicate" · "No longer needed" · "Other" |
| delete note | "Add a note (optional)" / "Tell the team why (required)" |
| delete buttons | "Keep it" · "Delete" · "Pick a reason to continue" · "Add a short note for “Other”" |
| read-only summary | "View only · your role can’t change this" |
| load error | "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" |
| save error | "Not saved · your changes are kept" · "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" |
| success toasts | "Offering #275 created" · "Offering #273 saved" · "Offering #272 removed" · "<offer name> created · applies automatically" · "<offer name> saved" · "Navratri glow removed" · "Navratri glow paused" · "Navratri glow running again" · "Offering Hydra facial added" · "Undo" |
| bulk toasts | "3 rows exported as CSV" · "Preparing 3 rows for print" |
