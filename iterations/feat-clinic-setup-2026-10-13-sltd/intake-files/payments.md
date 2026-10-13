# Screen: Payments

- Route: /organization/:organizationSlug/payments (tab Payments) · /payments/pending (tab Pending) · drawers /payments/receive, /payments/pay, /payments/:paymentId/edit, /payments/pending/create, /payments/pending/:creditId/edit, /payments/day-close, /invoices/create
- Purpose: One ledger of money in and out (receipts, refunds, expenses, supplier bills), the pending credits still to give back or take, and the daily cash close.
- Entry points: header section tab "Payments" (pinned by default) or All sections; phone bottom tab bar; Clinic stock › Purchases and Medical › Purchases row action "Pay ₹X" (opens Send payment against that bill); the shared invoice drawer is opened from the patient file ("New invoice", invoice rows, rail "Collect"), Medical "New sale" and a prescription's "Sell medicines"
- Exit points: Receive payment, Send payment, Add pending, Give back / Got it back, Day close and invoice drawers; A4 invoice print; back to the patient file or Medical when the invoice drawer was opened there
- Access: View — Admin, Front desk, Counsellor, Accountant · create / edit — Admin, Front desk, Counsellor · delete — Admin (default role table, editable in Users › Roles & access). Without Delete the red row actions and drawer Delete disappear; without Edit an existing record opens read-only with the footer line "View only · your role can’t change this"
- Layout shell: app shell
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: peach.

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| Toolbar | h1 "Payments" · tabs "Payments" (receipt icon) · "Pending" (refresh icon) · search · saved-view chips · "Filters" · columns button (eye) · "Day close" · Payments tab: "Pay" (outline, red arrow-up-right) + "Receive" (dark, arrow-down-left) · Pending tab: split "+ Add pending" ⌄ | One wrapping flex row, gap 10px 8px, padding 16px 20px (12px 12px under 1440px wide or 800px tall); h1 20px/600 with a hairline right border; tabs 28px in a 3px-padded track; search collapses to a 36px icon until clicked or "/" is pressed, then 200px (150–220px); all buttons 36px. Tablet: h1 18px; the tab track flexes from 120px and scrolls sideways; same buttons | Phone: h1 hidden. Row 1 = search, always open, 40px tall, growing (basis 180px) + "Filters" 40px. Row 2 = tab track (only the selected tab + "More ⌄"; the other tab moves into More because the measured space runs out) + "Day close". Columns button hidden. "Pay" + "Receive" (or "+ Add pending" + ⌄) leave the toolbar and float fixed 16px from the right and 74px + safe-area above the bottom, 52px tall pills (radius 999px, padding 0 20px 0 16px, 14px text, shadow 0 10px 28px -8px rgb(0 0 0 / .45)), 8px apart | Saved-view chips appear only after "Save as view" in Filters (36px group, × removes, toast "View removed") |
| Table card | Ledger (Payments tab) or Pending table, header, rows, end line, 44px footer | Card fills the remaining height: 1px divider border, radius 12px, margin 0 20px 20px (0 12px 12px when compact) | Edge to edge: no border, radius or shadow; header row and 44px footer hidden; rows reflow (see Data display) | While the Day close drawer is open the ledger behind it lists only the selected day |
| Table footer | Count text (left) · fold control "N columns in rows · Show all" ↔ "Fit to width" (right) · bulk bar when rows are selected | 44px, grey (z50), 12px text | Hidden | The ledger and Pending tables pass no count, so the left side is blank; the fold control appears only when columns fold (tablet) |

## Data display

Primitive: table (one per tab) · phone keeps rows, never cards

### Ledger (tab Payments)

| Field | Value |
| --- | --- |
| Columns (ordered) | Ref ("PAY-310"; old TX-/RF-/EX- ids shown as PAY-) · What (pill "Received" sage for receipts, "Paid" blush for patient refunds, "Paid" butter for expenses, "Received" stone for money back) · When ("Today 11:05", "27 Sep 18:40"; sub "Edited 1× · last ₹600 UPI → ₹700 UPI" in butter when edited) · From / to (patient = person chip with P badge; payee = plain text; sub line: receipt "Invoice #785" or "Sale · Invoice #785"; refund "Refund · Credit note CN-100 · for Invoice #760 · Charged twice"; money back "Money back · <for>"; expense = category or "Medical PO #431 · bill 1631" / "Stock PO #15 · bill CX-118", then " · <note>") · Mode (pill Cash butter · UPI sage · Card sky) · Amount ("+ ₹600" sage / "− ₹260" blush, 600 weight, right-aligned; grey when reversed) · By (avatar + short name "Riya S.") · actions |
| Column widths | 24px checkbox · 96px · 110px · 150px · minmax(240px, 1.8fr) · 110px · 120px · 130px · actions (starts 72px, grows to fit its 32px buttons) · min width 1180px |
| Sortable | No column is sortable (newest first, fixed) |
| Row height | Padding 10px top/bottom, 20px right / 17px left at ≥ 1440px (16px / 13px below 1440px or 800px tall), compact density 5px; 3px left status edge in the What tone (grey z200 for reversed or linked entries); 12px column gap |
| Row click | Entry on an open day → its edit drawer ("Edit payment in" for receipts, "Edit payment out" for expenses). Entry on a closed day → toast "TX-5509 · Day closed" (raw stored id, + " · edited N×" when edited) |
| Row actions | Open-day entries only: Edit (pencil) · 1px separator · Delete (trash, red on light red). 32px icon-only buttons, tooltip = action name (160ms hover delay). Delete opens the delete confirm drawer with reasons "Entered twice" · "Wrong amount" · "Wrong patient or payee" · "Other" and the body "Allowed until the day is closed. Invoice #785 goes back to ₹1,476 due. The deletion is kept in the audit log." (the invoice sentence only for receipts against an invoice) Closed-day entries show no actions. The actions column is sticky to the right edge with a soft left shadow |
| Selection | 24px checkbox column (visible on hover, always on touch), tri-state "Select all", shift-click range. Dark bulk bar docks in the footer: "✓ N selected" · "Select all N" · "Export" (toast "N rows exported as CSV") · "Print" (toast "Preparing N rows for print") · Esc · × "Clear selection · Esc". Phone: checkboxes hidden, no selection |
| Mobile behaviour | Phone: rows, not cards. Header, footer and checkboxes hidden; each row wraps: primary cell = From / to when the newest row is a patient receipt, otherwise When (the seed shows When); Amount stays top-right as the key column; the meta line under the primary cell folds up to 4 values as "label value" pairs — What · From / to (or When) · Mode · Ref (By drops out, "—" values are skipped); row actions on their own right-aligned line (buttons 40×36). Tablet: columns that don't fit fold into the meta line under the primary cell (820: What · When · Amount stay as columns) and the footer shows "4 columns in rows · Show all"; "Show all" restores every column with sideways scroll, "Fit to width" folds again |
| Pagination | Infinite scroll; rows virtualise above 60 (10-row overscan); end line "All entries loaded" between two hairlines |

