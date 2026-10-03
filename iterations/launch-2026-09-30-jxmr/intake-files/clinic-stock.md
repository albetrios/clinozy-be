# Screen: Clinic stock

- Route: /organization/:organizationSlug/stock/items (tab Items) · /stock/purchases (tab Purchases) · /stock/movements (tab Movements) · drawers /stock/items/create, /stock/items/:itemId/edit, /stock/items/check, /stock/purchases/create, /stock/purchases/:purchaseId/edit (the Use popover and the movement drawers have no URL)
- Purpose: Consumables and equipment used in procedures, never sold: what is on the shelf, every use, receipt and adjustment, and the bills from clinic vendors.
- Entry points: header section tab "Clinic stock" (not pinned by default) or All sections; phone bottom tab bar "More"
- Exit points: Use popover; Log usage / Receive stock / Adjust stock, item, purchase and Stock check drawers; stacked "New clinic vendor" / "New clinic item" drawers; "Pay ₹X" on a purchase switches to Payments with Send payment open against that bill
- Access: View — Admin, Pharmacist, Accountant · create / edit — Admin, Pharmacist · delete — Admin (default role table, editable in Users › Roles & access). Without Delete the red row actions and drawer Delete disappear; without Edit an existing record opens read-only ("View only · your role can’t change this")
- Layout shell: app shell
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: mint.

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| Toolbar | h1 "Clinic stock" · tabs "Items" (package) · "Purchases" (receipt) · "Movements" (refresh) · search · saved-view chips · "Filters" · columns button (eye, black count badge when columns are hidden) · "Stock check" (clipboard, Items tab only) · "+ New item" (Items) / "+ New purchase" (Purchases); Movements has no create button | One wrapping flex row, gap 10px 8px, padding 16px 20px (12px 12px under 1440px wide or 800px tall); h1 20px/600 with hairline right border; tabs 28px; search is a 36px icon until clicked or "/" is pressed, then 200px (150–220px); buttons 36px. Tablet: h1 18px, all three tabs stay visible (the track scrolls sideways if needed) | Phone: h1 hidden. Row 1 = search (always open, 40px, grows) + "Filters" 40px. Row 2 = the three tabs (all shown, sideways scroll) + "Stock check". Columns button hidden. "+ New item" / "+ New purchase" floats fixed 16px from the right and 74px + safe-area above the bottom: 52px pill, radius 999px, padding 0 20px 0 16px, 14px text, shadow 0 10px 28px -8px rgb(0 0 0 / .45) | Default hidden columns: Items › Supplier, Purchases › Invoice (badge "1") |
| Table card | Items, Purchases or Movements table; end line; 44px footer | Fills the remaining height; 1px divider border, radius 12px, margin 0 20px 20px (0 12px 12px compact) | Edge to edge, no border / radius / shadow; header row and footer hidden; rows reflow | — |
| Table footer | Count ("4 purchases · ₹2,310 due", "7 entries"; Items leaves it blank) · fold control "N columns in rows · Show all" ↔ "Fit to width" · bulk bar | 44px, z50, 12px | Hidden | Fold control only when columns fold (tablet) |

## Data display

Primitive: table (one per tab) · phone keeps rows, never cards

### Items

