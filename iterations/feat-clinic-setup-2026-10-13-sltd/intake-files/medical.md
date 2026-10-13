# Screen: Medical

- Route: /organization/:organizationSlug/medical/:tab — sales · medicines · purchases · suppliers · manufacturers · mrs · payments; drawers /medical/sales/create, /medical/sales/:saleId, /medical/sales/:saleId/return, /medical/medicines/create, /medical/medicines/:medicineId/edit, /medical/purchases/create, /medical/purchases/:purchaseOrderId (view), /…/edit, /…/receive, /medical/suppliers/create, /medical/suppliers/:supplierId/edit, /medical/manufacturers/create, /medical/manufacturers/:manufacturerId/edit, /medical/mrs/create, /medical/mrs/:mrId/edit, /medical/mrs/:mrId/visits/create
- Purpose: The in-house medicine store — medicines with batches and expiry, sales to patients and Medical contacts, purchase orders, suppliers, manufacturers, MRs and the Medical slice of the payments ledger; it never shares records with Clinic stock.
- Entry points: header section tab "Medical" or All sections; phone bottom tab bar "More"; a prescription's "Sell medicines" row action or "Save & sell" (opens Medical › Sales with New sale prefilled); Today board card in the Pharmacy stage. With no tab chosen yet the room opens on Medicines
- Exit points: New sale (the shared invoice drawer), Sale, Return from patient, medicine, purchase order, Receive goods, Purchase order view, supplier, manufacturer, MR, Log MR visit and Return expiring stock drawers; stacked child drawers; a received PO's "Pay ₹X" switches to Payments with Send payment open against that bill; A4 sale print
- Access: View — Admin, Pharmacist, Accountant · create / edit — Admin, Pharmacist · delete, cancel order, void sale — Admin (default role table, editable in Users › Roles & access). Without Delete the red row actions and drawer Delete / "Cancel order" / "Void sale" disappear; without Edit an existing record opens read-only ("View only · your role can’t change this")
- Layout shell: app shell
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: blush.

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| Toolbar | h1 "Medical" · tab track Sales (receipt) · Medicines (pill) · Purchases (package) · Suppliers (users) · Manufacturers (package) · MRs (users) · Payments (wallet) · "More ⌄" when tabs overflow · search · saved-view chips · "Filters" · columns button (eye; black count badge when columns are hidden) · view action button (per tab and filter, see Notes) · split "+ New <thing>" with ⌄ "Create something else" | One wrapping flex row, gap 10px 8px, padding 16px 20px (12px 12px under 1440px wide or 800px tall); h1 20px/600 with a hairline right border; tabs 28px in a 3px track; tabs that don't fit the measured space fold, from the right, into "More ⌄" (the selected tab always stays; all seven fit at 1440). Search is a 36px icon until clicked or "/", then 200px (150–220px). View action shows icon + label when there is room, otherwise a 36px icon-only button. Tablet: h1 18px; at 820 the track shows "Sales · Medicines · More ⌄" | Phone: h1 hidden. Row 1 = search (always open, 40px, grows) + "Filters" 40px. Row 2 = selected tab + "More ⌄" (the rest move into More, opened as a bottom sheet grouped "Selling" · "Stock" · "Buying" · "Money") + the view action as a 36px icon-only button. Columns button hidden. The split button leaves the toolbar: two floating pills fixed 16px from the right, 74px + safe-area above the bottom, 52px tall, radius 999px, 8px apart — "+ New medicine" (padding 0 20px 0 16px, 14px) and a 37px chevron pill — shadow 0 10px 28px -8px rgb(0 0 0 / .45) | View action per state: Medicines + Filters "Low stock" → "Reorder low stock" (package); Medicines + "Nearest expiry" set → "Sell all at 20% off" / "Remove near-expiry discount" (tag); Sales with Status All → "Prescriptions to fill" (pill, opens a dropdown); Sales Unpaid → "Send payment reminders" (message); Purchases Stage Received → "Pay all received · ₹2,980" (wallet); otherwise none. Default hidden columns: Medicines › Best rate, Sales › Margin, MRs › Samples |
| Table card | One table per tab, end line, 44px footer | Fills the remaining height; 1px divider border, radius 12px, margin 0 20px 20px (0 12px 12px compact) | Edge to edge, no border / radius / shadow; header row and footer hidden; rows reflow | — |
| Table footer | Count ("3 sales", "3 orders", "4 suppliers · ₹6,563 payable", "6 manufacturers", "3 MRs"; Medicines and Payments blank) · fold control "N columns in rows · Show all" ↔ "Fit to width" · bulk bar | 44px, z50, 12px | Hidden | — |

## Data display

Primitive: table (one per tab) · phone keeps rows, never cards

### Sales

| Field | Value |
| --- | --- |
| Columns (ordered) | Sale ("#983") · Customer (person chip; sub "Patient" with green P badge, or "Medical contact") · Medicines ("Admosh UV Sunscreen 60g ×1, Uncap Smooth Anti Acne PM Gel ×1"; sub "Batches: ASC002, CSH26044") · Bill (₹1,200, 600, right; sub "− ₹239 returned" lav) · Margin (hidden by default; "₹584", sub "49%" sage) · Status (pills "Returned" lav, tooltip "₹239 refunded", then "Paid" sage / "Unpaid" blush, with dot) · When ("Today 10:12") · actions |
| Column widths | 24px checkbox · 80px · minmax(200px, 1.3fr) · minmax(220px, 1.6fr) · 100px · 100px · 100px · 120px · actions · min width 1100px |
| Sortable | Sale, Customer, Bill (arrow-up-down → arrow-up / arrow-down, third click clears) |
| Row height | Padding 10px top/bottom, 20px right / 17px left (16 / 13 compact), compact density 5px; 3px left edge sage (paid) / blush (unpaid) |
| Row click | Opens the Sale drawer (read-only) |
| Row actions | "Collect ₹563" (wallet, unpaid only; toast "₹563 received") · "Return medicines" (refresh) · "Print" (printer, A4 sale sheet) · separator · "Void sale" (trash, red; unpaid with no returns only). 32px icon-only, tooltip = name |
| Selection | Hover checkbox, tri-state header, shift range; bulk bar "✓ N selected" · "Select all N" · "Message" (WhatsApp glyph, toast "WhatsApp drafted for N people") · "Export" · "Print" · Esc × |
| Mobile behaviour | Phone: rows, not cards. Primary = Customer (avatar + name + sub); key = Bill top-right; meta line "Medicines …" · "Status Paid" · "When Today 10:12" · "#983"; actions on their own right-aligned line (40×36). Tablet: overflow columns fold under the customer |
| Pagination | Infinite scroll, virtualised above 60 rows; end line "All sales loaded" |