Filters popover (340px, right-aligned): "Show" (All · Received · Paid) · automatic chip sections for What and Mode (a badge column with 2–10 distinct values, fewer than the rows) · "Created" (Any · Today · Yesterday · Last 7 days · Last 30 days · This month · Custom range → From / To dates). Footer: "Save as view" (after a filter is set; "Saved as view" removes it) · "Apply filter". Header "Filters" + "Clear all". Applied filters show a count badge on the button and a joined × "Clear all filters".

### Pending (tab Pending)

| Field | Value |
| --- | --- |
| Columns (ordered) | Ref ("CR-2") · Who (patient = person chip, sub "Patient"; otherwise text, sub "Supplier / party") · Which way (pill "Give" blush, tooltip "We pay them back" / "Take" sky, tooltip "They pay us") · Amount (₹, 600, Give blush / Take sky ink, grey once settled; sub "₹X adjusted" after a partial use) · Why (reason; sub "From PAY-5466 · Received", "Invoice #785" or "By hand") · Since (date) · State (pill "Open" sky · "Returned" sage · "Received" sage · "Adjusted" lav, + " · Today" when settled) · actions |
| Column widths | 24px · 86px · minmax(200px, 1.4fr) · 130px · 110px · minmax(200px, 1.5fr) · 100px · 120px · actions · min width 1240px |
| Sortable | No column is sortable |
| Row height | As the ledger; status edge = Give / Take ink while open, grey z200 once settled |
| Row click | Open credit → "Edit pending" drawer; settled credit → nothing |
| Row actions | Open credits only: "Give back" / "Got it back" (wallet) · Edit (pencil) · Delete (trash, red; confirm, then toast "CR-2 deleted" + "Undo") |
| Selection | As the ledger |
| Mobile behaviour | Phone: rows. Primary = Who (avatar + name + sub); key column Amount top-right; meta line Which way · Why · Since · State; actions on their own right-aligned line. Tablet: overflow columns fold into the meta line |
| Pagination | Infinite scroll; end line "All pending loaded" |

Filters: automatic chip sections for Which way and State when they qualify · "Created".

### Day close · Review every entry

| Field | Value |
| --- | --- |
| Columns (ordered) | Checkbox (20px, "Mark as checked") · Ref · What (pill) · When · From / to (name + 11.5px sub) · Mode (pill) · Amount (right, 600, tone ink) · State · actions |
| Column widths | 28px 96px 64px 120px minmax(160px, 1fr) 90px 110px 110px auto, gap 10px, padding 0 16px; header 36px uppercase 11px on z50 |
| Sortable | No |
| Row height | Padding 8px 16px, 12.5px text, z100 bottom border; a checked row tints green (k111) and its box fills green |
| Row click | Same as the ledger row (edit drawer on an open day, toast on a closed day) |
| Row actions | none — the State and actions cells render empty in the prototype (no pill, no buttons); an open-day entry is edited through the row click |
| Selection | Per-row "checked" ticks only; progress "0 of 3 checked" + 4px green bar in the card header |
| Mobile behaviour | Phone: header row hidden; each row re-grids to 28px · minmax(0, 1fr) · auto with 4px row gap: checkbox spans two rows on the left · Ref top-middle · From / to (ellipsised) bottom-middle · Amount top-right (600) · actions bottom-right; What, When, Mode and State hidden. Tablet 820: the 9-column grid needs 770px inside a 730px card and clips at the right |
| Pagination | None — every entry of the selected day; empty "No entries on this day" |

### Day close · summary strips

| Field | Value |
| --- | --- |
| Grid | repeat(auto-fit, minmax(150px, 1fr)), 1px divider gaps, radius 12px; cells padding 10px 12px, label 11px uppercase z500, value 16px/600, sub 11.5px |
| Anatomy | Working day, 4 cells: "Opening cash" ₹2,000 · "✓ Accepted by Riya S. · 09:12" (sage) — "Cash in · out" "+₹0 −₹260" · "Expected in drawer ₹1,740" — "Counted now" ₹ input (32px, placeholder "Count the drawer") + difference pill ("—", "₹0" sage, "+₹X" / "−₹X" blush) — "Net by mode" pills "Cash −₹260" · "UPI −₹2,600" · "Card ₹0" (tooltip "In ₹X · out ₹Y") + staff chips (20px avatar + amount, tooltip "Farah A. · 1 receipts · ₹600") |
| Meta line | Closed day, 5 cells, each with its sub line: "Opening cash" ₹2,000 · "Accepted by Riya S." (or "Taken as expected") — "Collected" ₹600 sage · "1 received" — "Paid out" ₹3,460 blush · "2 paid" — "Cash counted" ₹1,700 · "Expected ₹1,740" — "Difference" "₹0" "Drawer matched" sage / "+₹X" "Extra in drawer" blush / "−₹40" "Short in drawer" blush / "—" |
| Truncation | Sub lines single-line ellipsis |
| Actions | Counted now input only |
| Mobile | Phone: 2 equal columns; an odd last cell spans the full row (report: Difference full width) |