| Field | Value |
| --- | --- |
| Columns (ordered) | ID ("#167") · Item (name 500; sub "per tube of 30 g · uses ~0.5/week") · Category (pill in category tone: Creams & Serums sky · Peels & Neutralisers blush · Masks lav · Consumables mint · Equipment butter · Other clinic stock stone) · Stock (12.5px "3 tube · 90 g · OK" + 5px bar = stock ÷ maximum, fill sage OK / butter Low (≤ minimum) / blush Out (0)) · Lasts (pill "~6 weeks" / "~5 days" / "No usage"; ≤ 7 days blush, ≤ 21 days butter, else sage; = stock ÷ weekly use × 7) · Supplier (hidden by default; person chip, sub phone "+91 99982 74712", or "—") · actions |
| Column widths | 24px checkbox · 60px · minmax(200px, 1.5fr) · 150px · 170px · 110px · minmax(150px, 1fr) · actions (fits its icon buttons) · min width 1100px |
| Sortable | ID, Item, Category, Stock, Lasts (arrow-up-down → arrow-up / arrow-down, third click clears) |
| Row height | Padding 10px top/bottom, 20px right / 17px left (16 / 13 compact), compact density 5px; 3px left edge in the stock level tone |
| Row click | Opens "Edit item" |
| Row actions | Use (minus) · Receive stock (plus) · Log usage… (file) · Adjust count (refresh) · Edit (pencil) · separator · Delete (trash, red). 32px icon-only, tooltip = name. Use opens the Use popover (out of stock: toast "D-Tan Mask is out of stock"); Delete → confirm "Delete this item?" → toast "Soframycin 30 gm removed" + "Undo" |
| Selection | Hover checkbox, tri-state header, shift range; bulk bar "✓ N selected" · "Select all N" · "Message" (WhatsApp glyph, toast "WhatsApp drafted for N people") · "Export" · "Print" · Esc × |
| Mobile behaviour | Phone: rows, not cards. Primary = Item (name + sub); key column = Category pill top-right; meta line "Stock 3 tube · 90 g · OK" · "Lasts ~6 weeks" (dot) · "#167" (no bar); actions on their own right-aligned line, 40×36 each. Tablet 820: Item + Category stay as columns, the rest fold under the item ("3 columns in rows · Show all") |
| Pagination | Infinite scroll, virtualised above 60 rows; end line "All items loaded" |

Filters: "Stock" (All · Low stock) · automatic Category and Lasts chip sections (2–10 distinct values, fewer than rows) · "Created".

### Purchases

| Field | Value |
| --- | --- |
| Columns (ordered) | ID ("#14") · Supplier (person chip, sub phone) · Invoice (hidden by default; "A000445") · Date ("22 Sep 2026") · Bill (₹, 600, right) · Due (₹ blush, 600, or "—") · Status (pill "Paid" sage / "Partly paid" butter / "Unpaid" blush, with dot) · actions |
| Column widths | 24px · 60px · minmax(200px, 1.4fr) · 120px · 110px · 110px · 110px · 110px · actions · min width 1000px |
| Sortable | ID, Supplier, Bill, Due |
| Row height | As Items; left edge in the status tone |
| Row click | Opens "Edit purchase" |
| Row actions | "Pay ₹1,710" (wallet, only while due) · Edit (pencil) · Delete (trash, red; confirm "Delete this purchase?", then toast "Purchase #15 deleted" + "Undo") |
| Selection | As Items ("Message" included) |
| Mobile behaviour | Phone: primary = Supplier (avatar, name, phone); key = Bill top-right; meta "Due ₹1,710" · "Date 22 Sep 2026" · "Status Unpaid" · "#15" ("—" dues are skipped); actions own line |
| Pagination | Infinite scroll; end line "All purchases loaded" |

Filters: automatic Status section · "Created" · "Follow-up date" (Any · Overdue · Today · Tomorrow · Next 7 days · Not set · Custom range).

### Movements

| Field | Value |
| --- | --- |
| Columns (ordered) | Type (pill Used blush · Received sage · Adjust sky · Damaged butter · Returned lav · Reverted stone · Payment sky; a reverted entry adds a grey "Reverted" pill) · Item / party (name 500; sub = note "LHR · Dharti Galani", bill no or "Purchase #16 · SW-77") · When ("Today 11:05", "25 Sep") · By (avatar + short name) · Change ("− 1 tube", "+ 24 bottle", "− ₹600"; tone ink, grey when reverted) · actions |
| Column widths | 24px · 130px · minmax(240px, 1.8fr) · 130px · 120px · 130px · 120px · min width 920px |
| Sortable | No |
| Row height | As Items; left edge in the type tone (grey once reverted) |
| Row click | None |
| Row actions | "Revert" (refresh) on movements that are not reverted and not themselves a revert → confirm drawer "Revert this movement?" |
| Selection | As Items, without "Message" |
| Mobile behaviour | Phone: primary = Item / party (+ sub); key = Change top-right; meta "Type Used" · "When Today 11:05"; Revert on its own line |
| Pagination | Infinite scroll; end line "All movements loaded" |

Rows: every item movement plus one "Payment" row per purchase with money paid. Filters: automatic Type section · "Created".

### Stock check list