Filters: "Status" (All · Unpaid · Returned) · "Created" · "Follow-up date".

### Medicines

| Field | Value |
| --- | --- |
| Columns (ordered) | ID ("#458") · Medicine (name 500; sub composition, or "Needs MRP and composition" in butter for a quick record) · Manufacturer (pill in the manufacturer's colour) · Stock (12.5px "8 in stock · OK" / "· Low" / "· Out" + 5px bar = stock ÷ fill-up level; sage / butter / blush) · Nearest expiry (pill "03/29 · CSH26044"; ≤ 30 days blush, ≤ 90 days butter, else sage; "No stock" grey) · MRP (₹650 right; sub "−20% near expiry" blush when discounted) · Best rate (hidden by default; "₹440", sub supplier) · Margin ("32%" 600, sage ≥ 30% else butter) · actions |
| Column widths | 24px · 64px · minmax(220px, 1.6fr) · 110px · 150px · 150px · 100px · 150px · 80px · actions · min width 1240px |
| Sortable | ID, Medicine, Manufacturer, Stock, MRP, Margin |
| Row height | As Sales; left edge in the stock tone |
| Row click | Opens "Edit medicine" |
| Row actions | Batch expiring within 90 days: "Return expiring stock to supplier" (refresh) · "Sell at 20% off (near expiry)" / "Remove near-expiry discount" (tag; toasts "20% off applied to Glycolac Cream" / "Discount removed"); always: Edit (pencil) · Delete (trash, red) |
| Selection | As Sales ("Message" included) |
| Mobile behaviour | Phone: primary = Medicine (+ composition); key = MRP top-right; meta "Margin 32%" · "Manufacturer ALVI" · "Stock 8 in stock · OK" · "Nearest expiry 03/29 · CSH26044" (ID drops out); actions own line. Tablet 820: Medicine · MRP · Margin stay, 4 columns fold ("4 columns in rows · Show all") |
| Pagination | Infinite scroll; end line "All medicines loaded" |

Filters: "Stock" (All · Low stock) · "Nearest expiry" (Any · Within 30 days · Within 60 days · Within 90 days) · automatic Manufacturer section · "Created".

### Purchases

| Field | Value |
| --- | --- |
| Columns (ordered) | PO (grey pills "#431" + bill no "1631" or "—") · Supplier (text 500) · Items ("Admosh UV Sunscreen 60g, Arganlif Hair Serum 50 ml"; sub "2 items · 1 free") · Date ("25 Sep") · Total (₹2,980, 600, right) · Stage (pill "Ordered" sky / "Received" butter / "Paid" sage with dot; + grey "₹1,200 paid" on a part-paid received order) · actions |
| Column widths | 24px · 130px · minmax(200px, 1.3fr) · minmax(180px, 1.2fr) · 90px · 110px · 150px · actions · min width 1030px |
| Sortable | PO, Supplier, Total, Stage |
| Row height | As Sales; left edge in the stage tone |
| Row click | Ordered → "Edit purchase order"; Received or Paid → "Purchase order" view |
| Row actions | Ordered: "Receive goods" (check) · Edit (pencil) · "Cancel order" (trash, red). Received: "Pay ₹2,980" (wallet → Payments, Send payment against "Medical PO #431") · View (eye). Paid: View (eye) |
| Selection | As Sales ("Message" included) |
| Mobile behaviour | Phone: primary = Supplier; key = Total; meta "PO #431, 1631" · "Items …" · "Date 25 Sep" · "Stage Received"; actions own line |
| Pagination | Infinite scroll; end line "All purchase orders loaded" |

Filters: "Stage" (All · Ordered · Received · Paid) · "Created".

### Suppliers

| Field | Value |
| --- | --- |
| Columns (ordered) | Supplier (person chip, sky; sub "+91 99981 29429" or "Add phone") · Manufacturers (pills) · Orders ("1 order" / "No orders") · Payable (₹827 blush 600 or "—") · Ageing (pill "5 days" with dot; ≥ 30 days blush, ≥ 7 butter, else sage; empty when nothing is due) · actions |
| Column widths | 24px · minmax(220px, 1.4fr) · minmax(180px, 1.2fr) · 100px · 110px · 120px · actions · min width 980px |
| Sortable | Supplier, Payable |
| Row height | As Sales; left edge in the ageing tone while money is due, none otherwise |
| Row click | Opens "Edit supplier" |
| Row actions | "Pay ₹827" (wallet, while due; clears the due, toast "₹827 paid to K R Medical Agency") · "New purchase order" (package) · Edit (pencil) · Delete (trash; only with nothing due and no unpaid order) |
| Selection | As Sales ("Message" included) |
| Mobile behaviour | Phone: primary = Supplier; key = Payable; meta "Manufacturers ALVI, DERM, AVRI" · "Orders 1 order" · "Ageing 5 days"; actions own line |
| Pagination | Infinite scroll; end line "All suppliers loaded" |

Filters: automatic Manufacturers section when it qualifies · "Created".

### Manufacturers

| Field | Value |
| --- | --- |
| Columns (ordered) | Manufacturer (pill "ALVI" in its colour) · Medicines ("1 medicine" / "None yet" grey) · Suppliers (grey pills) · MRs (mint pills) · actions |
| Column widths | 24px · minmax(200px, 1.1fr) · 120px · minmax(200px, 1.3fr) · minmax(180px, 1.2fr) · actions · min width 930px |
| Sortable | Manufacturer |
| Row height | As Sales; left edge in the manufacturer's colour |
| Row click | Opens "Edit manufacturer" |
| Row actions | Edit (pencil) · Delete (trash; only when it has no medicines) |
| Selection | As Sales ("Message" included) |
| Mobile behaviour | Phone: the manufacturer pill sits left and takes the free width; "1 medicine" sits right (max 46% width) with the meta lines "Suppliers K R Medical Agency, Akshar Medicines" · "MRs Alvio Pharma · Rakesh" under it; Edit on its own line |
| Pagination | Infinite scroll; end line "All manufacturers loaded" |

Filters: automatic Suppliers and MRs sections · "Created".

### MRs

| Field | Value |
| --- | --- |
| Columns (ordered) | MR (person chip, mint; name "Alvio Pharma · Rakesh", sub phone or "Add phone") · Represents (pills) · Last visit ("12 Sep") · Next visit (pill sky; blush when overdue) · Samples (hidden by default; "5 samples") · actions |
| Column widths | 24px · minmax(220px, 1.4fr) · minmax(180px, 1.2fr) · 110px · 120px · 120px · actions · min width 980px |
| Sortable | MR |
| Row height | As Sales; no status edge |
| Row click | Opens "Edit MR" |
| Row actions | "Log visit" (check) · Edit (pencil) · Delete (trash, red) |
| Selection | As Sales ("Message" included) |
| Mobile behaviour | Phone: primary = MR; key = Represents pills top-right; meta "Last visit 12 Sep" · "Next visit 2 Oct"; actions own line |
| Pagination | Infinite scroll; end line "All MRs loaded" |

Filters: "Created".

### Payments (Medical)

| Field | Value |
| --- | --- |
| Columns (ordered) | The Payments ledger, limited to Medical: receipts against Medical invoices ("Sale · Invoice #785"), payments against Medical POs and expenses in Medicines. Ref · What · When · From / to · Mode · Amount · By · actions (as in the Payments screen) |
| Column widths | 24px · 96px · 110px · 150px · minmax(240px, 1.8fr) · 110px · 120px · 130px · actions · min width 1180px |
| Sortable | No |
| Row height | As Sales; left edge in the What tone |
| Row click | Open-day entry → its Payments edit drawer; closed day → toast "TX-5501 · Day closed" |
| Row actions | Open-day entries: Edit · Delete (as Payments) |
| Selection | As Sales, without "Message" |
| Mobile behaviour | Phone: primary = From / to (patient chip + "Sale · Invoice #785"); key = Amount; meta "What Received" · "When Today 10:12" · "Mode UPI" · "PAY-5512" |
| Pagination | Infinite scroll; end line "All Medical payments loaded" |

Filters: automatic What and Mode sections · "Created" (no "Show" section here).

### Sale print (A4)

| Field | Value |
| --- | --- |
| Grid | The Payments A4 invoice sheet in its Medical form: 210 × 297mm, content 169.5mm wide from 38.1mm top / 23.3mm left |
| Anatomy | "Customer Information" (Name, Phone) · "Sale Details" ("Sale Date:", "Sale #:" "S-983", "Status:") · "Medicine Items" table ("Medicine Name" · "Pack Size" · "Qty" · "Amount" · "Discount" · "GST" · "Net Amt.") · "Notes" · "Payment Summary" · footer "Thank you for choosing Cresence Skin for your medicine needs" / "For any queries, please contact us at +91 74900 20099" |
| Meta line | A sale with an invoice prints that invoice; a sale without one prints MRP lines split into pre-GST amount + GST |
| Truncation | Names wrap |
| Actions | Sales row "Print" opens the browser print dialog 260ms after the sheet renders |
| Mobile | Same A4 sheet on every viewport; never shown on screen |

## Forms

### New sale (shared invoice drawer, type Medical locked)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | branch | chips | Branch | — | — | preselected | Only with 2+ open branches (Adajan · Vesu · Varachha) |
| 2 | customer | picker, single (local list) | Customer | "Search patients, leads or medical contacts" | "patient or any contact · new names are saved as a Medical contact" | yes | Groups Patients · Leads · Medical contacts; "Add contact “query”" creates a Medical contact (toast "Viral Sheth saved as a Medical contact · add a mobile below"). Toast "Pick a customer" |
| 3 | mobile | phone, +91 (contacts only) | Mobile | "98765 43210" | "saved on the contact" | no | Digits only, saved to the contact |
| 4 | team | people picker, multi | Prescribed by | "Pick prescribed by" | "from Rhea’s team" once a customer is picked, else "doctor, therapist, counsellor" | no | Prefilled with the customer's recent doctors / staff, or with you ("Riya S. (you)") |
| 5 | items | quick line + item rows | Medicines | Quick line "Type medicine and qty · e.g. sun 2" | "2 = qty · 10% = discount · @500 = rate"; "↵ add"; "Browse" (groups All · Often billed · Oral · Topical); chips "Often billed" | yes | Rows: medicine picker ("Select medicine…"; options sub "8 in stock · Adapalene 0.1% + Clindamycin" or "Out of stock", meta MRP) · Qty stepper · Rate (= MRP, read-only) · Disc % · GST (read-only 0%) · Final (editable) · ×; "+ Add medicine"; total right. Toasts "Add at least one item", "Only 3 of Glycolac Cream in stock" |
| 6 | od | number, % | Overall discount | "0" | — | no | — |
| 7 | quick | chips | Quick fill | — | — | no | "Full · ₹324 in UPI" · "Split cash + UPI" · "Nothing now" |
| 8 | paid | item rows Mode · Amount · × | Paid now | "₹ 0" | "Paid ₹324 · due ₹0"; "+ Add another mode" | no | "Paid ₹X is more than the bill ₹Y" |
| 9 | remark | textarea | Remark | "Shown on the printed invoice" | — | no | Prefilled "From Rx #500" when opened from a prescription |

- Error display: toasts; Save jumps to the step that misses a required field
- Submit: "Create medical invoice"; "Cancel"; summary "Medical · Rhea Shah · 1 item". Quick fill: "⚡ Repeat #785" (sky) · "⚡ From Rx #500" (sage)
- Loading: "Saving…" 320–740ms
- Success: toast "Medical invoice #788 created"; writes the sale (paid when fully paid), deducts each medicine from the batch with the earliest expiry, opens a "Payment due" task when money is left
- Dirty-state guard: none — Cancel, ×, backdrop or Esc close without asking

### Medicine (New medicine / Edit medicine)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | n | text | Name | "e.g. Priya Shah" | — | yes | Toast "Add a name" |
| 2 | mf | picker, single | Manufacturer | "Search manufacturer" | — | yes (new: prefilled with the first manufacturer, ALVI) | Pill options with medicine counts ("2 medicines"); "Add manufacturer “query”"; footer "New manufacturer · “query”" + "full details" |
| 3 | comp | text | Composition | "e.g. Tretinoin 0.025%" | "used for substitutes" | no | — |
| 4 | rx | chips | Sold with | — | — | preselected "Over the counter" | "Prescription only" (blush) · "Over the counter" (sage) |
| 5 | mrp | ₹ decimal input 36px, 8 chars, "incl. GST" suffix | MRP | "0" | — | yes | Toast "Enter the MRP" |
| 6 | gst | segmented radio 36px | GST | — | — | preselected 12% | 0% · 5% · 12% · 18%; live split below: "Before GST" ₹551 · "GST 18%" ₹99 · "Best buy rate" ₹440 or "Add a supplier price" · "Margin" (sage ≥ 30%, butter ≥ 15%, blush) |
| 7 | levels | stock panel: bar + two steppers | Stock levels | — | Status pill "8 in stock · Healthy" / "Reorder" / "Overstocked" / "Out"; hint "Reorder alert when stock falls to 2." or "Order 10 to fill up to 10. Shows under Stock › Low stock." | no | "Reorder at" (− / + 32px, 4 digits; aria "Decrease reorder level") never above "Fill up to"; "Fill up to" never below "Reorder at" (max 9999) |
| 8 | batches | item rows | Batches | "Batch" · "MM/YY" · "Qty" · "Rate" | Total "8 in stock" | no | Heads "Batch" · "Expiry" · "Qty" · "Rate"; "+ Add batch" |
| 9 | rates | item rows | Supplier prices | "Supplier" · "Rate" · "Free" · "Lead days" | — | rate required per picked supplier | Supplier picker groups "Distributes ALVI" / "Other suppliers" (sub phone or "No phone yet"); "Add supplier “query”"; "New supplier · “query”"; Rate tooltip "Enter this supplier’s rate"; Free and Lead days steppers; "+ Add supplier price". Toast "Enter a rate for every supplier price" |

- Error display: toasts; red rate cells
- Submit: "Add medicine" / "Save changes"; edit adds red "Delete"; "Cancel"; summary = name
- Loading: "Saving…"
- Success: toast "Added Azelan 20% Cream" / "Saved Azelan 20% Cream"; a quick record loses its "Needs MRP and composition" flag
- Dirty-state guard: none

### Supplier (New supplier / Edit supplier)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | n | text | Agency name | — | — | yes | Toast "Add a name" |
| 2 | ph | phone, +91 | Phone | "98765 43210" | "10 digits" | no | Digits only |
| 3 | gst | text | GST number | — | — | no | — |
| 4 | mf | picker, multi | Manufacturers | "Search manufacturers" | "pick any" | no | "Add manufacturer “query”"; "New manufacturer · “query”" |
| 5 | payable | info (edit only) | Payable | — | — | — | "₹827 · 5 days" / "Nothing due" |
| 6 | orders | info (edit only) | Orders | — | — | — | "1 orders · ₹4,236" / "No orders yet" |
| 7 | account | read-only rows (edit only) | — | — | — | — | Heads "Reference" · "Date" · "Stage" · "Amount" · "Balance": "PO #430 · T-82370" · "24 Sep" · "Ordered" (stage colour) · "₹4,236" · "Not billed" / "₹2,980 due" (blush) / "Paid"; credit rows "Credit · 026-312" · "Credit" · "− ₹369" · "Adjusted" |

- Error display: toast
- Submit: "Add supplier" / "Save changes"; edit adds red "Delete" (only with nothing due and no unpaid order); "Cancel"; summary = name. Quick fill (edit): "⚡ New purchase order" (sky) · "⚡ Pay ₹827" (sage; toast "₹827 paid to K R Medical Agency" + "Undo")
- Loading: "Saving…"
- Success: toast "Supplier saved"
- Dirty-state guard: none

### Manufacturer (New manufacturer / Edit manufacturer)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | n | text, forced upper case | Name | "e.g. Priya Shah" | — | yes | Toast "Add a name" |
| 2 | t | swatch row | Colour | — | — | preselected lav | lav · sky · butter · blush · sage · mint (✓ on the chosen one) |
| 3 | sups | picker, multi | Suppliers | "Search suppliers" | "who distributes it" | no | "Add supplier “query”"; "New supplier · “query”" |
| 4 | mrs | picker, multi | MRs | "Search MRs" | "who represents it" | no | "Add MR “query”"; "New MR · “query”" |
| 5 | count | info | Medicines | — | — | — | "1 medicine in Stock" / "None yet · add them from Stock" |

- Error display: toast
- Submit: "Add manufacturer" / "Save changes"; Delete only when it has no medicines; "Cancel"; summary "ALVI · 2 suppliers · 1 MR"
- Loading: "Saving…"
- Success: toast "Manufacturer saved · connections updated" (links are written on the suppliers and MRs too)
- Dirty-state guard: none

### MR (New MR / Edit MR)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | n | text | Name | "e.g. Priya Shah" | — | yes | Toast "Add a name" |
| 2 | ph | phone, +91 | Phone | "98765 43210" | "10 digits" | no | — |
| 3 | next | date dropdown | Next visit | "Pick a date" | — | no | Today and the next 120 days |
| 4 | mf | picker, multi | Manufacturers | "Search manufacturers" | "one MR can represent many" | no | "Add manufacturer “query”"; "New manufacturer · “query”" |

- Error display: toast
- Submit: "Add MR" / "Save changes"; edit adds red "Delete"; "Cancel"; summary = name
- Loading: "Saving…"
- Success: toast "MR saved"
- Dirty-state guard: none

### Log MR visit

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | date | date dropdown | Date | "Pick a date" | — | defaults to today | — |
| 2 | next | date dropdown + quick chips | Next visit | "Pick a date" | — | defaults to "12 Oct" | Quick "2 weeks" · "1 month" |
| 3 | smp | text | Samples given | "e.g. 4 tubes Azelan" | — | no | — |
| 4 | note | textarea | Note | — | — | no | — |

- Error display: n/a — no field can fail
- Submit: "Log visit"; "Cancel"; summary "Next visit 12 Oct"
- Loading: "Saving…"
- Success: toast "Visit logged · reminder set for 12 Oct"; the MR row's Last / Next visit and Samples update
- Dirty-state guard: none

### Purchase order (New / Edit purchase order)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sup | picker, single | Supplier | "Search supplier" | — | yes (prefilled with the first supplier) | Options avatar + sub manufacturers ("ALVI, DERM, AVRI"); "Add supplier “query”" (toast "Supplier Om Pharma added · add phone and GST later"); "New supplier · “query”". Toast "Pick a supplier" |
| 2 | inv | text | Invoice no. | — | — | no | — |
| 3 | date | date dropdown | Order date | "Pick a date" | — | defaults to today | — |
| 4 | items | quick line + item rows | Items | Quick line "Type medicine, qty, free, rate · e.g. azel 20 +2 @180" | "20 = qty · +2 = free · @180 = rate"; "↵ add"; "Browse"; chips "Low stock" ("Arganlif Hair Serum 50 ml · 2 left") | no | Rows: medicine picker ("Select medicine…"; groups "From K R Medical Agency" / "Other medicines"; sub "8 in stock · ALVI" / "Out of stock · DERM"; meta rate) · Qty · Free · Rate (required, tooltip "Enter the purchase rate") · Amount (read-only) · ×; "+ Add medicine"; total. A typed name the list lacks: "Add medicine “query”" or quick-line row "Not in the list · add as typed"; leaving the picker by outside click or Tab also keeps the typed name. Toasts "Enter the rate for Epriva Tab" / "Enter the rate for 2 medicines" |

- Error display: toasts; red rate cells
- Submit: "Create order" / "Save changes"; edit adds red "Cancel order"; "Cancel"; summary = total "₹4,236". Quick fill: "⚡ Reorder low stock" (butter; every medicine at or below its reorder level, qty = fill-up − stock, supplier's rate)
- Loading: "Saving…"
- Success: toast "Purchase order saved" (stage Ordered)
- Dirty-state guard: none

### Receive goods

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | got | picker per row | Arrived | "Arrived" | — | preselected ✓ | "✓" · "✗" |
| 2 | b | text per row | Batch | "Batch" | — | no | Empty → saved as "NEW-430" |
| 3 | exp | text per row | Expiry | "MM/YY" | — | no | Empty → "12/27" |

- Error display: n/a — every field has a fallback value
- Submit: "Mark received"; "Cancel"; summary = order total; read-only columns Medicine · Qty · Free; "+ Add unexpected item" shows but adds nothing
- Loading: "Saving…"
- Success: toast "Goods received · stock and free quantity added"; ticked lines become new batches (qty + free), stage → Received
- Dirty-state guard: none

### Return from patient

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | rq | number per row (0 – sold) | Return | "0" | — | at least one | Read-only Medicine · Batch · Sold · Refund columns; toast "Enter what is being returned" |
| 2 | why | chips | Reason | — | — | preselected "Unused" | Unused · Reaction · Doctor changed Rx · Wrong item · Damaged |
| 3 | mode | chips | Refund by | — | — | preselected "Cash" | Cash · UPI · Card |

- Error display: toast
- Submit: "Refund ₹550"; "Cancel"; summary "Unused · ₹550". Quick fill "⚡ Return everything" (lav)
- Loading: "Saving…"
- Success: toast "₹550 refunded · stock added back" (Damaged or Reaction: "… · stock written off"); the sale shows "− ₹550 returned" and a "Returned" pill
- Dirty-state guard: none

### Return expiring stock

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sup | picker, single | Supplier | "Search supplier" | — | yes (prefilled with the cheapest supplier) | Options = this medicine's suppliers, sub "Bought at ₹123" |
| 2 | q | number stepper, suffix "of 3" | Quantity | — | — | no | Capped at the batch quantity |
| 3 | credit | info | Credit note | — | — | — | "₹369" (qty × batch rate) |

- Error display: n/a — values are capped, nothing can fail
- Submit: "Return & take credit"; "Cancel"; summary "Credit reduces what you owe Akshar Medicines"
- Loading: "Saving…"
- Success: toast "3 returned · ₹369 credit from Akshar Medicines"; batch reduced, supplier payable reduced, a credit row appears in that supplier's Account
- Dirty-state guard: none

### Create from a picker (quick records)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Manufacturer pickers (medicine, supplier, MR) | create row | "Add manufacturer “acme”" | — | Creates "ACME" with the next colour | — | Toast "Manufacturer ACME added" |
| 2 | Supplier pickers (purchase order, supplier prices, manufacturer) | create row | "Add supplier “Om Pharma”" | — | Creates a supplier without phone / GST | — | Toast "Supplier Om Pharma added · add phone and GST later"; row sub "Add phone" |
| 3 | MR picker (manufacturer) | create row | "Add MR “Ravi”" | — | Creates an MR | — | Toast "MR Ravi added"; row sub "Add phone" |
| 4 | Medicine pickers (purchase-order rows) | create row, or type and leave | "Add medicine “Azel cream”" | — | Creates a medicine with MRP ₹0 linked to the order's supplier | — | Toast "Azel cream added · set MRP later in Stock"; Medicines row sub "Needs MRP and composition" (butter) |
| 5 | Any picker with a full form | list footer row | "New manufacturer · “acme”" + "full details" (also New supplier, New MR, New medicine) | — | Opens that record's drawer stacked on top with the name prefilled; its save selects the new record in the parent field | — | Stacked drawer footer reads "Back" |

- Error display: n/a — quick records need only the typed name
- Submit: the create row itself (Enter on the highlighted row)
- Loading: none — instant
- Success: the new record is selected in the picker
- Dirty-state guard: none

## Popups

### Drawers (medicine, supplier, manufacturer, MR, visit, purchase order, receive, views, returns)

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer, right edge, full height, white, shadow -16px 0 40px rgb(0 0 0 / .16), backdrop rgb(9 9 11 / .45) |
| Shape (mobile) | Phone: full-screen panel (100% width, no shadow); × inside the top-right corner (8px inset, 44 × 44px, transparent, 22px glyph); header right padding 56px; the 6-column form grid stays (half fields side by side); the price split becomes a sideways-scrolling strip of 128px cells; the two stock steppers stack; item rows wrap (picker full width, then the other cells, × pushed right); footer buttons 44px on one line, the summary centred below in 12px; "Add & another" never shows. Tablet: width min(size, 100vw − 56px) — 840 → 764px at 820 |
| Trigger | "+ New <thing>" and the ⌄ menu; row click; row actions ("Receive goods", "View", "Log visit", "Return medicines", "Return expiring stock to supplier", "New purchase order"); "Prescriptions to fill" |
| Size | 840px — New sale, Sale, Return from patient, medicine, Edit supplier, purchase order, Receive goods, Purchase order view · 680px — Return expiring stock · 560px — New supplier, manufacturer, MR, Log MR visit (a drawer holding an item-rows table always opens at 840) |
| Dismiss | backdrop, Esc, floating × (36px, radius 12px, white, 14px left of the drawer), "Cancel" / "Close" |
| Header | 76px (60px phone), padding 14px 24px (12px 20px compact, 10px 16px phone): title 18px/600 + tag pill ("#458", "#430", "#983"), sub 13px. Titles / subs: "New sale" "Medical invoice · stock updates by earliest expiry" · "Sale" "Rhea Shah · Today 10:12 · a sale is changed by a return, not edited" · "Return from patient" "Rhea Shah · returned stock goes back into its batch" · "New medicine" / "Edit medicine" "ALVI · Adapalene 0.1% + Clindamycin" (or "· composition not set") · "New supplier" / "Edit supplier" "Agency you buy from" · "New manufacturer" / "Edit manufacturer" "The brand on the pack · links suppliers and MRs" · "New MR" / "Edit MR" "Medical representative" · "Log MR visit" "Alvio Pharma · Rakesh" · "New purchase order" / "Edit purchase order" "Order → receive → pay" · "Receive goods" "K R Medical Agency · tick each item and enter batch & expiry" · "Purchase order" "Shree Ramdev Medical Agency · received, stock added · items locked" / "Akshar Medicines · paid, locked" · "Return expiring stock" "Glycolac Cream · batch 026-312 · expires 11/26". Badges row under the header (e.g. "ALVI" · "8 in stock" · "Best ₹440 · K R Medical Agency"; "Paid" / "Unpaid" · "Returned ₹239" · "Invoice #785 · in patient file" · "₹1,200"; "Credit ₹369" · "58 days left") and a Quick fill row where listed |
| Footer | summary (left, 12.5px, ellipsis) · red Delete / "Cancel order" / "Void sale" when allowed · "Cancel" (views: "Close"; stacked: "Back") · alert "Not saved · your changes are kept" after a failed save · primary. View drawers: Purchase order received "Pay ₹2,980" (marks it Paid, toast "PO #431 paid"), paid "Print" (toast "Printing PO #428"), summary "Payable ₹2,980" / "Paid ₹1,296" / "Paid ₹1,200 of ₹1,296"; Sale unpaid "Collect ₹563", paid "Return medicines", summary "2 medicines · ₹1,200" |
| Multi-step | yes — see Multi-step flow; views, Receive goods and Return expiring stock are single sections |
| Initial focus | none — nothing is auto-focused |

### Stacked child drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer above the open drawer, its own 45% backdrop (z 90; the global ones z 100) |
| Shape (mobile) | Phone: full-screen panel above the parent. Tablet: as desktop |
| Trigger | A picker footer "New <thing> · “query”" + "full details" |
| Size | that record's normal width (manufacturer 560, supplier 560, MR 560, medicine 840) |
| Dismiss | backdrop, floating ×, "Back" (nothing is selected); Esc closes the drawer underneath instead and leaves this one open |
| Header | as the record's own drawer, name prefilled with the query |
| Footer | "Back" · the record's primary ("Add manufacturer", "Add supplier", "Add MR", "Add medicine") |
| Multi-step | as the record's own drawer |
| Initial focus | none |

### Confirm (Delete / Cancel order / Void sale)

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer (alertdialog), stacked above everything |
| Shape (mobile) | Phone: full-screen panel. Tablet: min(480px, 100vw − 56px) |
| Trigger | Red row actions and drawer buttons |
| Size | 480px |
| Dismiss | backdrop, Esc, ×, "Keep it" |
| Header | "Delete this medicine?" / "Delete this supplier?" / "Delete this manufacturer?" / "Delete this MR?" (body "It disappears from lists and pickers. You can undo from the toast right after.", reasons "Created by mistake" · "Duplicate" · "No longer needed" · "Other") · "Cancel order this purchase order?" (body "The order stops here. Stock and supplier dues are not changed.", reasons "Ordered by mistake" · "Supplier can’t deliver" · "Price changed" · "Other") · "Void sale this sale?" (body "The sale is voided and its invoice is cancelled. Stock goes back.", reasons "Billed by mistake" · "Wrong items" · "Customer changed mind" · "Other"); the record as a grey pill under the title — the row's name cell from a row action ("Glycolac Cream", "K R Medical Agency", "Dharti Galani") or the drawer summary from a drawer button ("₹4,236", "2 medicines · ₹563") |
| Footer | "Keep it" · red "Delete" / "Cancel order" / "Void sale" (disabled until a reason; "Pick a reason to continue"; "Other" needs a note "Tell the team why (required)") |
| Multi-step | no |
| Initial focus | none |

### Create menu and More tabs

| Field | Value |
| --- | --- |
| Shape (desktop) | dropdown popover under the trigger (Create min 220px; More min 200px), flips up when there is no room |
| Shape (mobile) | Phone: bottom sheet (full width, max height 72%, radius 16px top, 40% dim backdrop, 260ms) |
| Trigger | ⌄ "Create something else" beside the split button; "More ⌄" in the tab track |
| Size | rows 38px with a 24px tinted icon tile; group headings "Selling" · "Stock" · "Buying" (Create) and "Selling" · "Stock" · "Buying" · "Money" (More) |
| Dismiss | outside click, Esc, pick |
| Header | none |
| Footer | none |
| Multi-step | no |
| Initial focus | the list panel; the active row starts on the first option; closing returns focus to the trigger |

Create menu lists every create action except the current one: "New sale" (receipt, Selling) · "New medicine" (pill, Stock) · "New purchase order" (package, Buying) · "New supplier" (users) · "New MR" (users) · "New manufacturer" (package). Split primary per tab: Sales "New sale" · Medicines "New medicine" · Purchases "New purchase order" · Suppliers "New supplier" · Manufacturers "New manufacturer" · MRs "New MR" · Payments "New sale".

### Prescriptions to fill

| Field | Value |
| --- | --- |
| Shape (desktop) | dropdown popover under the view action, min 340px |
| Shape (mobile) | Phone: bottom sheet (max height 72%, radius 16px top) |
| Trigger | "Prescriptions to fill" on Sales (Status All), shown while unfilled prescriptions exist |
| Size | rows: pill icon · patient name · sub "Rx #500 · 17 Sep 2026 · Flubolt 400, Clonix-B Lotion, Densyl-AD Shampoo" |
| Dismiss | outside click, Esc, pick |
| Header | none |
| Footer | none |
| Multi-step | no |
| Initial focus | the list panel |

Picking opens New sale prefilled (customer, medicines matched by name, remark "From Rx #500"); unmatched names toast "Flubolt 400 not in the medicine list · add from the quick line".

### Browse (item quick line)

| Field | Value |
| --- | --- |
| Shape (desktop) | floating popover anchored to the quick-line row, same width, below (or above when under 320px fits) |
| Shape (mobile) | Phone: the same anchored popover (not a sheet). Tablet: as desktop |
| Trigger | "Browse" beside the quick line (New sale, purchase order) |
| Size | row width × 220–440px; tiles auto-fill minmax(180px, 1fr), gap 6px; tile padding 7px 8px 7px 10px, radius 8px, name 12.5px one line, sub 11px + meta, or a 24px [− n +] stepper once added (green border + tint) |
| Dismiss | transparent backdrop, Esc, "Done", × |
| Header | group chips 24px ("All" · "Often billed" / "Low stock" · catalogue groups) + × |
| Footer | "Tap a tile to add" / "2 added" (+ "· Showing 60 of 80 · type to narrow") · "Done"; inline "New medicine name" input + plus to add an unknown name |
| Multi-step | no |
| Initial focus | none |

### Filters

| Field | Value |
| --- | --- |
| Shape (desktop) | popover under "Filters", right-aligned, flips when there is no room |
| Shape (mobile) | Phone: bottom sheet (max height 82%, radius 16px top, 260ms) |
| Trigger | "Filters" |
| Size | 340px wide, max height 100vh − 160px |
| Dismiss | outside click (pending choices are dropped), "Apply filter"; Esc is not wired |
| Header | "Filters" + "Clear all" |
| Footer | "Save as view" / "Saved as view" · "Apply filter" |
| Multi-step | no |
| Initial focus | none |

## Multi-step flow

- Steps (ordered): New sale — Patient & team → Medicines → Payment. Medicine — "Medicine, price & stock" → "Batches & supplier prices". Supplier — Supplier → Distributes (→ Account when editing). Manufacturer — Manufacturer → Connections. MR — MR → Represents. Log MR visit — Visit → Details → Notes. Purchase order — Order → Items. Return from patient — "What is coming back" → "Reason & refund".
- **Sequence varies by input?** yes. Purchase order by stage: Ordered → editable drawer ("Edit purchase order", "Cancel order") plus row "Receive goods" (single "Tick what arrived" section); Received → read-only "Purchase order" view with "Pay ₹X" (row action Pay goes to Payments); Paid → read-only view with "Print"; edits after Ordered are impossible. Sales are never edited: row click → read-only Sale; Unpaid → "Collect ₹X" + "Void sale" (only without returns); Paid → "Return medicines". Supplier: the Account step and the 840 width appear only when editing. Medicines: the expiry actions appear only when the nearest batch expires within 90 days. New sale: opened from a prescription it arrives prefilled with "From Rx #500" and skips the Rx preset. Same sequences on phone, tablet and desktop.
- Progress indicator: accordion step cards, 22px numbered circle (current = blush ink, done = green ✓, missing = red "!"); collapsed steps show peek values ("MEDICINE · 1 ADDED", dashed "Empty", red "Missing: Reason")
- Navigation: "Next: <step> →" at the end of each open step; step headers reopen ("Edit" / "Open")
- Per-step validation: does not block "Next"; Save jumps to the first step with a missing required field
- Edit mode: prefilled, same steps, any step can be opened; view drawers have no steps

## Preview / animated panels

| Field | Value |
| --- | --- |
| Surfaces | n/a — Medical has no preview or animated panel (the sale print is a print-only sheet, under Data display) |
| Switching | n/a — no preview surfaces |
| Surface per input type | n/a — no preview surfaces |
| Frame sequence | n/a — nothing animates in frames |
| Frame durations | n/a — nothing animates in frames |
| Progressive reveal | n/a — no staged reveal |
| Static fallback | n/a — no animated surface to fall back from |

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Tab Sales, Create "New sale" | receipt | 14 | no |
| Tab Medicines, empty state, Create "New medicine", Prescriptions to fill | pill | 14 / 18 | no |
| Tabs Purchases, Manufacturers; "New purchase order", "New manufacturer", "Reorder low stock" | package | 14 | no |
| Tabs Suppliers, MRs; "New supplier", "New MR" | users | 14 | no |
| Tab Payments, "Collect ₹X", "Pay ₹X", "Pay all received" | wallet | 14 / 13 | yes on row actions |
| New split, empty-state button | plus | 16 / 14 | no |
| Split ⌄, More, dropdown chevrons | chevron-down | 14 | yes |
| Search / Filters / Columns | search / list-filter / eye | 15 / 15 / 16 | eye yes |
| Row Edit / Delete, Cancel order, Void sale | pencil / trash | 13 | yes |
| Row Receive goods, Log visit | square-check | 13 | yes |
| Row View | eye | 13 | yes |
| Row Return medicines, Return expiring stock | refresh-cw | 13 | yes |
| Row near-expiry discount, "Sell all at 20% off" | tag | 13 / 14 | yes |
| Row Print | printer | 13 | yes |
| "Send payment reminders" | message-square | 14 | no |
| Sort | arrow-up-down / arrow-up / arrow-down | 12 | yes |
| Bulk Message | WhatsApp glyph (key `wa`, brand glyph, not Lucide) | 14 | yes |
| Bulk Export / Print / clear | file / printer / x | 14 | yes |
| Quick line / Browse | search / layout-grid | 15 | no |
| Quick fill | "⚡" text glyph | 12px text | no |

Library: Lucide · Weight: 1.6px stroke (registry icons); 2px for chevrons, x, check and sort glyphs

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Drawer panel (every drawer, stacked ones too) | transform translate3d(100%, 0, 0) → 0 | 340ms | cubic-bezier(.32,.72,0,1) |
| Drawer backdrop | background-color rgb(9 9 11 / 0) → / .45 | 340ms | cubic-bezier(.32,.72,0,1) |
| Dropdowns, Filters, Browse | opacity 0 → 1, translateY(−4px) scale(.985) → none (opening upward: +4px) | 160ms | cubic-bezier(.2,.8,.2,1) |
| Phone bottom sheets | translateY(28px), opacity 0 → none | 260ms | cubic-bezier(.32,.72,0,1) |
| Search field | flex-basis / min / max width 36px ↔ 200px | 220ms | cubic-bezier(.2,.8,.2,1) |
| Tabs | background, color | 150ms | ease |
| Split ⌄ chevron | rotate 0 → 180deg | 150ms | ease |
| Stock levels bar (medicine drawer) | left, width of zones and marker | 200ms | ease |
| GST segment, Browse tiles, row hover | background (and border on tiles) | 120ms | ease |
| Bulk bar | translateY(100%) → 0 | 220ms | cubic-bezier(.32,.72,0,1) |
| Tooltip (desktop / tablet) | opacity, translateY(2px) → 0 after 160ms hover | 120ms | ease |
| Loading shimmer | background-position | 1100ms loop | ease |

Reduced-motion: every animation and transition runs 1ms with no delay and one iteration (the shimmer stops), no smooth scroll.

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Sales | Rows' text, pills and avatars turn into shimmer bars (z150, 1.1s) for 160–380ms on tab / search / filter change (page 260–560ms; 10% of loads add 280–600ms) | 96px dashed ring, blush tile, 40px white box with pill 18px · "Nothing in the medicine store" · "Nothing here yet. Try another tab or search." With filters: search icon · "No matches" · "Nothing matches these filters. Clear them to see everything again." · "+ Clear filters" | toast "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" (9s; rows stay) |
| Medicines | as Sales | "No medicine matches" · "Nothing here yet. Try another tab or search." | as Sales |
| Purchases | as Sales | "Nothing in the medicine store" · "Nothing here yet. Try another tab or search." | as Sales |
| Suppliers | as Sales | "No supplier matches" · same hint | as Sales |
| Manufacturers | as Sales | "No manufacturer matches" · same hint | as Sales |
| MRs | as Sales | "No MR matches" · same hint | as Sales |
| Payments | as Sales | "No Medical payments yet" · same hint | as Sales |
| Drawers | On open, text and inputs shimmer 200–440ms; Save "Saving…" 320–740ms | n/a — forms always render their fields; empty item tables peek "MEDICINE · NONE YET" | footer "Not saved · your changes are kept", "Retry save", toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" (9s) |
| Pickers | n/a — every Medical picker reads a local list and opens filled | "Nothing to pick yet"; with a query "No results for “zz”" + "Check the spelling or try fewer letters" | n/a — local data |
| Prescriptions to fill | n/a — local list | the button is hidden when every prescription is filled | n/a — local data |

Success: toasts (5.2s; "Undo" on deletes, cancels, voids and discounts) bottom-centre 16px (phone: 76px + safe area above the bottom).

## Copy

| Key | Exact string |
| --- | --- |
| title | "Medical" |
| tabs | "Sales", "Medicines", "Purchases", "Suppliers", "Manufacturers", "MRs", "Payments", "More" |
| tab groups | "Selling", "Stock", "Buying", "Money" |
| search | placeholder "Search name, composition, supplier…", aria "Search medical", tooltip "Search · press /" |
| create | "New sale", "New medicine", "New purchase order", "New supplier", "New manufacturer", "New MR", "Create something else", "Create" |
| view actions | "Reorder low stock", "Sell all at 20% off", "Remove near-expiry discount", "Prescriptions to fill", "Send payment reminders", "Pay all received · ₹2,980" |
| sales heads | "Sale", "Customer", "Medicines", "Bill", "Margin", "Status", "When" |
| medicine heads | "ID", "Medicine", "Manufacturer", "Stock", "Nearest expiry", "MRP", "Best rate", "Margin" |
| purchase heads | "PO", "Supplier", "Items", "Date", "Total", "Stage" |
| supplier heads | "Supplier", "Manufacturers", "Orders", "Payable", "Ageing" |
| manufacturer heads | "Manufacturer", "Medicines", "Suppliers", "MRs" |
| MR heads | "MR", "Represents", "Last visit", "Next visit", "Samples" |
| pills | "Paid", "Unpaid", "Returned", "Ordered", "Received", "No stock", "OK", "Low", "Out" |
| row text | "Medical contact", "Batches: ASC002, CSH26044", "Needs MRP and composition", "−20% near expiry", "2 items · 1 free", "Add phone", "No orders", "None yet" |
| row actions | "Collect ₹563", "Return medicines", "Print", "Void sale", "Return expiring stock to supplier", "Sell at 20% off (near expiry)", "Remove near-expiry discount", "Receive goods", "Cancel order", "View", "Pay ₹827", "New purchase order", "Log visit" |
| end lines | "All sales loaded", "All medicines loaded", "All purchase orders loaded", "All suppliers loaded", "All manufacturers loaded", "All MRs loaded", "All Medical payments loaded" |
| filters | "Stock", "Low stock", "Nearest expiry", "Any", "Within 30 days", "Within 60 days", "Within 90 days", "Status", "Unpaid", "Returned", "Stage", "Created" |
| medicine drawer | "Medicine, price & stock", "Batches & supplier prices", "Sold with", "Prescription only", "Over the counter", "used for substitutes", "incl. GST", "Before GST", "Best buy rate", "Add a supplier price", "Stock levels", "Reorder at", "Fill up to", "Healthy", "Reorder", "Overstocked", "Reorder alert when stock falls to 2.", "Order 10 to fill up to 10. Shows under Stock › Low stock.", "Add batch", "Add supplier price", "Enter this supplier’s rate" |
| other drawers | "Agency you buy from", "Agency name", "GST number", "Distributes", "pick any", "Account", "Payable", "Nothing due", "No orders yet", "Medical representative", "Represents", "one MR can represent many", "The brand on the pack · links suppliers and MRs", "Connections", "who distributes it", "who represents it", "None yet · add them from Stock", "Log MR visit", "Samples given", "e.g. 4 tubes Azelan", "2 weeks", "1 month", "Order → receive → pay", "Invoice no.", "Order date", "Type medicine, qty, free, rate · e.g. azel 20 +2 @180", "20 = qty · +2 = free · @180 = rate", "Enter the purchase rate", "Receive goods", "Tick what arrived", "Add unexpected item", "Mark received", "Purchase order", "Close", "a sale is changed by a return, not edited", "Return from patient", "Return everything", "What is coming back", "Reason & refund", "Refund by", "Return expiring stock", "Return to supplier", "Credit note", "Return & take credit" |
| validation | "Add a name", "Enter the MRP", "Enter a rate for every supplier price", "Pick a supplier", "Enter the rate for Epriva Tab", "Enter what is being returned", "Pick a customer", "Add at least one item" |
| toasts | "Added Azelan 20% Cream", "Supplier saved", "MR saved", "Manufacturer saved · connections updated", "Purchase order saved", "Goods received · stock and free quantity added", "PO #431 paid", "Printing PO #428", "₹563 received", "₹550 refunded · stock added back", "3 returned · ₹369 credit from Akshar Medicines", "Visit logged · reminder set for 12 Oct", "20% off on expiring medicines", "WhatsApp reminders sent for unpaid sales", "₹2,980 paid to suppliers", "Glycolac Cream deleted", "PO #430 cancelled", "Sale #978 voided", "Manufacturer ACME added", "Supplier Om Pharma added · add phone and GST later", "Azel cream added · set MRP later in Stock" |