### Invoice print (A4 sheet)

| Field | Value |
| --- | --- |
| Grid | A4 210 × 297mm, page margin 0, Arial 3.25mm; content box 169.5mm wide starting 38.1mm from the top and 23.3mm from the left (the top band stays blank for the clinic's letterhead) |
| Anatomy | Two info boxes (80.5mm + 80.2mm, gap 8.8mm, 26.5mm tall, 1px border, radius 1.6mm): "Patient Information" (Medical: "Customer Information") with "Name:" (uppercase, bold) and "Phone:" ("91" + 10 digits, or "—"); "Invoice Details" (Medical: "Sale Details") with "Invoice Date:" / "Sale Date:" (DD/MM/YYYY), "Invoice #:" / "Sale #:" ("INV-787" / "S-983"), "Status:" ("PAID", "PARTLY PAID", "DUE"). Heading "Items" / "Medicine Items", then the items table: "Item" / "Medicine Name" · "Pack Size" · "Qty" · "Amount" · "Discount" · "GST" · "Net Amt." (60.2mm 16.9mm 15mm 17.2mm 21.1mm 15.9mm 1fr; header 13mm, rows ≥ 7.65mm); totals row. Two boxes (35.5mm tall): "Notes" and "Payment Summary" ("Total Amount:", "Overall Discount:", "Bill Amount:" 3.6mm, "Balance Due:"). Footer line, centred |
| Meta line | Row values: name uppercase · pack size read from the name ("60G", "50 ML") · qty · "₹1200.00" (before discount) · "10.00%" · "18.00%" · net "₹1416.00" bold; totals: amount "₹…", discount "120.00", GST "₹…", net "₹…". Notes box = the invoice note, else grey "No additional notes" (the drawer's Remark is not printed in the prototype). "Overall Discount:" "-₹48.00"; "Bill Amount:" / "Balance Due:" "₹1416.00" |
| Truncation | Item names wrap inside their column |
| Actions | Print only: opens the browser print dialog 260ms after the sheet renders; the sheet is removed after printing |
| Mobile | Same A4 sheet on every viewport; never shown on screen |

## Forms

### Receive payment

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | branch | chips, single | Branch | — | — | preselected | Shown only with 2+ open branches (seed: Adajan · Vesu · Varachha) |
| 2 | patient | picker (remote search, 450ms) | Patient | "Search patients" | "only patients can be picked" | yes | Options: patients ("₹8,550 due · #3441 · +91 98791 22840" or "Nothing due · …"), leads disabled ("Lead #2363 · not a patient yet"). Picking fills the oldest open invoice and its due |
| 3 | invoice | chips | Against invoice | — | "N open" when more than one | no | Chips "#784 · ₹8,550" (sub = type), peach when picked; picking sets the amount and one UPI row. No patient: inert chip "Pick the patient first"; nothing due: "Nothing due" |
| 4 | splits | item rows, compact: Mode picker · Amount ₹ · × | Amount received | Mode "Mode" · Amount "₹ 0" | Footer "Total ₹8,550 · due ₹8,550"; "+ Split · add a mode" (hidden once Cash, UPI and Card are all used) | yes | Toast "Enter an amount" when the total is 0 |
| 5 | ref | text | Reference | "e.g. 4321" | "UPI ref / card last 4" | no | — |
| 6 | note | text | Note | "Optional" | — | no | — |

- Error display: toast for validation; failed save shows the footer alert and toast below
- Submit: right of footer, dark, "Record ₹8,550" (edit: "Save ₹X"); left "Cancel"; footer summary "UPI · ₹8,550". Quick fill row above the form once an invoice is picked: "⚡ Full · ₹8,550" · "⚡ Half · ₹4,275" · "⚡ Cash + UPI"
- Loading: button reads "Saving…" for 320–740ms
- Success: drawer closes, toast "₹8,550 received from Kiran Desai" (edit: "TX-5512 updated · change logged")
- Dirty-state guard: none — Cancel, ×, backdrop or Esc close without asking

### Send payment (Pay)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | bill | picker, single, searchable (new only, when open bills exist) | Supplier bill | "Search PO #, supplier or bill no" | "3 open · search PO #, supplier or bill no" | no | Options "Other spend" (sub "Not against a purchase order", group "Other"), then "Medical PO #431 · Shree Ramdev Medical Agency" / "Stock PO #15 · Cranix Pharma" with sub "Bill 1631 · 8 days pending" and meta due ₹, groups "Medical purchase orders" / "Clinic stock purchase orders", oldest first. Picking fills Paid to, Amount (= due) and Category (Medicines / Consumables) |
| 2 | oldest | chips (while nothing is picked) | Pending longest | — | — | no | 3 oldest bills "#15 · Cranix · ₹1,710 · 11 days pending"; blush ≥ 30 days, butter ≥ 14 days, stone otherwise |
| 3 | category | chips | Category | — | — | preselected "Consumables" | Medicines · Consumables · Salary · Rent · Marketing · Utilities · Maintenance · Misc |
| 4 | to | text + quick chips | Paid to | "Vendor or person" | — | yes | Quick chips "Medline Surgicals" · "Meta ads" · "Electricity" |
| 5 | note | text | Note | "What was bought" | — | no | — |
| 6 | amount | ₹ number + quick chips | Amount | — | — | yes | Quick "₹500" · "₹1,000" · "₹2,000" · "₹5,000" |
| 7 | date | date dropdown | Date | "Pick a date" | — | defaults to today | Options "Today · Sat 3 Oct", "Yesterday · …", grouped Today / Coming up / month |
| 8 | mode | chips | Mode | — | — | preselected "Cash" | Cash · UPI · Card |
| 9 | files | upload | Bill / receipt | — | "Optional · JPG, PNG or PDF" | no | Drop zone "Drop the bill photo or browse"; each click adds "bill-1.jpg", "bill-2.jpg" |

- Error display: toast "Add who was paid and the amount" when Paid to or Amount is empty; a step with an empty required field shows a red "!" and "Missing: Paid to"
- Submit: "Add expense" + "Add & another" (saves, then reopens empty; hidden on phone); edit: "Save changes" + red "Delete"; "Cancel"; summary "Consumables · Medline Surgicals · ₹3,200". Quick fill (new): "⚡ Consumables" (Medline Surgicals ₹3,200 UPI) · "⚡ Tea & snacks" (₹260 Cash, Misc) · "⚡ Courier" (₹150 Cash, Misc)
- Loading: "Saving…"
- Success: toast "₹2,980 paid against Medical PO #431" (a PO paid in full moves to stage Paid) or "Expense PAY-5601 added"; edit "EX-311 saved · change logged"
- Dirty-state guard: none

### Invoice (shared drawer: New invoice / New sale)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | type | segmented tabs (hidden for a Medical sale) | Type | — | — | yes | Clinic (sky dot) · Medical (sage) · Consultation (lav); switching clears the items |
| 2 | branch | chips | Branch | — | — | preselected | 2+ branches only |
| 3 | patient | picker (Patient: remote search, 450ms skeleton; Customer: local list) | Patient (Medical: Customer) | "Search patients" (Medical: "Search patients, leads or medical contacts") | "only patients can be picked" (Medical: "patient or any contact · new names are saved as a Medical contact") | yes | Clinic / Consultation: leads disabled; the list footer row (plus icon) "New patient · “query”" + "full details" opens the New patient drawer stacked on top. Medical: groups Patients · Leads · Medical contacts; "Add contact “query”" creates a Medical contact (toast "Viral Sheth saved as a Medical contact · add a mobile below") and a Mobile field appears (+91, "98765 43210", help "saved on the contact") |
| 4 | team | people picker, multi | Team (Medical: Prescribed by) | "Pick team" | "from Rhea’s team" once a patient is picked, else "doctor, therapist, counsellor" | no | Prefilled with the patient's team (recent doctors, therapist, lead owner) or you |
| 5 | items | quick line + item rows | Items (Medical: Medicines) | Quick line "Type offering, qty, discount · e.g. lhr face 1 10%" (Medical: "Type medicine and qty · e.g. sun 2") | "2 = qty · 10% = discount · @500 = rate"; "↵ add"; "Browse" | yes | Rows: picker "Pick item" ("Select offering…" / "Select medicine…"; full create "New offering") · Qty stepper · Rate (read-only) · Disc % · GST (read-only) · Final (editable, back-computes Disc %) · ×. Heads "Offering" / "Medicine" · "Qty" · "Rate" · "Disc %" · "GST" · "Final". "+ Add item" / "+ Add medicine"; total right. A Final below the lowest price turns red with tooltip "Below the lowest price ₹4,000 for LHR Full Face · B4G7" (roles that see the floor) or "Too much discount on <item> · ask an admin" |
| 6 | od | number, % suffix | Overall discount | "0" | — | no | — |
| 7 | quick | chips | Quick fill | — | — | no | "Full · ₹324 in UPI" · "Split cash + UPI" · "Nothing now" |
| 8 | paid | item rows: Mode · Amount · × | Paid now | "₹ 0" | Footer "Paid ₹324 · due ₹0"; "+ Add another mode" | no | Toast "Paid ₹X is more than the bill ₹Y" |
| 9 | remark | textarea | Remark | "Shown on the printed invoice" | — | no | — |

- Error display: toasts "Pick a patient" / "Pick a customer", "Add at least one item", "Only 3 of Glycolac Cream in stock" (new Medical only), "LHR Full Face · B4G7 is below its lowest price ₹4,000 · raise the final price" or "… has more discount than allowed · raise the final price or ask an admin"
- Submit: "Create clinic invoice" / "Create medical invoice" / "Create consultation invoice"; edit "Save changes" + red "Delete"; "Cancel"; summary "Medical · Rhea Shah · 1 item". Quick fill presets: "⚡ Print invoice" (saved invoices) · "⚡ Plan · <offering> ×2" (lav, plan rows not yet invoiced) · "⚡ Package · <offering>" · "⚡ Repeat #785" (sky) · "⚡ New consultation · ₹300" (Consultation) · "⚡ From Rx #500" (Medical)
- Loading: "Saving…"
- Success: toast "Medical invoice #788 created" (+ " · N offering suggestions items marked invoiced"); edit "Invoice #787 saved"; a Medical invoice also writes the sale and deducts stock by earliest expiry; a balance creates a "Payment due" task
- Dirty-state guard: none

### Add pending / Edit pending

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | dir | chips | Which way | — | — | yes | "Give" (sub "We pay them back", blush) · "Take" (sub "They pay us", sky); switching clears the reason |
| 2 | who | picker, single | Who | "Search patients, contacts or suppliers" | — | yes | Groups Patients · Contacts · Suppliers & vendors; "Add “query”" keeps a typed name |
| 3 | amount | ₹ number | Amount | — | — | yes | — |
| 4 | why | chips | Reason | — | — | yes | Give: Charged twice · Advance not used · Package cancelled · Overpaid · Returned items · Other. Take: Short payment · Damaged goods returned · Advance given · Loan to staff · Other |
| 5 | inv | picker (only when the patient has invoices) | For invoice | "No invoice" | "optional · links the credit to a bill" | no | Options "No invoice", "Invoice #785" (sub "₹1,534 · paid" / "₹X · ₹Y due", meta date) |
| 6 | by | text | Settle by | — | — | no | Creates a task due then |
| 7 | note | textarea, 300 chars | Note | Give "e.g. Refund to the same UPI id" · Take "e.g. Supplier will adjust in the next bill" | — | only for "Other" | — |

- Error display: toasts "Pick who", "Enter the amount", "Pick a reason", "Add a note for “Other”"
- Submit: "Save · give later" / "Save · take later"; edit "Save changes" + red "Delete"; left button "Back"; summary "Give ₹500 back to Tanvi Shah · Charged twice"
- Loading: "Saving…"
- Success: toast "CR-3 saved · give ₹500 to Tanvi Shah" / "CR-1 updated"
- Dirty-state guard: none

### Give back / Got it back

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | pays | item rows: Mode · Amount · × | Paid back by (Got it back: Received as) | "₹ 0" | Footer "Total ₹500 · of ₹500"; "+ Add another mode" | yes | Toasts "Enter the amount", "More than the ₹500 owed" |

- Error display: toast
- Submit: "Return ₹500" / "Record ₹800"; left "Back"
- Loading: "Saving…"
- Success: toast "₹500 given back to Tanvi Shah · Out entry added" / "₹800 got back from Medline Surgicals · In entry added"; a patient give-back writes a refund entry with credit note CN-101; partial amounts leave the remainder open
- Dirty-state guard: none

### Day close

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | day | date dropdown (230px trigger) | Day | — | — | defaults to today | Today back 120 days, no future dates |
| 2 | recount | ₹ decimal input, 8 chars (gate) | Recount opening cash | "Recount" | tooltip "Recount if it doesn't match" | no | Changes the button to "Accept recount" |
| 3 | count | ₹ decimal input, 8 chars (working day) | Counted cash | "Count the drawer" | — | yes before closing | Toast "Count the cash first" |

- Error display: toast
- Submit: gate "Accept ₹2,000" / "Accept recount" (40px dark); working day "Close day" (in the drawer's bar, 36px dark); closed day "Reopen" (32px outline)
- Loading: none — instant
- Success: toasts "Opening cash ₹2,000 accepted · stamped 09:12", "Day closed · summary sent to admin on WhatsApp", "Day reopened"; closing locks that day's entries (no edit, no delete)
- Dirty-state guard: none

## Popups

### Receive payment

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, full height, white, shadow -16px 0 40px rgb(0 0 0 / .16), backdrop rgb(9 9 11 / .45) |
| Shape (mobile) | Phone: full-screen panel (100% width, no shadow); × moves inside the top-right corner (8px inset, 44 × 44px, transparent, 22px glyph); header keeps 56px right padding; footer wraps — buttons 44px tall sharing the first line, the summary on its own centred 12px line below, padding 10px 12px + safe area. Tablet: as desktop, width min(560px, 100vw − 56px) |
| Trigger | "Receive"; ledger row click / Edit on an open-day receipt; patient-file "Collect" and "Record payment" |
| Size | 560px |
| Dismiss | backdrop click, Esc, floating × (36px, radius 12px, white, 14px from the drawer's left edge), "Cancel" |
| Header | 76px (60px phone), padding 14px 24px (12px 20px compact, 10px 16px phone): title "Receive payment" / "Edit payment in" 18px/600 + tag pill (patient id or payment id), sub "Receipt goes to the patient on WhatsApp" / "Open until the day is closed · every change is logged"; badges row (mode pill, amount pill) |
| Footer | Left summary (12.5px, ellipsis) · "Cancel" (outline 36px) · alert "Not saved · your changes are kept" after a failed save · "Record ₹X" (dark 36px) |
| Multi-step | no — one step |
| Initial focus | none — nothing is auto-focused |

### Send payment

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, full height |
| Shape (mobile) | Phone: full-screen panel as Receive payment; "Add & another" hidden. Tablet: min(680px, 100vw − 56px) |
| Trigger | "Pay"; ledger row / Edit on an open-day expense; "Pay ₹X" on a Medical or Clinic stock purchase (switches to Payments with that bill picked) |
| Size | 680px |
| Dismiss | backdrop, Esc, floating ×, "Cancel" |
| Header | "Send payment" / "Edit payment out" + tag (payment id), sub "Clinic spend · shows in day close"; badges category pill · "− ₹3,200" blush · mode |
| Footer | summary · red "Delete" (edit) · "Cancel" · "Add & another" (new, not on phone) · "Add expense" / "Save changes" |
| Multi-step | yes — accordion steps "Pay against a bill" (new, with open bills) · "Expense" · "Payment" |
| Initial focus | none |

### Invoice

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge |
| Shape (mobile) | Phone: full-screen panel; item rows wrap — the picker takes the full first line, then Qty stepper + Rate, Disc % + GST, Final + × (pushed right), 8px × 10px gaps, padding 10px 12px, column heads hidden. Tablet: min(840px, 100vw − 56px) = 764px at 820 |
| Trigger | Patient file "New invoice" / invoice row / Edit; Medical "New sale" (type Medical locked); prescription "Sell medicines" / "Prescriptions to fill" (prefilled, remark "From Rx #500") |
| Size | 840px |
| Dismiss | backdrop, Esc, floating ×, "Cancel" |
| Header | "New invoice" / "Edit invoice" (tag "#787"); Medical lock "New sale" / "Edit sale"; sub "Pick the type, then add items" / "Changes are logged on the invoice" / "Medical invoice · stock updates by earliest expiry"; badges type · "Bill ₹324" · "Covers 6 sessions" · "Cash + UPI" · "Draft" / "₹324 due" (blush) / "Fully paid" (sage); Quick fill row; Type tabs |
| Footer | summary · red "Delete" (edit) · "Cancel" · primary "Create clinic invoice" / "Save changes" |
| Multi-step | yes — "Patient & team" · "Items" (Medical: "Medicines") · "Payment" |
| Initial focus | none |

### Add pending / Edit pending

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer stacked above everything (z 100) |
| Shape (mobile) | Phone: full-screen panel. Tablet: min(680px, 100vw − 56px) |
| Trigger | Pending tab "+ Add pending"; ⌄ menu "Give" / "Take"; open row click / Edit |
| Size | 680px |
| Dismiss | backdrop, floating ×, "Back" (Esc is not wired for these stacked drawers) |
| Header | "Add pending" / "Edit pending" (tag "CR-1"), sub "Money the clinic has to give back or take · settle it later from Pending" / "Editable while it is open · changes are logged" |
| Footer | summary · red "Delete" (edit) · "Back" · "Save · give later" / "Save · take later" / "Save changes" |
| Multi-step | yes — "Which way" · "Why" |
| Initial focus | none |

### Give back / Got it back

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, stacked (z 100) |
| Shape (mobile) | Phone: full-screen panel. Tablet: min(840px, 100vw − 56px) |
| Trigger | Pending row action "Give back" / "Got it back" |
| Size | 840px (its item rows force the 840 width) |
| Dismiss | backdrop, floating ×, "Back" (Esc is not wired) |
| Header | "Give back" / "Got it back" + tag "CR-2", sub "To Tanvi Shah · Charged twice for corn removal · adds an Out entry to Payments" / "From Medline Surgicals · Returned a box of damaged gloves · adds an In entry to Payments"; section "How it goes back" / "How it came in" |
| Footer | "Back" · "Return ₹500" / "Record ₹800" |
| Multi-step | no |
| Initial focus | none |

### Day close

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, full height, grey (z50) body that scrolls as one column; sticky white header with an inline × (no floating ×) |
| Shape (mobile) | Phone: full-screen panel (100% width); summary strips 2 columns; review rows re-gridded (see Data display); header × stays inline. Tablet: min(1040px, 100vw − 56px) = 764px at 820, 968px at 1024 |
| Trigger | "Day close" toolbar button (both tabs); open-day chip "2 Oct not closed · 15 h left · Review" switches the day |
| Size | 1040px |
| Dismiss | backdrop, × (32px, radius 8px); Esc is not wired |
| Header | "Day close" 18px/600, height 76px (60px phone); bar under it: day dropdown (230px) · status pill ("Open" sky / "Open · auto-closes in 15 h" butter / "Closed by Riya S." or "Force-closed" sage) · "3 entries on 3 Oct" · open-day chips (butter, tooltip "Review the entries and close it · it closes by itself when the time runs out") · "Previous closes ⌄" · "Close day" |
| Footer | none — actions live in the bar and cards |
| Multi-step | yes — three states (see Multi-step flow) |
| Initial focus | none |

### Delete confirm

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer (alertdialog), stacked above other drawers |
| Shape (mobile) | Phone: full-screen panel. Tablet: min(480px, 100vw − 56px) |
| Trigger | Row Delete; drawer "Delete" |
| Size | 480px |
| Dismiss | backdrop, Esc, ×, "Keep it" |
| Header | "Delete this payment?" (the same title for a pending credit); the record shows as a grey pill under the title — the stored entry id for ledger rows (e.g. "EX-310", "TX-5512"; new entries "PAY-5601"), the party name for credits ("Tanvi Shah"); body line under it; reason chips "Entered twice" · "Wrong amount" · "Wrong patient or payee" · "Other" (credits: "Created by mistake" · "Duplicate" · "No longer needed" · "Other"); note field "Add a note (optional)" / "Tell the team why (required)" |
| Footer | "Keep it" · red "Delete" (disabled until a reason; hint "Pick a reason to continue" / "Add a short note for “Other”") |
| Multi-step | no |
| Initial focus | none |

### Filters

| Field | Value |
| --- | --- |
| Shape (desktop) | popover anchored under "Filters", right-aligned, flips up / left when there is no room |
| Shape (mobile) | Phone: bottom sheet (full width, max height 82%, radius 16px top, enters 260ms) |
| Trigger | "Filters" |
| Size | 340px wide, max height 100vh − 160px |
| Dismiss | outside click (pending choices are dropped), "Apply filter"; Esc is not wired |
| Header | "Filters" + "Clear all" |
| Footer | "Save as view" / "Saved as view" (left) · "Apply filter" (right, primary 32px) |
| Multi-step | no |
| Initial focus | none |

### Create menu (Pending ⌄) and More tabs

| Field | Value |
| --- | --- |
| Shape (desktop) | dropdown popover under the trigger, end-aligned (Create min 260px; More min 200px) |
| Shape (mobile) | Phone: bottom sheet (max height 72%, radius 16px top, 40% dim backdrop, 260ms) |
| Trigger | ⌄ "More create actions" beside "+ Add pending"; "More ⌄" in the tab track (phone, or when tabs don't fit) |
| Size | rows 38px; Create: "Give" (refresh icon, blush, sub "We pay a patient or party back") · "Take" (wallet, sky, sub "A patient or party pays us") |
| Dismiss | outside click, Esc, pick |
| Header | none |
| Footer | none |
| Multi-step | no |
| Initial focus | the list panel (its search box when the list is searchable); the active row starts on the selected option, else the first; closing returns focus to the trigger |

## Multi-step flow

- Steps (ordered): Day close — 1 Gate (opening cash) → 2 Working day (strip + review) → 3 Closed (report). Send payment — Pay against a bill → Expense → Payment. Invoice — Patient & team → Items → Payment. Add pending — Which way → Why.
- **Sequence varies by input?** yes. Day close by day state: no opening accepted → Gate only (card: 44px peach wallet tile · "OPENING CASH · TODAY" · amount 32px · source "Default float" / "Carried from 2 Oct close" / "Recounted" · Recount + Accept · "You’re starting the day as Riya S. · this is stamped on the day"); accepted and open → 4-cell strip, "Close day" in the bar, review card; closed → report card ("Today is closed" · "Closed by Riya S. · 01:42", "Reopen", 5-cell strip, "What happened" log), no "Close day", entries locked. Past days that are not closed show "Open · auto-closes in N h" and close themselves at midnight (report sub "· auto-closed after the grace period", log "Auto-closed after the grace period · cash taken as expected"). Send payment: step 1 exists only for a new payment while open bills exist; "Pending longest" shows only while no bill is picked. Invoice: Type Medical (or a locked sale) swaps Patient → Customer, Team → Prescribed by, Items → Medicines and adds the stock check; Consultation lists only consultation offerings. Pending: Give vs Take swaps the reason list and the note placeholder.
- Progress indicator: accordion step cards with a 22px numbered circle (current = peach ink, done = green ✓, missing = red "!"), collapsed steps show a peek grid of up to 8 values (uppercase 11px label + value; empty = dashed "Empty"; "Missing: <fields>" in red); Day close review shows "N of M checked" + a 4px bar
- Navigation: "Next: <step> →" at the end of each open step; any step header reopens it ("Edit" / "Open"); Save on a step with a missing required field jumps to that step instead of saving
- Per-step validation: does not block "Next"; blocks Save (jumps to the first step with a missing required field)
- Edit mode: prefilled, same steps, any step can be opened; Day close days are picked from the dropdown, "Previous closes" chips (avatar · "25 Sep" · "Cash ₹7,310" · pill "₹0" sage / "−₹120" blush / "Closed" / "Auto-closed") jump to that day

## Preview / animated panels

| Field | Value |
| --- | --- |
| Surfaces | n/a — Payments has no preview or animated panel (the invoice print is a print-only sheet, specified under Data display) |
| Switching | n/a — no preview surfaces |
| Surface per input type | n/a — no preview surfaces |
| Frame sequence | n/a — nothing animates in frames |
| Frame durations | n/a — nothing animates in frames |
| Progressive reveal | n/a — no staged reveal |
| Static fallback | n/a — no animated surface to fall back from |

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Tab Payments | receipt | 14 | no |
| Tab Pending | refresh-cw | 14 | no |
| Search | search | 15 | no |
| Filters | list-filter | 15 | no |
| Columns button | eye | 16 | yes — "Show or hide columns" |
| Pay | arrow-up-right (red ink) | 15 | no |
| Receive | arrow-down-left | 15 | no |
| Add pending | plus | 16 | no |
| Split ⌄, dropdown chevrons | chevron-down | 14 | yes — menu |
| Row Edit | pencil | 13 | yes |
| Row Delete | trash | 13 | yes |
| Give back / Got it back | wallet | 13 | yes |
| Create menu Give / Take | refresh-cw / wallet | 14 | no |
| Empty state | wallet (search when filtered) | 18 | no |
| Empty-state button | plus | 14 | no |
| Day close gate tile | wallet | 20 | no |
| Day closed | circle-check | 16 | no |
| Fold control | maximize-2 / minimize | 14 | no |
| Bulk bar Export / Print / clear | file / printer / x | 14 | yes |
| Invoice quick line / Browse | search / layout-grid | 15 | no |
| Create row in pickers | plus | 12 | no |
| Quick fill | "⚡" text glyph | 12px text | no |

Library: Lucide · Weight: 1.6px stroke (registry icons); 2px for chevrons, x, check and the more glyph

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Drawer panel (every drawer) | transform translate3d(100%, 0, 0) → 0 | 340ms | cubic-bezier(.32,.72,0,1) |
| Drawer backdrop | background-color rgb(9 9 11 / 0) → / .45 | 340ms | cubic-bezier(.32,.72,0,1) |
| Popovers, dropdowns, Filters | opacity 0 → 1, translateY(−4px) scale(.985) → none (flipped: +4px) | 160ms | cubic-bezier(.2,.8,.2,1) |
| Phone bottom sheets | translateY(28px), opacity 0 → none | 260ms | cubic-bezier(.32,.72,0,1) |
| Search field | flex-basis / min / max width 36px ↔ 200px; background | 220ms; 120ms | cubic-bezier(.2,.8,.2,1) |
| Tabs | background, color | 150ms | ease |
| Row hover | background | 120ms | ease |
| Day close cards, history, review list | opacity 0 → 1, translateY(−4px) → 0 | 200ms | ease |
| Review progress bar | width | 200ms | ease |
| Chevrons (open / close) | rotate 0 → 180deg | 150ms | ease |
| Bulk bar | translateY(100%) → 0 | 220ms | cubic-bezier(.32,.72,0,1) |
| Tooltip (desktop / tablet) | opacity, translateY(2px) → 0 after a 160ms hover delay | 120ms | ease |
| Loading shimmer | background-position | 1100ms loop | ease |

Reduced-motion: every animation and transition runs 1ms with no delay and one iteration (the shimmer stops), no smooth scroll.

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Ledger | Existing rows' text, avatars and pills turn into shimmer bars (z150, 1.1s) for 160–380ms on tab, search or filter change (200–440ms section, 260–560ms page; 10% of loads add 280–600ms) | 96px dashed ring, butter tile, 40px white icon box with wallet 18px · "No entry matches" · "Nothing here yet. Try another tab or search." With filters: search icon · "No matches" · "Nothing matches these filters. Clear them to see everything again." · "+ Clear filters" | toast "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" (9s; rows stay) |
| Pending | as Ledger | "Nothing pending" · "Nothing here yet. Try another tab or search." | as Ledger |
| Drawers | On open the top drawer's text and inputs shimmer for 200–440ms; Save reads "Saving…" 320–740ms | n/a — forms always render their fields | Footer alert (red dot) "Not saved · your changes are kept", button "Retry save", toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" (9s) |
| Day close review | as Ledger | "No entries" in the header · "No entries on this day" in the list | toast as Ledger |
| Pickers in drawers | skeleton rows (62/48/70/40% widths) + spinner in the search for 450ms | "Nothing to pick yet"; with a query "No results for “zz”" + "Try a name, phone number or ID" (patients) / "Check the spelling or try fewer letters" | n/a — local data |

Success: toasts (5.2s; "Undo" on removals) bottom-centre 16px (phone: 76px + safe area above the bottom).

## Copy

| Key | Exact string |
| --- | --- |
| title | "Payments" |
| tabs | "Payments", "Pending", "More" |
| search | placeholder "Patient, invoice or receipt", aria "Search payments", tooltip "Search · press /" |
| toolbar | "Filters", "Day close", "Pay", "Receive", "Add pending" |
| toolbar tooltips | "Pay · money out (rent, supplies, vendors, refunds)", "Receive · money in from a patient", "More create actions", "Columns · 6 of 6 shown" |
| ledger heads | "Ref", "What", "When", "From / to", "Mode", "Amount", "By" |
| pending heads | "Ref", "Who", "Which way", "Amount", "Why", "Since", "State" |
| what pills | "Received", "Paid" |
| pending pills | "Give", "Take", "Open", "Returned", "Received", "Adjusted" |
| ledger sub lines | "Sale · Invoice #785", "Refund · Credit note CN-100 · for Invoice #760", "Money back · ", "Medical PO #431 · bill 1631", "Stock PO #15 · bill CX-118", "Edited 1× · last ₹600 UPI → ₹700 UPI" |
| end lines | "All entries loaded", "All pending loaded" |
| filters | "Show", "All", "Received", "Paid", "Created", "Clear all", "Apply filter", "Save as view", "Saved as view" |
| day close | "Day close", "Previous closes", "Close day", "Reopen", "OPENING CASH · TODAY", "Default float", "Recount", "Accept ₹2,000", "Accept recount", "You’re starting the day as Riya S. · this is stamped on the day", "Opening cash", "Cash in · out", "Expected in drawer ₹1,740", "Counted now", "Count the drawer", "Net by mode", "Today is closed", "Collected", "Paid out", "Cash counted", "Difference", "Drawer matched", "Extra in drawer", "Short in drawer", "What happened", "Review every entry", "0 of 3 checked", "No entries on this day", "2 Oct not closed · 15 h left · Review" |
| day close log | "Riya S. accepted the opening cash ₹2,000", "3 of 3 entries reviewed", "Drawer counted at ₹1,700 · ₹40 short", "Riya S. closed the day · summary sent to admin on WhatsApp" |
| receive | "Receive payment", "Edit payment in", "Receipt goes to the patient on WhatsApp", "Who is paying", "Against invoice", "Amount received", "+ Split · add a mode", "Reference", "UPI ref / card last 4", "Record ₹8,550" |
| send | "Send payment", "Edit payment out", "Clinic spend · shows in day close", "Pay against a bill", "Supplier bill", "Other spend", "Not against a purchase order", "Pending longest", "Paid to", "Vendor or person", "What was bought", "Bill / receipt", "Drop the bill photo or browse", "Optional · JPG, PNG or PDF", "Add expense", "Add & another" |
| invoice | "New invoice", "Edit invoice", "New sale", "Pick the type, then add items", "Changes are logged on the invoice", "Patient & team", "Items", "Payment", "Overall discount", "Paid now", "+ Add another mode", "Remark", "Shown on the printed invoice", "Often billed", "Suggested · click to add", "↑↓ choose · ↵ add · Esc clear", "No match. Check the spelling or try fewer letters." |
| pending drawers | "Add pending", "Edit pending", "Which way", "Who", "Why", "Reason", "For invoice", "Settle by", "Save · give later", "Save · take later", "Give back", "Got it back", "How it goes back", "How it came in", "Paid back by", "Received as" |
| print | "Patient Information", "Customer Information", "Invoice Details", "Sale Details", "Items", "Medicine Items", "Pack Size", "Net Amt.", "Notes", "No additional notes", "Payment Summary", "Total Amount:", "Overall Discount:", "Bill Amount:", "Balance Due:", "Thank you for choosing Cresence Skin for your skin care needs", "For any queries, please contact us at +91 74900 20099" |
| validation | "Enter an amount", "Add who was paid and the amount", "Pick a patient", "Pick a customer", "Add at least one item", "Pick who", "Enter the amount", "Pick a reason", "Add a note for “Other”", "Count the cash first" |
| toasts | "₹8,550 received from Kiran Desai", "Expense PAY-5601 added", "₹2,980 paid against Medical PO #431", "CR-3 saved · give ₹500 to Tanvi Shah", "₹500 given back to Tanvi Shah · Out entry added", "Opening cash ₹2,000 accepted · stamped 09:12", "Day closed · summary sent to admin on WhatsApp", "Day reopened", "TX-5509 · Day closed", "EX-310 removed", "TX-5512 removed · invoice balance restored" |