| Field | Value |
| --- | --- |
| Columns (ordered) | Item (13px/500 name, 11.5px category) · In system ("3 tube · 90 g") · Counted (32px input, right-aligned, placeholder = system quantity, unit suffix; 32px "✓" "Same as system"; under it "= 90 g" when the item has contents) · Difference (24px pill: "Not counted" grey, "Matches" sage, "+0.5 tube" sky, "−0.5 tube" blush) |
| Column widths | minmax(0, 1.6fr) minmax(0, 1fr) minmax(150px, 190px) minmax(96px, 130px), gap 12px, rows padding 8px 24px (20px compact); header 36px uppercase 11px on z50 |
| Sortable | No — inventory order, filtered by the category chip |
| Row height | 8px padding around a 32px input (≈ 52px; 66px with the "= 90 g" line) |
| Row click | None |
| Row actions | "✓" copies the system quantity into Counted |
| Selection | None |
| Mobile behaviour | Phone: cards, not table rows — column header hidden; each item becomes a 2 × 2 card (grid minmax(0, 1fr) · auto, gaps 8px × 10px, padding 12px 16px, divider between cards): name + category top-left · "In system · 3 tube · 90 g" top-right ("In system · " added in z500) · Counted input + ✓ bottom-left, both 40px · difference pill bottom-right |
| Pagination | None — all items of the chosen category in one scroll |

## Forms

### Use popover

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | unit | segmented radio (only for items with contents) | Measure in | — | "1 tube = 30 g" | preselected unit | Switching to the measure sets the quantity to min(contents, 10) |
| 2 | q | stepper: − · decimal input (8 chars, 18px/600, centred) · unit label · + | Quantity | "0" | — | yes | Step 0.5 in units; in the measure 10 (contents ≥ 100), 5 (≥ 20) or 1. More than in stock → After line turns red "Only 3 tube · 90 g in stock" and the button disables |
| 3 | quick | chips 28px | — | — | — | no | Units "0.25" · "0.5" · "1" · "2"; measure "1" · "5" · "10" · "25" · "50" (up to the contents); selected chip sage |
| 4 | treat | chips 24px, toggle | Used for | — | — | no | LHR · Peel · Facial · Mole removal · General |
| 5 | after | live text | — | — | — | — | "After · 2 tube · 60 g" (z600; butter when at or below minimum) |

- Error display: inline After line in red; out-of-stock items never open (toast)
- Submit: footer right "Use 1 tube" (dark 36px; disabled grey "Enter a quantity" when 0 or too much); Enter in the quantity saves; footer left "More details" (underlined link → Log usage drawer)
- Loading: none — instant
- Success: popover closes, toast "1 tube of Soframycin 30 gm used · 2 tube left" + "Undo" (Undo removes the movement and restores the stock)
- Dirty-state guard: none — an outside click discards (Esc is not wired)

### Item (New item / Edit item)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | n | text | Name | "e.g. Priya Shah" | — | yes | Toast "Add a name" |
| 2 | cat | chips | Category | — | — | preselected "Consumables" | 6 categories in their tones |
| 3 | unit | chips | Unit | — | — | preselected "pack" | tube · bottle · pack · box · kit · piece · vial · ampoule · sachet · jar · roll · pair · ml · g · litre |
| 4 | size | decimal text, 8 chars, suffix = measure | Contents per pack (follows the unit) | — | "optional · lets the team use part of a pack" | no | — |
| 5 | mu | chips | Measured in | — | — | preselected "ml" | ml · g · pcs · units |
| 6 | q | decimal text, suffix unit | In stock | — | "decimals allowed" | no | — |
| 7 | use | decimal text, suffix unit | Usage per week | — | — | no | — |
| 8 | min | number stepper (− / +, step 1) | Minimum | "0" | — | no | — |
| 9 | max | number stepper | Maximum | "0" | — | no | — |
| 10 | sup | picker, single | Supplier | "Search clinic vendors" | "clinic vendors" | no | Options = clinic vendors (avatar, phone); list footer "New clinic vendor · “query”" + "full details" opens the vendor drawer stacked |

- Error display: toast; the step holding an empty required field shows red "!" + "Missing: Name"
- Submit: "Add item" / "Save changes"; edit adds red "Delete"; "Cancel"; summary = item name
- Loading: "Saving…" 320–740ms
- Success: toast "Item saved"; edit Delete → confirm → toast "Soframycin 30 gm deleted" + "Undo"
- Dirty-state guard: none

