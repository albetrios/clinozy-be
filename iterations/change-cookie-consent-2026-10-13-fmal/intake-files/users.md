# Screen: Users

- Route: /users (tab Team) · /users/roles (tab Roles & access) · /users/branches (tab Branches); drawers /users/create, /users/:userId/edit, /users/branches/create, /users/branches/:branchId/edit — proposed, the prototype switches screen state without URLs
- Purpose: Run the team: who works here (Team), what each role can see and do (Roles & access, applied instantly), and the clinic's branches.
- Entry points: header pinned tab "Users" (when pinned) · "All sections" compass list · ⌘K "Go to" → "Users" (after typing) · phone: tab bar (when pinned) or "More" → All sections sheet
- Exit points: User drawer · Branch drawer · Delete confirm · "Preview as <role>" (runs the whole app as that role, usually leaving this screen)
- Access: section permission "Users" — View to see the screen (default preset: Admin only); Create / Edit / Delete gate "New user" / "New branch", row Edit and Delete; editing Roles & access additionally needs the special permission "Change roles & access" (without it the page is read-only); the Admin role is always full and can't be narrowed
- Layout shell: app shell
- Breakpoints: desktop ≥ 1100px (1440 reference) · tablet 760–1099px (820 and 1024 references) · mobile < 760px (390 reference)

Section tone: slate. Built-in roles (each with its colour): Admin (lav) · Doctor (sky) · Therapist (butter) · Front desk (mint) · Counsellor (sage) · Pharmacist (blush) · Accountant (peach); "New role" adds custom roles.

## Regions (top to bottom)