### Movement (Log usage / Receive stock / Adjust stock)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | type | chips | Type | — | — | preselected by the row action | Used blush · Received sage · Adjust sky · Damaged butter · Returned lav; switching retitles the drawer |
| 2 | q | decimal text, 8 chars, suffix unit or measure, quick chips | Quantity (Adjust: Counted quantity) | — | "decimals allowed" | yes (not for Adjust) | Quick "0.25" · "0.5" · "1" · "2" · "5" (units) or "1" · "5" · "10" · "25" · "50" up to the contents (measure). Toasts "Enter a quantity", "Only 3 tube · 90 g in stock" (Used, Damaged, Returned) |
| 3 | u | chips (items with contents only) | Measure in | — | — | preselected unit | "tube" · "g (1 tube = 30 g)" |
| 4 | treat | chips, toggle | Used for | — | "optional" | no | LHR · Peel · Facial · Mole removal · General |
| 5 | note | textarea | Remark | "Patient, batch or reason" | — | no | — |

- Error display: toast
- Submit: "Save movement"; "Cancel"; summary "Soframycin 30 gm · −1 tube" (± for Adjust)
- Loading: "Saving…"
- Success: toast "Used saved · 2 tube left" + "Undo"
- Dirty-state guard: none

### Purchase (New purchase / Edit purchase)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sup | picker, single | Supplier | "Search clinic vendors" | "clinic vendors" | yes | Toast "Pick a supplier"; footer "New clinic vendor · “query”" + "full details" |
| 2 | inv | text | Invoice no. | — | — | no | — |
| 3 | date | date dropdown with month calendar (« ‹ Oct 2026 › », Mo–Su) | Bill date | "Pick a date" | — | defaults to today | — |
| 4 | lines | quick line + item rows | Items received | Quick line "Type item and qty · e.g. gloves 10 @250" | "10 = qty · @250 = rate"; "↵ add"; "Browse"; chips "Low stock" ("Nitrile gloves (M) · 6 left") | no | Rows: picker "Select item…" (options "Gauze swabs · 14 in stock"; footer "New clinic item · “query”" + "full details") · Qty stepper · Rate (required once an item is picked: "Enter the rate") · Amount (read-only) · ×. Heads "Item" · "Qty" · "Rate" · "Amount". "+ Add item"; total. A typed name not in the list offers "Not in the list · add as typed" (creates a quick clinic item, toast "Cotton rolls added to clinic items") |
| 5 | bill | ₹ number, step 100 | Bill amount | — | — | no | Defaults to the lines total |
| 6 | paid | ₹ number, step 100, quick chips | Paid | — | — | no | Quick "Full" · "Nothing" |

- Error display: toast; red rate cell with tooltip "Enter the rate"
- Submit: "Create purchase" / "Save changes"; "Cancel"; summary = supplier name. Quick fill (new only): "⚡ Reorder low items" (butter) adds every item at or below minimum with qty = maximum − stock
- Loading: "Saving…"
- Success: toast "Purchase saved · stock updated" (new with lines: each line adds a Received movement and raises stock) or "Purchase saved"
- Dirty-state guard: none

### Stock check

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | cat | chips 24px (ring when on) | — | — | — | preselected "All items" | "All items" · Creams & Serums · Peels & Neutralisers · Masks · Consumables · Equipment · Other clinic stock |
| 2 | counted | decimal input per row, 8 chars | Counted <item> | system quantity | — | no | Live difference pill per row |
| 3 | same | button per row | ✓ | — | tooltip "Same as system" | — | Copies the system quantity |
| 4 | fill | button 28px | Fill rest as matching | — | — | — | Fills every uncounted row of the current category with its system quantity |

- Error display: footer alert (red dot) "Not saved · your counts are kept"
- Submit: footer "Cancel" (outline) · "Save count" (dark; disabled grey until at least one count differs; "Saving…", then "Retry save" after a failure); status text "1 item will change" / "Nothing changes yet"; header counter "2 of 10 counted"
- Loading: "Saving…" 320–740ms
- Success: changed items get an Adjust movement (note "Stock check"), drawer closes, toast "Stock check saved · 1 item updated"
- Dirty-state guard: none

### New clinic vendor (stacked)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | n | text (prefilled with the typed query) | Name | "e.g. Priya Shah" | — | yes | Toast "Add a name" |
| 2 | ph | phone, +91, digits only | Phone | "98765 43210" | "10 digits" | no | — |

- Error display: toast
- Submit: "Add vendor"; left "Back"
- Loading: "Saving…"
- Success: toast "Vendor Ankit Traders added"; the drawer closes and the new vendor is selected in the parent Supplier field
- Dirty-state guard: none

### New clinic item (stacked)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | n | text (prefilled) | Name | "e.g. Priya Shah" | — | yes | Toast "Add a name" |
| 2 | cat | chips | Category | — | — | preselected "Creams & Serums" | 6 categories |
| 3 | unit | chips | Unit | — | — | preselected "piece" | piece · box · bottle · tube · pack · ml |
| 4 | min | number stepper | Minimum | — | — | no | default 1 |
| 5 | max | number stepper | Maximum | — | — | no | default 5 |

- Error display: toast
- Submit: "Add item"; left "Back"
- Loading: "Saving…"
- Success: toast "Cotton added to clinic items"; selected in the parent purchase row
- Dirty-state guard: none

## Popups

### Use popover

| Field | Value |
| --- | --- |
| Shape (desktop) | popover anchored to the row's Use button: 300px card, radius 12px, 1px border, large shadow; opens below (6px gap) when 380px fit underneath, otherwise above; right edge aligned to the button, kept 8px inside the viewport |
| Shape (mobile) | Phone: the same 300px anchored popover (not a bottom sheet), clamped 8px from the screen edges. Tablet: as desktop |
| Trigger | Row action "Use" (minus) on Items |
| Size | 300px wide; height by content (≈ 370px with units) |
| Dismiss | transparent backdrop click, save; Esc is not wired |
| Header | Item name 13.5px/600 (ellipsis) + "In stock · 3 tube · 90 g" 12px, padding 12px 14px 10px, bottom hairline |
| Footer | z50 strip, padding 10px 14px: "More details" link left · "Use 1 tube" right |
| Multi-step | no |
| Initial focus | Quantity input (auto-focused, text selected) |

### Item drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, full height, backdrop rgb(9 9 11 / .45) |
| Shape (mobile) | Phone: full-screen panel (100% width, no shadow); × inside the top-right corner (8px inset, 44 × 44px, 22px glyph); header right padding 56px; footer wraps — 44px buttons on the first line, summary centred below at 12px. Tablet: min(680px, 100vw − 56px) |
| Trigger | "+ New item", Items row click, row Edit |
| Size | 680px |
| Dismiss | backdrop, Esc, floating × (36px, radius 12px, 14px left of the drawer), "Cancel" |
| Header | "New item" / "Edit item" + tag "#167", sub "Clinic consumable or equipment"; badge = category pill |
| Footer | summary · red "Delete" (edit) · "Cancel" · "Add item" / "Save changes" |
| Multi-step | yes — "Item" · "Levels" · "Supplier" |
| Initial focus | none — nothing is auto-focused |

### Movement drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge |
| Shape (mobile) | Phone: full-screen panel as the item drawer. Tablet: 560px |
| Trigger | Row actions "Receive stock", "Log usage…", "Adjust count"; Use popover "More details" |
| Size | 560px |
| Dismiss | backdrop, Esc, floating ×, "Cancel" |
| Header | "Log usage" / "Receive stock" / "Adjust stock", sub "Soframycin 30 gm · 3 tube · 90 g now"; badges type pill + "After: 2 tube · 60 g" (butter at or below minimum) |
| Footer | summary · "Cancel" · "Save movement" |
| Multi-step | yes — "Movement" · "Details" · "Notes" |
| Initial focus | none |

### Purchase drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge |
| Shape (mobile) | Phone: full-screen panel; item rows wrap (picker full width, then Qty + Rate, Amount + × pushed right; column heads hidden; padding 10px 12px). Tablet: min(840px, 100vw − 56px) = 764px at 820 |
| Trigger | "+ New purchase", Purchases row click, row Edit |
| Size | 840px |
| Dismiss | backdrop, Esc, floating ×, "Cancel" |
| Header | "New purchase" / "Edit purchase" + tag "#15", sub "Items received are added to stock"; badges supplier (sky; "No supplier") · "Bill ₹1,710" · "₹1,710 due" (blush) / "Paid" (sage); Quick fill "⚡ Reorder low items" |
| Footer | summary · "Cancel" · "Create purchase" / "Save changes" |
| Multi-step | yes — "Bill" · "Items received" · "Payment" |
| Initial focus | none |