| Region | Contains | Desktop | Mobile | Notes |
| --- | --- | --- | --- | --- |
| Toolbar | h1 "Users" · view tabs "Team" / "Roles & access" / "Branches" · Team only: search, columns button (eye) · Team and Branches: "Filters" · "New user" / "New role" / "New branch" | one row, padding 16px 20px (12px 12px compact: < 1440px wide or < 800px tall); h1 20px/600 with a hairline right; tabs 28px with 14px icons; search collapsed to a 36px icon until clicked or "/" pressed, then 200px (150–220px); Filters, eye, New right-aligned | Phone: h1 hidden; Team: row 1 = search always open (40px, "/" kbd hidden) + "Filters"; row 2 = tabs as a sideways-scrolling strip; Branches: row 1 = "Filters", row 2 = tabs; Roles & access: tabs only; eye hidden; "New user" / "New role" / "New branch" becomes a 52px pill FAB fixed 16px from the right and 74px above the bottom. Tablet: one row, h1 18px, tabs a scrolling strip (min 120px) | The prototype also draws an empty 8 × 8px bordered tab container after the tabs on Team (an unused role-tab slot — roles live in Filters); it carries nothing |
| Team / Branches table | the list for the open tab | white card, 1px border, 12px radius, shadow 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px −8px rgb(0 0 0 / .06), fills the remaining height, margin 0 20px 20px (0 12px 12px compact); 40px sticky header; 44px footer | Phone: full-bleed (no radius, side borders or shadow, margin 0); header row, footer and checkboxes hidden; rows reflow (see Data display). Tablet: as desktop; columns that don't fit fold into the row's meta line, footer "N columns in rows · Show all" | Roles & access has no table — see the next row |
| Roles & access panel | role list (left) · role page (right) | one card (1px border, 12px radius, shadow 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px −8px rgb(0 0 0 / .06)) split into minmax(220px, 264px) and the rest; the list is grey (#fafafa) with 8px padding, the page scrolls on its own | Phone: one pane at a time — the role list first; tapping a role replaces it with that role's page, which starts with a 40px "Back to roles" button; never two columns. Tablet: two panes (264px list) | changes apply the moment a box or switch is clicked — there is no Save |
| Bulk bar | "N selected" · "Select all N" · Team: "Message" · "Export" · "Print"; Branches: "Export" · "Print" · "Esc" · × | dark 44px bar in the table footer while rows are selected | Phone: never (no checkboxes). Tablet: as desktop | slides up 220ms |
| View-as bar | eye · role dot · "Previewing as Doctor" · sections the role can see · "Exit preview" | app-wide while previewing: dark 44px pill, centred, 72px above the bottom edge, max width 100vw − 32px | Phone: same pill, full width minus 16px each side; it sits over the 52px FAB (both ~72–74px from the bottom) — the FAB is covered. Tablet: as desktop | shown on every screen until "Exit preview" |
| Drawers | User drawer · Branch drawer · Delete confirm | right side drawers | Phone: User and Branch drawers are full-screen sheets; Delete confirm stays a right drawer 100vw − 56px wide | see Popups |

## Data display

### Team

Primitive: table

| Field | Value |
| --- | --- |
| Columns (ordered) | checkbox · ID (grey pill "#12") · User (32px avatar in the person's colour with initials, name 13px/500, grey sub-line "+91 98250 44120") · Email (#3f3f46) · Roles (pills in each role's colour; tooltip "Main role" on the first, "Also" on the rest) · Branches (branch chips in branch colours; empty when only one branch is open) · Working hours ("Mon–Sat · 09:30–19:30", "Every day · 00:00–23:59", or days listed "Mon, Wed, Fri · …") · Commission (right-aligned "10%", or "—") · Status ("Active" sage with dot / "Inactive" grey with dot) · Updated ("Today · 09:02", "Dec 09, 2025 · 10:38", grey) · row actions |
| Column widths | 24px · 56px · minmax(200px, 1.4fr) · minmax(170px, 1.1fr) · minmax(150px, 1fr) · minmax(130px, .9fr) · minmax(170px, 1fr) · 96px · 100px · 150px · actions 107px; Email, Working hours, Commission and Updated hidden by default (eye title "Columns · 4 of 8 shown") |
| Sortable | ID, User, Email, Roles (by main role), Commission, Status, Updated — click cycles ascending → descending → off; Branches and Working hours not sortable; default order = seed order, newest ID first |
| Row height | 10px top and bottom padding (≈ 53px); 20px sides (16px compact); 3px left edge in the person's colour |
| Row click | opens Edit user |
| Row actions | Edit (pen-line) · separator · Delete (trash; fill oklch(0.955 0.03 25), border oklch(0.88 0.06 25), icon oklch(0.5 0.19 25); hover fill oklch(0.92 0.05 25)) → Delete confirm; your own row (#12, "Riya Shah") has no Delete |
| Selection | hover checkbox, tri-state header, shift-click range, Esc clears; bulk "Message" (toast "WhatsApp drafted for 3 people"), "Export" ("3 rows exported as CSV"), "Print" ("Preparing 3 rows for print") |
| Mobile behaviour | Phone: rows, not cards — full-bleed blocks split by 1px hairlines with the 3px colour edge, padding 12px 14px 12px 11px. Line 1: avatar + name + phone (left) and the Roles pills (right-aligned, at most 46% wide). Meta line under the name (11.5px, 42px indent): the first 4 non-empty of Branches · Status · ID, each item = 6px colour dot (badge values) + grey label + value in #3f3f46/500, items 12px apart with no separator — e.g. "Branches Adajan, Vesu" then "#12"; "Active" is dropped, "Status Inactive" shows. Actions on their own right-aligned line (40 × 36px). Tablet 820: keeps User · Roles · Branches, folds ID and Status into the user's meta line ("2 columns in rows · Show all" ↔ "Fit to width"); tablet 1024: all five default columns fit, nothing folds; row action buttons 36px |
| Pagination | one scroller; virtualised above 60 rows (10-row overscan); end line "All users loaded" |

### Roles & access — role list

Primitive: list

| Field | Value |
| --- | --- |
| Grid | one column of role buttons, 2px apart, inside the 220–264px left pane under the label "Roles" (11px uppercase) |
| Anatomy | button (padding 8px 10px, 8px radius): 10px square dot (3px radius) in the role colour · role name 13px/600 · one-line purpose 11.5px grey (ellipsis) · up to 3 overlapping 22px member avatars (−6px overlap, 2px light border) · "+2" (11px) for the rest; selected = white fill, #d4d4d8 border, shadow 0 1px 2px rgb(0 0 0 / .06) |
| Meta line | the purpose text: "Runs the clinic — prices, team, branches and every screen." · "Consults, prescribes and plans each patient’s treatment." · "Runs sessions and aftercare calls." · "First face of the clinic — leads, bookings, check-in and billing." · "Turns enquiries into plans and packages." · "Runs the medicine counter and its stock." · "Checks money in and out and closes the days."; custom roles "Custom role" |
| Truncation | purpose one line with ellipsis; members beyond 3 become "+N" |
| Actions | click selects the role (default selection on arrival: Front desk) |
| Mobile | Phone: the list fills the screen; tapping a role opens its page full-width and hides the list; "Back to roles" returns. "New role" adds the role to the bottom of the list and selects it but stays on the list. Tablet: as desktop |

### Roles & access — role page

Primitive: table (the access matrix) plus cards (special permissions)

| Field | Value |
| --- | --- |
| Columns (ordered) | head row: 40px tile (12px radius, role colour) with a shield · role name 17px/600 (custom roles: an editable 30px name box, 16px/600, ≤ 24 characters) · purpose 12.5px · "Copy access from" + chevron-down (36px outline; only when editable) · "Preview as Front desk" (36px dark, eye icon; disabled at 50% opacity for Admin). Then "People with this role": 28px pills (22px avatar + name, grey "+ Admin" when they hold other roles; click opens their user drawer). Then "What it can see and do": matrix columns Section · View · Create · Edit · Delete · Row. Then "Special permissions": switch cards. Then a grey 12px note |
| Column widths | matrix grid minmax(200px, 1fr) · 64px · 64px · 64px · 64px · 72px, min width 560px; head row 36px (10.5px uppercase); special permissions grid repeat(auto-fill, minmax(260px, 1fr)), 8px gap |
| Sortable | no — fixed section order Leads · Appointments · Patients · Medical · Clinic stock · Payments · Tasks · Offerings · Users (Today is not in the matrix) |
| Row height | min 48px, padding 6px 12px; section cell = 26px tile (6px radius, section colour) with its icon + name 13px/600 + one-line description 11.5px; a section without View drops to 60% opacity |
| Row click | none; each 22px checkbox (6px radius, 1.5px border) toggles; on = filled with the section's colour, white "✓"; turning View off clears Create, Edit and Delete; turning any other on also turns View on. "Row" pill (24px): "Full" (section colour) when all four are on, "None" without View, otherwise "Some" — clicking it sets all four on, or all off when already Full |
| Row actions | none per row — the row pill is the row action |
| Selection | n/a — checkboxes are the data, not a selection |
| Mobile behaviour | Phone: the page stacks in one column; the head row wraps (back 40px · tile 40px · name and purpose; the two buttons on the next line); the matrix keeps its 560px width and scrolls sideways inside its bordered box; special permissions become one column. Tablet: as desktop (special permissions one column at 820, two at 1024) |
| Pagination | none — 9 rows |

Special permissions (switch cards: 32 × 18px track in the role colour when on, 14px knob, label 13px/600, description 11.5px): "Bill below the offer price" — "Discount past the offer price, never below the lowest price" · "See the lowest price" — "Shows the hidden floor price on offerings and invoices" · "Change prices & offers" — "Edit list / offer prices and create offers" · "Close the day" — "Count cash and lock the day in Payments" · "Reverse settled payments" — "Undo money after its day is closed" · "Give refunds & credit notes" — "Return money to a patient or issue a credit note" · "Void sales & delete invoices" — "Cancel a Medical sale or delete an unpaid invoice" · "See every branch" — "Switch the header to other branches and All branches" · "Read clinical notes" — "Open complaints, diagnosis, prescriptions and photos" · "Export lists" — "Download any table" · "Change roles & access" — "Edit roles, access and branches". In the prototype only "See the lowest price" (Offerings Lowest price control) and "Change roles & access" (this page) change behaviour; the rest are stored switches.

Default presets — access: Admin everything; Doctor View · Create · Edit on Leads, Appointments, Patients, Tasks; Front desk and Counsellor View · Create · Edit on Leads, Appointments, Patients, Payments, Tasks; Pharmacist View · Create · Edit on Medical, Clinic stock, Patients; Accountant View only on Payments, Medical, Clinic stock; Therapist View only on Appointments, Patients, Tasks; only Admin can Delete. Special permissions: Doctor — Bill below the offer price, Read clinical notes, Export lists, See every branch; Therapist — Read clinical notes; Front desk — Close the day, Give refunds & credit notes; Counsellor — Bill below the offer price, Read clinical notes; Pharmacist — Export lists, Void sales & delete invoices; Accountant — Close the day, Reverse settled payments, Export lists, See the lowest price, Give refunds & credit notes, See every branch; Admin — all, locked.

Duties ("Answer leads & WhatsApp", "Book & confirm visits", … "Manage team & branches") exist in the prototype's data per role but are not shown anywhere — there is no Responsibilities section.

Notes under the page: Admin — "Admins can do everything · this role can’t be narrowed."; viewer without "Change roles & access" — "You can see roles here. Changing them needs “Change roles & access”."; otherwise — "Changes apply right away to everyone with this role. Someone with two roles gets everything either role allows." Locked boxes and switches show a not-allowed cursor and toast "Admins always have full access" (Admin) or "You can’t change roles · ask an admin".

### Branches

Primitive: table

| Field | Value |
| --- | --- |
| Columns (ordered) | checkbox · Branch (chip in the branch colour + grey "Main" pill on the main branch) · Address (line 1, #18181b; sub-line "Near Star Bazaar, Adajan Gam Road, Adajan, Surat 395009") · Contact ("+91 74900 20099" or "—"; sub-line email) · Opening hours ("Mon–Sat · 10:00–20:00") · Team (up to 4 active members as 28px avatar pills, the first with its short name "Riya S.", then "+5") · Default people ("Doctor · Dr. Nisha Mavani"; sub-line "Desk · Riya Shah · Therapist · Ridhi Sohaliya"; "Not set" in grey when none) · Status ("Open" sage / "Closed" grey) · row actions |
| Column widths | 24px · minmax(130px, .8fr) · minmax(220px, 1.5fr) · minmax(170px, 1fr) · minmax(170px, 1fr) · minmax(130px, .8fr) · minmax(190px, 1.1fr) · 90px · actions 107px; no columns button (all shown) |
| Sortable | none — seed order (main branch first) |
| Row height | as Team (two-line Address and Contact cells); 3px left edge in the branch colour |
| Row click | opens Edit branch |
| Row actions | Edit (pen-line) · Delete (trash) — no Delete on the main branch; Delete asks twice in the prototype (see gaps) |
| Selection | as Team; bulk "Export" · "Print" |
| Mobile behaviour | Phone: rows, not cards. Line 1: the branch chip (+ "Main") on the left; on the right, at most 46% wide and right-aligned, the address line 1 and its sub-line, followed by the meta line Contact · Opening hours · Status · Default people (one per line in that narrow block, each truncated); actions on their own right-aligned line. Tablet 820: keeps Branch · Address · Contact, folds Opening hours · Default people · Status into the address cell ("4 columns in rows · Show all"); tablet 1024: keeps Branch · Address · Contact · Opening hours, folds Default people · Status ("3 columns in rows · Show all"); the Team avatars have no text and drop out of the fold |
| Pagination | one scroller; end line "All branches loaded" |

One open branch: when only one branch is open (Status "Open · shown in pickers"), the header branch picker disappears, the Team and Offerings "Branches" cells stay empty (headers remain), the User drawer loses its Branches field (saving puts the user on that branch), Offerings loses "Available at" and offers lose "Branches", and the Filters "Branches" section disappears. The Branches tab itself stays and still lists closed branches as "Closed".

## Forms

### User drawer (New user / Edit user)

Grid: 6 columns, gap 16px × 12px (12px × 10px compact and phone); half = 3, third = 2. Phone: the grid keeps 6 columns — at 390 a half field is 159px; hints truncate with an ellipsis.

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | name | text, half | Name | "Full name, e.g. Dr. Nisha Mavani" | none | yes (red " *") | ≤ 60 characters; first letter capitalised; the whole text is the name (no first/last split in the form) |
| 2 | phone | tel, half, "+91" prefix box | Mobile | "98765 43210" | "10 digits" | no | digits only, shown "98250 44120" (≤ 11 characters with the space), stored with +91 |
| 3 | email | text, half | Email | "name@clinic.com" | none | yes | ≤ 254 characters, not capitalised; no format check |
| 4 | password | password, half | "Password" (new) / "New password" (edit) | "At least 8 characters" (new) / "••••••••" (edit) | none (new) / "leave empty to keep" (edit) | no | ≤ 64 characters; no length check in the prototype; peeks as "••••••••" |
| 5 | tone | 8 colour swatches (30px), full | Colour | none (swatches) | "used on their badges" | no (default sky) | lav · sky · butter · blush · sage · mint · peach · plum; the picked swatch shows the person's initials ("✓" until a name is typed) |
| 6 | roles | chips, multi, full | Roles | none (chip group) | "pick one or more · access adds up" | yes (default Front desk) | every role in its colour, square-check on picked; the first picked is the main role; none → toast "Pick at least one role" |
| 7 | access | read-only info box (38px, grey), full | Gets access to | none (read-only) | none | no (read-only) | live: sections any picked role can View, e.g. "Leads · Appointments · Patients · Payments · Tasks"; "Pick a role" when none |
| 8 | branches | chips, multi, full — only when more than one branch is open | Branches | none (chip group) | "where they work" | no (default: the header's branch) | open branches in their colours |
| 9 | days | chips, full | Days | none (chip group) | "Appointments only offer these days" | no (default Mon–Sat) | "Mon" · "Tue" · "Wed" · "Thu" · "Fri" · "Sat" · "Sun", each toggles |
| 10 | from | time dropdown, half | From | "Pick a time" | none | no (default 10:00) | 06:00–23:30 every 30 minutes, 60px tiles in a 220px-high grid |
| 11 | to | time dropdown, half | To | "Pick a time" | none | no (default 19:00) | same list; no check that To is after From |
| 12 | commission | stepper, third, "% of billed" suffix, quick chips "0%" · "5%" · "10%" · "15%" | Commission / incentive | "0" | none | no (default 0) | digits only |
| 13 | active | toggle, 4 of 6 columns | Status | none (toggle) | none | no (default on) | "Active · can sign in" / "Inactive · signed out" |

- Error display: red " *"; Save with an empty Name or Email opens step 1 (a closed step shows a red "!" and "Missing: Name, Email"); toasts "Add name and email" and "Pick at least one role" after "Saving…".
- Submit: "Create user" (new) / "Save changes" (edit), footer far right, never disabled; new only and not on phone: "Create & add another".
- Loading: "Saving…" for 320–740ms.
- Success: drawer closes; toast "Dr. Reenal Chaniyara saved" / "<name> added" (the typed name, e.g. "Dr. Nisha Mavani added"); new users appear at the top.
- Dirty-state guard: none — Cancel, ×, backdrop and Esc close immediately.
- Read-only: a role without Edit sees no Save and the summary "View only · your role can’t change this".

### Branch drawer (New branch / Edit branch)

| Order | Field | Type | Label | Placeholder | Help | Required | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | name | text, half (alone on its row) | Name | "e.g. Vesu" | none | yes | ≤ 60 characters; toast "Name the branch"; same name as another (any case) → toast "A branch called Vesu already exists" |
| 2 | tone | 9 colour swatches, full | Colour | none (swatches) | "marks this branch everywhere" | no (new: next of mint · lav · blush · peach · plum by branch count) | sage · sky · butter · lav · blush · mint · peach · plum · lime |
| 3 | main | toggle, half | Main branch | none (toggle) | none | no (default off) | "Main · head office" / "Not the main branch"; saving one as main clears it on the others; if none is left main, the first branch becomes main |
| 4 | open | toggle, half | Status | none (toggle) | none | no (default on) | "Open · shown in pickers" / "Closed · hidden everywhere" |
| 5 | line1 | text, full | Address line 1 | "Shop / floor, building" | none | yes | ≤ 200 characters; toast "Add the address" |
| 6 | line2 | text, full | Address line 2 | "Street, landmark" | none | no | ≤ 200 characters |
| 7 | area | text, half | Area | "e.g. Vesu" | none | no | ≤ 200 characters |
| 8 | city | text, half | City | "City" | none | no (default "Surat") | ≤ 200 characters |
| 9 | pin | text, third | PIN code | "6 digits" | none | no | digits only, ≤ 6 |
| 10 | state | text, 4 of 6 columns | State | "State" | none | no (default "Gujarat") | ≤ 120 characters |
| 11 | phone | tel, third, "+91" prefix | Phone | "98765 43210" | "10 digits" | no | digits only |
| 12 | email | text, 4 of 6 columns | Email | "branch@clinic.com" | none | no | ≤ 254 characters |
| 13 | gstin | text, half | GSTIN | "15 characters" | none | no | upper-cased, ≤ 15 characters |
| 14 | days | chips, multi, full | Days | none (chip group) | none | no (default Mon–Sat) | "Mon" … "Sun" with square-check on picked |
| 15 | opens | time dropdown, half | Opens | "Pick a time" | none | no (default 10:00) | 06:00–23:30 every 30 minutes |
| 16 | closes | time dropdown, half | Closes | "Pick a time" | none | no (default 19:00) | same list |
| 17 | team | dropdown, multi, people, half | Team | "Pick team" | "who works here" | no (new: you) | active users with avatar, name ("Riya Shah (you)" first) and roles ("Front desk + Admin"); saving adds or removes this branch on each person |
| 18 | defDoctor | dropdown, half | Default doctor | none (shows "Nobody") | "preselected in forms here" / "add a doctor to the team first" | no (default "Nobody") | "Nobody" + team members with the Doctor role |
| 19 | defDesk | dropdown, half | Default front desk | none (shows "Nobody") | "preselected in forms here" / "add a front desk to the team first" | no | "Nobody" + team members who are Front desk or Counsellor |
| 20 | defTherapist | dropdown, half | Default therapist | none (shows "Nobody") | "preselected in forms here" / "add a therapist to the team first" | no | "Nobody" + Therapists on the team |
| 21 | defPharmacist | dropdown, half — a single "Nobody" chip across the full width while the team has no pharmacist | Default pharmacist | none (shows "Nobody") | "preselected in forms here" / "add a pharmacist to the team first" | no | "Nobody" + Pharmacists on the team |

- Error display: red " *"; Save with an empty Name or Address line 1 opens step 1 ("Missing: Name, Address line 1"); other rules are toasts.
- Submit: "Add branch" (new) / "Save branch" (edit), footer far right; no "Create & add another".
- Loading: "Saving…" for 320–740ms.
- Success: toast "Vesu branch added" / "Vesu saved"; a renamed branch is renamed on every user and in the header selection.
- Dirty-state guard: none — Cancel, × and the backdrop close at once (Esc does not close this drawer).

## Popups

### User drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer from the right, full height, backdrop rgb(9 9 11 / .45) |
| Shape (mobile) | Phone: full-screen sheet (100% width, no shadow); header 60px; × is a 44px transparent button in the top-right corner (8px inset); footer buttons 44px and stretched, the summary drops under them centred at 12px; "Create & add another" removed. Tablet: as desktop, 680px |
| Trigger | "New user" (toolbar or phone FAB) · Team row click · row Edit · a member pill on a role page |
| Size | min(680px, 100vw − 56px); header 76px (padding 14px 24px; 12px 20px compact; 10px 16px phone); body 20px 24px 28px (16px 20px 20px compact; 14px 16px 20px phone) |
| Dismiss | backdrop · × (36px white tile, 12px radius, 14px left of the drawer edge, 14px from the top) · "Cancel" · Esc |
| Header | "New user" / "Edit user" + grey pill "#11" (edit) · sub-line "Sign-in, roles, branches and working hours"; pill strip: role pills in role colours · hours "Mon–Sat · 10:00–19:00" (grey) · "Active" (sage) / "Inactive"; new only: "Quick fill" (11px uppercase) + dashed 24px pills "⚡ Doctor · 10:00–19:00" (sky) · "⚡ Therapist · 10:00–19:00" (butter) · "⚡ Front desk · 09:30–19:30" (mint) · "⚡ Pharmacist · 09:00–21:00" (blush) |
| Footer | summary 12.5px grey "New user · Front desk · Adajan" / "Dr. Reenal Chaniyara · Doctor · Adajan" (name · roles joined " + " · branches, branches only with more than one open branch) · "Delete" (36px, fill oklch(0.53 0.2 25), white text; edit only, not on your own user) · "Cancel" · "Create & add another" (new, not phone) · "Not saved · your changes are kept" (after a failure) · "Create user" / "Save changes" / "Saving…" / "Retry save" |
| Multi-step | yes — 2 step cards |
| Initial focus | none — nothing is auto-focused |

Quick fill pills set roles, days, hours and commission (not the colour): Doctor → Mon–Sat 10:00–19:00, 10% · Therapist → Mon–Sat 10:00–19:00, 5% · Front desk → Mon–Sat 09:30–19:30, 0% · Pharmacist → every day 09:00–21:00, 0%.

### Branch drawer

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer from the right, full height |
| Shape (mobile) | Phone: full-screen sheet, as the User drawer. Tablet: as desktop, 680px |
| Trigger | "New branch" (toolbar or phone FAB) · Branches row click · row Edit |
| Size | min(680px, 100vw − 56px) |
| Dismiss | backdrop · × · "Cancel" — Esc does not close it |
| Header | "New branch" / "Edit branch" + grey pill with the branch name (edit) · sub-line "Address, hours and the people who work here"; pill strip: branch name (or "New branch") in its colour · "Main branch" (grey, when main); no Quick fill |
| Footer | summary "New branch · Surat · 1 people" / "Vesu · Surat · 6 people" (name · city · team count, verbatim "people" even for 1) · "Delete" (edit, not on the main branch) · "Cancel" · "Add branch" / "Save branch" |
| Multi-step | yes — 3 step cards |
| Initial focus | none |

### Filters popover

| Field | Value |
| --- | --- |
| Shape (desktop) | popover under "Filters", right-aligned to it, flips up when there is no room |
| Shape (mobile) | Phone: bottom sheet — full width, top corners 16px, max-height 82%, slides up 260ms, transparent backdrop. Tablet: as desktop |
| Trigger | "Filters" (Team and Branches tabs) |
| Size | 340px wide (max 100vw − 40px), max-height 100vh − 160px |
| Dismiss | click outside · "Apply filter" applies and closes |
| Header | "Filters" · "Clear all" |
| Footer | "Save as view" / "Saved as view" (when a filter is set) · "Apply filter" |
| Multi-step | no |
| Initial focus | none |

Team sections: "Roles" (single choice: "All" · "Admin" · "Doctor" · "Therapist" · "Front desk" · "Counsellor" · "Pharmacist" · "Accountant", in role colours) · "Branches" (only with more than one open branch) · "Status" ("Active" · "Inactive") · "Created" ("Any" · "Today" · "Yesterday" · "Last 7 days" · "Last 30 days" · "This month" · "Custom range"). Branches tab: "Created" only (its other columns don't have 2–10 repeated values). Applied filters grey the button, add a count badge and a joined "×" ("Clear all filters").

### Columns menu (Team)

| Field | Value |
| --- | --- |
| Shape (desktop) | dropdown under the eye button, aligned to its right edge |
| Shape (mobile) | Phone: not available — the eye button is hidden. Tablet: as desktop |
| Trigger | eye button (36px; dark badge "4" = hidden columns) |
| Size | min 260px |
| Dismiss | click outside · Esc |
| Header | none — 8 columns, no search |
| Footer | "4 of 8 shown" |
| Multi-step | no |
| Initial focus | the list panel, first option highlighted (↑ ↓ move, ↵ picks) |

Rows: "Show all columns" (sub "Recommended set hides 4"; when all shown, "Tap again for the recommended set") · one checkbox row each for User, Email, Roles, Branches, Working hours, Commission, Status, Updated.

### Copy access from

| Field | Value |
| --- | --- |
| Shape (desktop) | dropdown under the "Copy access from" button |
| Shape (mobile) | Phone: bottom sheet (full width, max-height 72%, top corners 16px, dim backdrop rgb(9 9 11 / .4)). Tablet: as desktop |
| Trigger | "Copy access from" (with chevron-down) on an editable role page |
| Size | min 240px wide, 36px option rows |
| Dismiss | pick · click outside · Esc |
| Header | none — 6 options, no search |
| Footer | none |
| Multi-step | no |
| Initial focus | the list panel, first option highlighted (↑ ↓ move, ↵ picks) |

Options: every other role with its colour dot and purpose as the sub-line. Picking copies that role's access and special permissions onto this one (copying Admin gives everything) and toasts "Front desk now has the same access as Counsellor".

### Delete confirm

| Field | Value |
| --- | --- |
| Shape (desktop) | side drawer from the right (role alertdialog) above the other drawers, backdrop rgb(9 9 11 / .32) |
| Shape (mobile) | Phone: stays a right drawer 100vw − 56px wide (334px at 390), 36px buttons. Tablet: as desktop |
| Trigger | row "Delete" (Team, Branches) · drawer footer "Delete" |
| Size | min(480px, 100vw − 56px) |
| Dismiss | "Keep it" · × · backdrop |
| Header | "Delete this user?" / "Delete this branch?" · grey record pill (Team row: the person's name; drawer: the footer summary; Branches row: first the address line, then a second confirm with the branch name) · "It disappears from lists and pickers. You can undo from the toast right after." |
| Footer | hint "Pick a reason to continue" (then "Add a short note for “Other”" while Other has no note) · "Keep it" · "Delete" (grey and not-allowed until a reason is picked, then fill oklch(0.53 0.2 25)) |
| Multi-step | no |
| Initial focus | none |

Reasons "Created by mistake" · "Duplicate" · "No longer needed" · "Other" (note "Add a note (optional)" / "Tell the team why (required)"). After: toast "Dr. Reenal Chaniyara removed" / "Vesu removed" + "Undo".

### View-as bar

| Field | Value |
| --- | --- |
| Shape (desktop) | floating status pill, bottom-centre (role status), above page content and below drawers |
| Shape (mobile) | Phone: same pill, 16px side margins (358px at 390), 72px above the bottom — over the tab-bar FAB. Tablet: as desktop |
| Trigger | "Preview as <role>" on a role page (not for Admin) |
| Size | 44px high, padding 0 6px 0 14px, max width 100vw − 32px, radius 999px, #18181b fill, shadow 0 12px 32px −8px rgb(0 0 0 / .35) |
| Dismiss | "Exit preview" only (toast "Back to your own access") |
| Header | eye icon (#d4d4d8) · 8px dot in the role colour with a 2px light ring · "Previewing as Doctor" 13px/600 · the sections it can see 12px #a1a1aa with ellipsis ("Leads · Appointments · Patients · Tasks"; Clinic stock is listed as "Stock", e.g. Pharmacist "Patients · Medical · Stock"; "No sections" when none) |
| Footer | "Exit preview" — 32px white pill button, 12.5px/600 |
| Multi-step | no |
| Initial focus | none |

While previewing, the whole app uses that role's access: header tabs, All sections and search list only sections with View; every "New …" button disappears without Create; row Edit / Pause go and existing-record drawers open read-only without Edit; every Delete goes without Delete; if the current section can't be viewed the app jumps to the first one it can (Users → Leads for Doctor). Starting a preview closes any open user, offering, offer or branch drawer and toasts "Previewing Clinozy as Doctor".

## Multi-step flow

### User drawer

- Steps (ordered): "1 Profile, roles & branches" (cards PROFILE and ROLES & BRANCHES) · "2 Working hours & pay" (cards WORKING HOURS and PAY).
- **Sequence varies by input?** no — always these 2 steps for every role, new or edit, on every viewport. Inside step 1 the Branches field exists only with more than one open branch; the password label, placeholder and hint switch between new and edit.
- Progress indicator: bordered card per section (12px radius, 14px 16px padding); the step's first card has a 24px circle with the step number (open = slate ink fill, white number; earlier = green oklch(0.52 0.12 150); later = #e4e4e7), title 13.5px/600, one-line summary ("Front desk · Leads · Appointments · Patients · Payments · Tasks · Adajan") and "Open" / "Edit" on the right; a closed step with an empty required field shows a red "!" and "Missing: Name, Email" plus a peek grid of its fields (uppercase 10.5px labels, values, dashed "Empty").
- Navigation: "Next: Working hours & pay →" at the end of step 1; headers and peeks open any step; one open at a time.
- Per-step validation: no — Save jumps to the first step with a gap.
- Edit mode: prefilled, same 2 steps, no Quick fill; opens on step 1 (or the step last open for that same user).

### Branch drawer

- Steps (ordered): "1 Branch & address" (BRANCH + ADDRESS) · "2 Contact & opening hours" (CONTACT + OPENING HOURS) · "3 People".
- **Sequence varies by input?** no — always 3 steps. In step 3 each default-person field lists only team members holding that role; its hint switches to "add a doctor to the team first" when there are none.
- Progress indicator: as the User drawer.
- Navigation: "Next: Contact & opening hours →", "Next: People →".
- Per-step validation: no; Save jumps to step 1 while Name or Address line 1 is empty.
- Edit mode: prefilled, same 3 steps.

### Roles & access (phone)

- Steps (ordered): role list → role page.
- **Sequence varies by input?** yes, by viewport — phone shows one pane at a time (list, then page with "Back to roles"); tablet and desktop show both panes side by side, no back button.
- Progress indicator: none.
- Navigation: tap a role → page; "Back to roles" (40px) → list; "New role" keeps the list.
- Per-step validation: n/a — nothing to submit; every change applies at once.
- Edit mode: n/a — the page is always live-edited.

## Preview / animated panels

| Field | Value |
| --- | --- |
| Surfaces | 2 live read-outs: "Gets access to" in the User drawer · the View-as bar while previewing |
| Switching | automatic — "Gets access to" recomputes on every role chip click; the bar appears on "Preview as <role>" and goes on "Exit preview" |
| Surface per input type | Gets access to: sections where any picked role has View, joined " · " ("Pick a role" when none; any Admin pick → all 9). View-as bar: role name + the sections that role can view, or "No sections" |
| Frame sequence | View-as bar: one entrance — opacity 0 → 1 and translateY 4px → 0 with scale .985 → 1; "Gets access to" swaps text in place |
| Frame durations | 160ms cubic-bezier(.2,.8,.2,1) for the bar; 0ms for the text swap |
| Progressive reveal | none — both show their full content at once |
| Static fallback | the same text without motion (reduced motion) |

## Icons

| Element | Icon name | Size | Semantic? |
| --- | --- | --- | --- |
| Tab "Team" | users | 14 | no |
| Tab "Roles & access" · role tile · section · empty state | shield | 14 / 18 / 14 / 18 | no |
| Tab "Branches" | map-pin | 14 | no |
| Search | search | 15 | no |
| Filters | list-filter | 15 | no |
| Columns | eye | 16 | yes (aria-label "Show or hide columns") |
| New user / New role / New branch | plus | 16 | no |
| Row Edit / Delete | pen-line / trash | 13 | yes (aria-labels "Edit", "Delete") |
| Sort | arrow-up-down / arrow-up / arrow-down | 12 | no |
| Bulk "Message" | wa — WhatsApp brand glyph, not Lucide | 14 | no |
| Bulk "Export" / "Print" | file / printer | 14 | no |
| Preview as · View-as bar | eye | 14 | no |
| Back to roles | chevron-left | 16 | yes (aria-label "Back to roles") |
| Copy access from · dropdown chevrons | chevron-down | 14 | no |
| Matrix sections | user-plus (Leads) · calendar (Appointments) · users (Patients) · pill (Medical) · package (Clinic stock) · wallet (Payments) · square-check (Tasks) · tag (Offerings) · shield (Users) | 14 | no |
| Picked multi chip | square-check | 12 | no |
| Bulk tick · clear selection | check / x | 12 / 14 | no / yes ("Clear selection") |
| Empty state with filters | search | 18 | no |
| Fold control | maximize-2 / minimize | 14 | no |

Library: Lucide · Weight: 1.6px stroke (sort arrows, chevron-down, check, x: 2px). Matrix ticks are a "✓" text glyph; Quick fill uses the "⚡" character; the drawer close is a "×" character.

## Motion

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Drawer panel | transform translateX 100% → 0 | 340ms | cubic-bezier(.32,.72,0,1) |
| Drawer backdrop | background-color transparent → rgb(9 9 11 / .45) | 340ms | cubic-bezier(.32,.72,0,1) |
| Step card body | opacity 0 → 1, translateY −4px → 0 | 240ms | cubic-bezier(.2,.8,.2,1) |
| Filters · dropdowns · columns menu | opacity, translateY −4px → 0, scale .985 → 1 | 160ms | cubic-bezier(.2,.8,.2,1) |
| View-as bar | opacity, translateY 4px → 0, scale .985 → 1 | 160ms | cubic-bezier(.2,.8,.2,1) |
| Phone bottom sheets | translateY 28px → 0, opacity | 260ms | cubic-bezier(.32,.72,0,1) |
| Toolbar search | width 36px → 200px | 220ms | cubic-bezier(.2,.8,.2,1) |
| Bulk bar | translateY 100% → 0 | 220ms | cubic-bezier(.32,.72,0,1) |
| Special-permission switch | track colour, knob translateX 0 → 14px | 150ms | ease |
| Tabs, role buttons, rows, checkboxes | background, colour, opacity | 120–150ms | ease |
| Skeleton bars | background-position shimmer, infinite | 1100ms | ease |

Reduced-motion: every animation and transition runs 1ms with no delay and a single iteration (the shimmer stops), and smooth scrolling is off.

## States

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Team table | in-place skeleton: row text, avatars and inputs turn into #efeff1 bars shimmering 1.1s, icons hidden, header and toolbar stay — 260–560ms on entering Users, 160–380ms (sometimes +280–600ms) after a search, sort, tab or filter change | 96px art (dashed ring, lav disc, 40px white tile with a lav shield) · "No user matches" · "Nothing here yet. Try another tab or search."; with filters: search icon · "No matches" · "Nothing matches these filters. Clear them to see everything again." + "Clear filters" | toast "Couldn’t load this list · connection dropped. Showing the last copy." + "Retry" (9s; rows stay; ~5% of fetches) |
| Branches table | as Team | "No branches yet" · "Nothing here yet. Try another tab or search." (filtered: as Team) | as Team |
| Roles & access | page skeleton on entering Users (text in both panes becomes bars, 260–560ms); switching roles or tabs is instant | a role nobody holds: "Nobody has this role yet · give it to someone from their user drawer."; a new custom role starts with every section "None" and no special permissions | n/a — changes apply locally the moment they are clicked; there is no save call that can fail |
| User drawer | drawer skeleton 200–440ms on open; "Saving…" 320–740ms | new: Front desk, sky, Mon–Sat 10:00–19:00, the header's branch, 0%, Active; blank fields peek as dashed "Empty" | footer "Not saved · your changes are kept", button "Retry save", toast "Couldn’t save · connection dropped. Everything you entered is still here." + "Retry" (9s; ~10% of saves) |
| Branch drawer | as the User drawer | new: next colour, not main, Open, Surat, Gujarat, Mon–Sat 10:00–19:00, team = you, defaults "Nobody" | as the User drawer |
| Filters popover | none — opens instantly | only "Created" when no column qualifies | n/a — built from rows already loaded |
| Dropdowns (Team, defaults, Copy access from) and time grids | open instantly; typing in the Team or a Default … picker waits 250ms, then shows skeleton rows (bars at 62 / 48 / 70 / 40% width) and a spinner in the search for 160–380ms; Copy access from and the time grids are static | "Nothing to pick yet" / "No results for “xyz”" + "Check the spelling or try fewer letters" | n/a — local lists |
| View-as bar | none — appears at once | "No sections" when the role can view nothing | n/a — local |

Success: toasts (5.2s) "<name> added" · "Dr. Reenal Chaniyara saved" · "Dr. Reenal Chaniyara removed" + "Undo" · "Vesu branch added" · "Vesu saved" · "Vesu removed" + "Undo" · "Role added · name it and pick what it can do" · "Front desk now has the same access as Counsellor" · "Previewing Clinozy as Doctor" · "Back to your own access" · "WhatsApp drafted for 3 people" · "3 rows exported as CSV" · "Preparing 3 rows for print". Blocked: "You can’t add roles · ask an admin" · "You can’t change roles · ask an admin" · "Admins always have full access". Toasts sit bottom-centre 16px up; phone 76px up, max width 100% − 24px.

## Copy

| Key | Exact string |
| --- | --- |
| title | "Users" |
| tabs | "Team" · "Roles & access" · "Branches" |
| search placeholder | "Name, email, mobile or #ID" |
| search label | "Search users" |
| search tooltip | "Search · press /" |
| filters | "Filters" · "Clear all filters" |
| columns | "Show or hide columns" · "Columns · 4 of 8 shown" |
| new buttons | "New user" · "New role" · "New branch" |
| team heads | "ID" · "User" · "Email" · "Roles" · "Branches" · "Working hours" · "Commission" · "Status" · "Updated" |
| role pill tooltips | "Main role" · "Also" |
| status | "Active" · "Inactive" |
| commission empty | "—" |
| working hours | "Mon–Sat · 10:00–19:00" · "Every day · 00:00–23:59" |
| branch heads | "Branch" · "Address" · "Contact" · "Opening hours" · "Team" · "Default people" · "Status" |
| branch cells | "Main" · "Not set" · "Doctor · Dr. Nisha Mavani" · "Desk · Riya Shah · Therapist · Ridhi Sohaliya" · "Open" · "Closed" · "+5" |
| end lines | "All users loaded" · "All branches loaded" |
| empty | "No user matches" · "No branches yet" · "Nothing here yet. Try another tab or search." |
| empty filtered | "No matches" · "Nothing matches these filters. Clear them to see everything again." · "Clear filters" |
| fold control | "2 columns in rows · Show all" · "Fit to width" |
| bulk | "3 selected" · "Select all 10" · "Message" · "Export" · "Print" · "Esc" · "Clear selection · Esc" |
| filter sections | "Roles" · "All" · "Branches" · "Status" · "Created" · "Apply filter" · "Clear all" · "Save as view" · "Saved as view" |
| columns menu | "Show all columns" · "Recommended set hides 4" · "Tap again for the recommended set" · "4 of 8 shown" |
| roles label | "Roles" |
| role purposes | "Runs the clinic — prices, team, branches and every screen." · "Consults, prescribes and plans each patient’s treatment." · "Runs sessions and aftercare calls." · "First face of the clinic — leads, bookings, check-in and billing." · "Turns enquiries into plans and packages." · "Runs the medicine counter and its stock." · "Checks money in and out and closes the days." |
| custom role | "New role" · "New role 2" · "Custom role" · "Custom role · set what it can do below" |
| role name box (aria) | "Role name" |
| role page buttons | "Copy access from" · "Preview as Front desk" (tooltip "See Clinozy the way this role sees it") · "Back to roles" |
| role sections | "People with this role" · "What it can see and do" · "Special permissions" |
| member pill | "Riya Shah" + "+ Admin" (tooltip "Open Riya Shah") |
| no members | "Nobody has this role yet · give it to someone from their user drawer." |
| matrix head | "Section" · "View" · "Create" · "Edit" · "Delete" · "Row" |
| matrix row pill | "Full" · "Some" · "None" (tooltip "Turn the whole row on or off") |
| matrix checkbox (aria) | "Front desk can view · Leads" |
| matrix sections | "Leads" — "Enquiries and their conversations, until they become patients" · "Appointments" — "Bookings by doctor, room and machine" · "Patients" — "Registered patients, with prescriptions, sessions and photos" · "Medical" — "The medicine store: medicines for sale, suppliers, MRs, purchases, sales" · "Clinic stock" — "Clinic consumables and equipment used in procedures · not for sale" · "Payments" — "Collections, invoices and dues" · "Tasks" — "Follow-ups, feedback calls, reminders, with an owner and due time" · "Offerings" — "What the clinic sells: offerings, packages, offers and prices" · "Users" — "Team, roles & access, branches" |
| special permissions | "Bill below the offer price" · "See the lowest price" · "Change prices & offers" · "Close the day" · "Reverse settled payments" · "Give refunds & credit notes" · "Void sales & delete invoices" · "See every branch" · "Read clinical notes" · "Export lists" · "Change roles & access" (descriptions verbatim under Data display) |
| role notes | "Admins can do everything · this role can’t be narrowed." · "You can see roles here. Changing them needs “Change roles & access”." · "Changes apply right away to everyone with this role. Someone with two roles gets everything either role allows." |
| user drawer title | "New user" · "Edit user" |
| user drawer sub | "Sign-in, roles, branches and working hours" |
| user steps | "Profile, roles & branches" · "Working hours & pay" |
| user sections | "Profile" · "Roles & branches" · "Working hours" · "Pay" |
| user labels | "Name" · "Mobile" · "Email" · "Password" · "New password" · "Colour" · "Roles" · "Gets access to" · "Branches" · "Days" · "From" · "To" · "Commission / incentive" · "Status" |
| user hints | "10 digits" · "leave empty to keep" · "used on their badges" · "pick one or more · access adds up" · "where they work" · "Appointments only offer these days" |
| user placeholders | "Full name, e.g. Dr. Nisha Mavani" · "98765 43210" · "name@clinic.com" · "At least 8 characters" · "••••••••" · "Pick a time" · "0" |
| user extras | "+91" · "% of billed" · "0%" · "5%" · "10%" · "15%" · "Pick a role" |
| user toggle | "Active · can sign in" / "Inactive · signed out" |
| quick fill | "Quick fill" · "⚡ Doctor · 10:00–19:00" · "⚡ Therapist · 10:00–19:00" · "⚡ Front desk · 09:30–19:30" · "⚡ Pharmacist · 09:00–21:00" |
| user footer | "New user · Front desk · Adajan" · "Cancel" · "Create & add another" · "Create user" · "Save changes" · "Delete" |
| user validation | "Add name and email" · "Pick at least one role" |
| branch drawer title | "New branch" · "Edit branch" |
| branch drawer sub | "Address, hours and the people who work here" |
| branch steps | "Branch & address" · "Contact & opening hours" · "People" |
| branch sections | "Branch" · "Address" · "Contact" · "Opening hours" · "People" |
| branch labels | "Name" · "Colour" · "Main branch" · "Status" · "Address line 1" · "Address line 2" · "Area" · "City" · "PIN code" · "State" · "Phone" · "Email" · "GSTIN" · "Days" · "Opens" · "Closes" · "Team" · "Default doctor" · "Default front desk" · "Default therapist" · "Default pharmacist" |
| branch hints | "marks this branch everywhere" · "10 digits" · "who works here" · "preselected in forms here" · "add a doctor to the team first" · "add a front desk to the team first" · "add a therapist to the team first" · "add a pharmacist to the team first" |
| branch placeholders | "e.g. Vesu" · "Shop / floor, building" · "Street, landmark" · "City" · "6 digits" · "State" · "98765 43210" · "branch@clinic.com" · "15 characters" · "Pick team" |
| branch toggles | "Main · head office" / "Not the main branch" · "Open · shown in pickers" / "Closed · hidden everywhere" |
| branch options | "Nobody" · "Riya Shah (you)" · "Front desk + Admin" |
| branch badges | "New branch" · "Main branch" |
| branch footer | "New branch · Surat · 1 people" · "Cancel" · "Add branch" · "Save branch" · "Delete" |
| branch validation | "Name the branch" · "Add the address" · "A branch called Vesu already exists" |
| step bits | "Next: Working hours & pay" + "→" · "Open" · "Edit" · "Missing: Name, Email" · "Empty" |
| save states | "Saving…" · "Retry save" · "Not saved · your changes are kept" · "Couldn’t save · connection dropped. Everything you entered is still here." · "Retry" |
| read-only summary | "View only · your role can’t change this" |
| load error | "Couldn’t load this list · connection dropped. Showing the last copy." |
| delete | "Delete this user?" · "Delete this branch?" · "It disappears from lists and pickers. You can undo from the toast right after." · "Reason" · "Created by mistake" · "Duplicate" · "No longer needed" · "Other" · "Add a note (optional)" · "Tell the team why (required)" · "Pick a reason to continue" · "Add a short note for “Other”" · "Keep it" · "Delete" |
| view-as bar | "Previewing as Doctor" · "Leads · Appointments · Patients · Tasks" · "No sections" · "Exit preview" |
| toasts | "<name> added" · "Dr. Reenal Chaniyara saved" · "Dr. Reenal Chaniyara removed" · "Undo" · "Vesu branch added" · "Vesu saved" · "Vesu removed" · "Role added · name it and pick what it can do" · "Front desk now has the same access as Counsellor" · "Previewing Clinozy as Doctor" · "Back to your own access" · "You can’t add roles · ask an admin" · "You can’t change roles · ask an admin" · "Admins always have full access" · "WhatsApp drafted for 3 people" · "WhatsApp drafted for 1 person" · "3 rows exported as CSV" · "1 row exported as CSV" · "Preparing 3 rows for print" |