### Stock check

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, full height, white |
| Shape (mobile) | Phone: full-screen panel; header sub line hidden, title and "2 of 10 counted" stay, header right padding 56px; × inside top-right (8px, 44 × 44px, transparent); rows become two-line blocks (see Data display); footer: "Cancel" + "Save count" 44px on the first line, "1 item will change" centred below. Tablet: min(840px, 100vw − 56px) |
| Trigger | "Stock check" (Items tab) |
| Size | 840px |
| Dismiss | backdrop, floating × (pops in 200ms after a 200ms delay), "Cancel"; Esc is not wired |
| Header | 76px (60px phone), padding 14px 24px: "Stock check" 18px/600, sub "Type what is on the shelf. Only items that differ are saved, each as an Adjust entry." 13px, counter right "2 of 10 counted" 12.5px; under it the category chips row (padding 12px 24px) with "Fill rest as matching" at the right |
| Footer | alert (after a failed save) · status text (flex) · "Cancel" · "Save count" |
| Multi-step | no |
| Initial focus | none |

### New clinic vendor / New clinic item (stacked)

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer stacked above the open drawer (its own 45% backdrop, z 100) |
| Shape (mobile) | Phone: full-screen panel above the parent. Tablet: as desktop |
| Trigger | Picker footer "New clinic vendor · “query”" / "New clinic item · “query”" + "full details" |
| Size | vendor 560px · item 680px |
| Dismiss | backdrop, floating ×, "Back" (returns to the parent with nothing selected); Esc is not wired |
| Header | "New clinic vendor", sub "Supplies consumables for procedures · not medicines" · "New clinic item", sub "Used in procedures · not for sale" |
| Footer | "Back" · "Add vendor" / "Add item" |
| Multi-step | vendor no · item yes ("Item" · "Details") |
| Initial focus | none |

### Revert / Delete confirm

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer (alertdialog), stacked above everything |
| Shape (mobile) | Phone: full-screen panel. Tablet: min(480px, 100vw − 56px) |
| Trigger | Movements "Revert"; Items / Purchases "Delete"; item drawer "Delete" |
| Size | 480px |
| Dismiss | backdrop, Esc, ×, "Keep it" |
| Header | "Revert this movement?" with pill "used of 1 tube Noprik Plus numbing cream 50 gm" and body "Stock goes back to what it was before this entry. Both entries stay in the history."; reasons "Logged by mistake" · "Wrong item" · "Wrong quantity" · "Other". Delete: "Delete this item?" / "Delete this purchase?", pill = item or supplier name, body "It disappears from lists and pickers. You can undo from the toast right after.", reasons "Created by mistake" · "Duplicate" · "No longer needed" · "Other" |
| Footer | "Keep it" · red "Revert" / "Delete" (disabled until a reason; "Pick a reason to continue"; note required for "Other": "Tell the team why (required)") |
| Multi-step | no |
| Initial focus | none |

### Filters

| Field | Value |
| --- | --- |
| Shape (desktop) | popover under "Filters", right-aligned, flips when there is no room |
| Shape (mobile) | Phone: bottom sheet (full width, max height 82%, radius 16px top, 260ms) |
| Trigger | "Filters" |
| Size | 340px wide, max height 100vh − 160px |
| Dismiss | outside click (pending choices are dropped), "Apply filter"; Esc is not wired |
| Header | "Filters" + "Clear all" |
| Footer | "Save as view" / "Saved as view" · "Apply filter" |
| Multi-step | no |
| Initial focus | none |

## Multi-step flow

- Steps (ordered): Item — Item → Levels → Supplier. Movement — Movement → Details → Notes. Purchase — Bill → Items received → Payment. New clinic item — Item → Details. Use popover and Stock check are single surfaces.
- **Sequence varies by input?** yes — by the item and the row action: an item with "Contents per <unit>" (e.g. 30 g per tube) adds the unit ⇄ measure toggle in the Use popover and the "Measure in" chips in the movement drawer, and its quick chips switch to 1 · 5 · 10 · 25 · 50 in the measure; an item without contents shows units only. The row action presets Type (Use / Log usage… → Used, Receive stock → Received, Adjust count → Adjust with the current stock prefilled and the label "Counted quantity"). The purchase "Reorder low items" preset appears only on a new purchase. Same steps on phone, tablet and desktop.
- Progress indicator: accordion step cards with a 22px numbered circle (current = mint ink, done = green ✓, missing = red "!"); collapsed steps show peek values (uppercase 11px label + value, dashed "Empty")
- Navigation: "Next: <step> →" closes the step and opens the next; any step header reopens it
- Per-step validation: does not block "Next"; Save jumps to the first step with a missing required field
- Edit mode: prefilled, same steps, any step can be opened

## Preview / animated panels

| Field | Value |
| --- | --- |
| Surfaces | n/a — Clinic stock has no preview or animated panel |
| Switching | n/a — no preview surfaces |
| Surface per input type | n/a — no preview surfaces |
| Frame sequence | n/a — nothing animates in frames |
| Frame durations | n/a — nothing animates in frames |
| Progressive reveal | n/a — no staged reveal |
| Static fallback | n/a — no animated surface to fall back from |

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Tab Items, empty state | package | 14 / 18 | no |
| Tab Purchases | receipt | 14 | no |
| Tab Movements | refresh-cw | 14 | no |
| Stock check button | clipboard-list | 15 | no |
| New item / New purchase | plus | 16 | no |
| Search / Filters / Columns | search / list-filter / eye | 15 / 15 / 16 | eye yes ("Show or hide columns") |
| Row Use | minus | 13 | yes |
| Row Receive stock | plus | 13 | yes |
| Row Log usage… | file | 13 | yes |
| Row Adjust count, Revert | refresh-cw | 13 | yes |
| Row Edit / Delete | pencil / trash | 13 | yes |
| Row Pay ₹X | wallet | 13 | yes |
| Sort | arrow-up-down / arrow-up / arrow-down | 12 | yes |
| Bulk Message | WhatsApp glyph (key `wa`, brand glyph, not Lucide) | 14 | yes |
| Bulk Export / Print / clear | file / printer / x | 14 | yes |
| Purchase Browse / quick line | layout-grid / search | 15 | no |
| Fold control | maximize-2 / minimize | 14 | no |
| Stepper, ✓ Same as system | text glyphs "−", "+", "✓" | 18px / 13px text | yes |

Library: Lucide · Weight: 1.6px stroke (registry icons); 2px for chevrons, x, check and sort glyphs

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Use popover, dropdowns, Filters | opacity 0 → 1, translateY(−4px) scale(.985) → none (opening upward: +4px) | 160ms | cubic-bezier(.2,.8,.2,1) |
| Drawer panel (item, movement, purchase, Stock check, stacked) | transform translate3d(100%, 0, 0) → 0 | 340ms | cubic-bezier(.32,.72,0,1) |
| Drawer backdrop | background-color rgb(9 9 11 / 0) → / .45 | 340ms | cubic-bezier(.32,.72,0,1) |
| Stock check floating × | opacity 0 → 1, scale(.9) → 1, 200ms delay | 200ms | ease |
| Phone bottom sheets (Filters, dropdowns) | translateY(28px), opacity 0 → none | 260ms | cubic-bezier(.32,.72,0,1) |
| Search field | flex-basis / min / max width 36px ↔ 200px | 220ms | cubic-bezier(.2,.8,.2,1) |
| Tabs | background, color | 150ms | ease |
| Row hover, Stock check buttons | background | 120ms | ease |
| Bulk bar | translateY(100%) → 0 | 220ms | cubic-bezier(.32,.72,0,1) |
| Tooltip (desktop / tablet) | opacity, translateY(2px) → 0 after 160ms hover | 120ms | ease |
| Loading shimmer | background-position | 1100ms loop | ease |

Reduced-motion: every animation and transition runs 1ms with no delay and one iteration (the shimmer stops), no smooth scroll.

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Items | Rows' text, pills and avatars turn into shimmer bars (z150, 1.1s) for 160–380ms on tab / search / filter change (page 260–560ms; 10% of loads add 280–600ms) | 96px dashed ring, mint tile, 40px white box with package 18px · "No item matches" · "Nothing here yet. Try another tab or search." With filters: search icon · "No matches" · "Nothing matches these filters. Clear them to see everything again." · "+ Clear filters" | toast "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" (9s; rows stay) |
| Purchases | as Items | "No stock items here" · "Nothing here yet. Try another tab or search." | as Items |
| Movements | as Items | "No stock items here" · "Nothing here yet. Try another tab or search." | as Items |
| Use popover | n/a — opens on local data instantly | n/a — never opens for an out-of-stock item (toast "D-Tan Mask is out of stock") | inline red "Only 3 tube · 90 g in stock" |
| Drawers | On open, text and inputs shimmer 200–440ms; Save "Saving…" 320–740ms | n/a — forms always render their fields; empty item rows peek "Item · None yet" | footer "Not saved · your changes are kept" (Stock check: "Not saved · your counts are kept"), "Retry save", toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" (9s) |
| Stock check list | as Drawers | category with no items: empty list under the header row | as Drawers |

Success: toasts (5.2s, "Undo" on uses, movements and removals) bottom-centre 16px (phone: 76px + safe area above the bottom).

## Copy

| Key | Exact string |
| --- | --- |
| title | "Clinic stock" |
| tabs | "Items", "Purchases", "Movements" |
| search | placeholder "Search item, category or supplier…", aria "Search inside stock", tooltip "Search · press /" |
| toolbar | "Filters", "Stock check", "New item", "New purchase" |
| item heads | "ID", "Item", "Category", "Stock", "Lasts", "Supplier" |
| purchase heads | "ID", "Supplier", "Invoice", "Date", "Bill", "Due", "Status" |
| movement heads | "Type", "Item / party", "When", "By", "Change" |
| levels | "OK", "Low", "Out", "No usage", "~6 weeks", "~5 days" |
| status | "Paid", "Partly paid", "Unpaid" |
| movement types | "Used", "Received", "Adjust", "Damaged", "Returned", "Reverted", "Payment" |
| row actions | "Use", "Receive stock", "Log usage…", "Adjust count", "Edit", "Delete", "Pay ₹1,710", "Revert" |
| end lines | "All items loaded", "All purchases loaded", "All movements loaded" |
| filters | "Stock", "All", "Low stock", "Created", "Follow-up date" |
| use popover | "In stock · 3 tube · 90 g", "1 tube = 30 g", "Used for", "After · 2 tube · 60 g", "Only 3 tube · 90 g in stock", "More details", "Use 1 tube", "Enter a quantity" |
| stock check | "Stock check", "Type what is on the shelf. Only items that differ are saved, each as an Adjust entry.", "2 of 10 counted", "All items", "Fill rest as matching", "Item", "In system", "Counted", "Difference", "In system · ", "Same as system", "Not counted", "Matches", "1 item will change", "Nothing changes yet", "Cancel", "Save count", "Not saved · your counts are kept" |
| item drawer | "New item", "Edit item", "Clinic consumable or equipment", "Levels", "Contents per pack", "optional · lets the team use part of a pack", "Measured in", "In stock", "decimals allowed", "Usage per week", "Minimum", "Maximum", "clinic vendors", "Search clinic vendors", "Add item" |
| movement drawer | "Log usage", "Receive stock", "Adjust stock", "Soframycin 30 gm · 3 tube · 90 g now", "After: 2 tube · 60 g", "Movement", "Quantity", "Counted quantity", "Measure in", "Remark", "Patient, batch or reason", "Save movement" |
| purchase drawer | "New purchase", "Edit purchase", "Items received are added to stock", "Reorder low items", "No supplier", "Bill", "Invoice no.", "Bill date", "Items received", "Type item and qty · e.g. gloves 10 @250", "10 = qty · @250 = rate", "Low stock", "Select item…", "Add item", "Enter the rate", "Bill amount", "Paid", "Full", "Nothing", "Create purchase" |
| stacked drawers | "New clinic vendor", "Supplies consumables for procedures · not medicines", "Add vendor", "New clinic item", "Used in procedures · not for sale", "Back" |
| confirm | "Revert this movement?", "Stock goes back to what it was before this entry. Both entries stay in the history.", "Logged by mistake", "Wrong item", "Wrong quantity", "Keep it", "Revert", "Delete this item?" |
| validation | "Add a name", "Enter a quantity", "Pick a supplier" |
| toasts | "1 tube of Soframycin 30 gm used · 2 tube left", "Used saved · 2 tube left", "Item saved", "Purchase saved · stock updated", "Stock check saved · 1 item updated", "Used reverted · Noprik Plus numbing cream 50 gm back to 6 tube", "Soframycin 30 gm removed", "Purchase #15 deleted", "Vendor Ankit Traders added", "D-Tan Mask is out of stock" |
