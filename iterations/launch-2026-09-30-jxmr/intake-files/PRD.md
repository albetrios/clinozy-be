# Clinozy — PRD for Prototype

# PART A — App / Software PRD

---

## 1. Product Summary ⭐

Clinozy is a clinic management app for skin, hair and aesthetic clinics in India (one or more branches). The front desk, doctors, therapists, the pharmacist and the accountant all work in one place: enquiries become appointments, appointments become patients, and visits turn into prescriptions, treatments, invoices and payments. It replaces the mix of WhatsApp, paper registers and spreadsheets clinics use today, so nothing (a follow-up, a due payment, a low-stock medicine) gets lost.

---

## 2. Users & Roles

| Role | Description | Key abilities |
|------|-------------|---------------|
| Front desk | Reception staff running the day | Leads, bookings, check-in, collect payments, tasks |
| Doctor | Consults and prescribes | Patient file, clinical notes, Rx, offering plan, feedback |
| Therapist | Performs procedures | Treatments, visit photos, clinic stock usage |
| Counsellor | Explains plans and packages | Offering suggestions, packages, invoices |
| Pharmacist | Runs the in-house medical store | Medical sales, medicines, purchases, suppliers |
| Accountant | Money in / out | Payments ledger, pending credits, day close |
| Marketing | Brings enquiries in | Leads, sources, reviews |
| Owner / Admin | Runs the clinic | Everything, plus Users, roles & access, branches |

Each role only sees the sections it is allowed to view (set in Users › Roles & access). On Today, each role's own stages are highlighted.

---

## 3. Screens & Flows ⭐

Desktop / tablet web app. One header for every screen: logo · "All sections" compass menu · pinned section tabs (default Appointments, Leads, Patients, Payments) · search (⌘K) · utilities · branch picker. Every form, detail and confirm opens as a **right drawer** (never a centred modal). Every section has its own colour.

### 3.1 Screen list

#### Screen: Splash
- **Purpose:** Branded load before the app (~3.7 s).
- **Who sees it:** Everyone, on open.
- **Contents:** Mark draws in, wordmark fades up, greeting, thin progress bar, 3-step ticker. Offline version says the app can't reach the clinic and offers Retry.
- **Actions:** None — fades into Today.

#### Screen: Today (butter)
- **Purpose:** The clinic floor right now.
- **Who sees it:** All roles.
- **Contents:** Stage columns Enquiry · Booked · Waiting · With doctor · Treatment · Checkout · Pharmacy · Done. One card per visit: person chip, time, service, doctor, plan flag ("✓ Plan ready" / "○ Plan pending").
- **Actions:** Card click opens the appointment form drawer. "New ⌄" split button creates an appointment, walk-in, lead, payment.

#### Screen: Leads (lavender)
- **Purpose:** Enquiries and their conversations until they become patients.
- **Who sees it:** Front desk, Marketing, Counsellor, Owner.
- **Contents:** Table — person, source, interested in, status (progress steps), assigned & involved, follow-up date, last message. Filters (status, source, assigned, Created, Follow-up date).
- **Actions:** Row click opens the lead drawer (steps on the left, chat column on the right). "New lead" opens the New lead drawer. Closing a lead uses "Close as" chips. Booking from a lead opens the appointment form prefilled.

#### Screen: Appointments (sky)
- **Purpose:** Bookings by doctor, room and machine.
- **Who sees it:** Front desk, Doctor, Therapist, Counsellor, Owner.
- **Contents:** Day / Week calendar by doctor, room or machine, and a List view. Each booking shows patient, service, status colour.
- **Actions:** Click an empty slot → New appointment (date & time prefilled). Click a booking → appointment form: Visit status strip (Scheduled → Confirmed → Checked in → Completed), Copy, Cancel visit (with reason), Photos from this visit (after check-in), Offering suggestions, "Not a patient yet · Create patient record" for leads. Moving the time before check-in marks it Rescheduled.

#### Screen: Patients (sage)
- **Purpose:** Registered patients.
- **Who sees it:** All clinical roles, Front desk, Owner.
- **Contents:** Table — patient (avatar + ID), mobile, last visit, doctor, dues, follow-up.
- **Actions:** Row click opens the Patient file. "New patient" opens the drawer (name, mobile, gender, DOB, address, type, consent, first photos, notes).

#### Screen: Patient file (sage, tabs in their section colours)
- **Purpose:** Everything about one patient.
- **Who sees it:** Clinical roles, Front desk, Counsellor, Accountant (billing).
- **Contents:** Left rail (identity, contact, details, Up next). Tabs from a folder popover grouped Clinical / Care / Billing / Team: Clinical notes (Complaints · Diagnosis · Treatment suggestions · Future suggestions, then Offering suggestions and Feedback cards), Prescriptions, Treatments, Images, Packages, Invoices, Payments, Team.
- **Actions:** Every "New …" keeps the patient selected. Rx row: Print, Preview, "Sell medicines". Invoice row: Print, Preview. Rail: Book, Collect. Log feedback ⌄ opens check-in / review drawers.

#### Screen: Medical (blush)
- **Purpose:** The in-house medicine store.
- **Who sees it:** Pharmacist, Accountant, Owner.
- **Contents:** Tabs Sales · Medicines · Purchases · Suppliers · Manufacturers · MRs · Payments (extra tabs fold into "More ⌄"). Stock with batches and nearest expiry.
- **Actions:** "New sale" (same invoice drawer, type Medical), "Prescriptions to fill" dd, new PO (Ordered → Received → Paid), add supplier / manufacturer / MR, Print sale. Sales are never edited — only viewed, collected, returned or voided.

#### Screen: Clinic stock (mint)
- **Purpose:** Consumables used in procedures (not sold).
- **Who sees it:** Therapist, Front desk, Owner.
- **Contents:** Tabs Items · Movements · Purchases · Vendors. Stock shown as "2.5 tube · 75 g".
- **Actions:** Row "Use" popover (stepper, unit toggle, quick chips, Used-for), "Stock check" drawer (counted vs system), Revert a movement, new purchase.

#### Screen: Payments (peach)
- **Purpose:** One ledger of money in and out.
- **Who sees it:** Accountant, Front desk, Owner.
- **Contents:** Tabs Payments · Pending. Columns When · What (Received / Paid) · From / to · Mode · Amount. All ids PAY-####.
- **Actions:** **Receive** (money in) and **Pay** (money out; pick a supplier bill or "Other spend"). Pending: "Add pending" (Give / Take), Give back · Got it back · Use on next bill. "Day close" opens the day summary drawer; after close, rows lock. Refunds issue a credit note (CN-###).

#### Screen: Tasks (plum)
- **Purpose:** Every human follow-up with an owner and due time.
- **Who sees it:** All roles (own tasks), Owner (all).
- **Contents:** Tasks from rules — lead follow-ups, appointment reminders, aftercare calls, negative-feedback call-backs, payment dues.
- **Actions:** Outcome buttons per task (e.g. Log check-in · Doing well · No answer = snooze 3 h), reassign, new task.

#### Screen: Offerings (lime)
- **Purpose:** What the clinic sells.
- **Who sees it:** Counsellor, Owner.
- **Contents:** Offerings, packages, offers with category, sessions, list price, minimum price.
- **Actions:** New offering / package / offer; row click edits.

#### Screen: Users (slate)
- **Purpose:** Team, roles & access, branches.
- **Who sees it:** Owner, Admin.
- **Contents:** Tabs Team · Roles & access · Branches.
- **Actions:** "New user" (Profile → Access → Hours), edit role permissions per section, "New branch".

### 3.2 Key flows

**Flow 1: Enquiry becomes a patient**
1. Front desk opens Leads → "New lead" → name, mobile, source chip, interested in → Save.
2. Lead drawer → chat on WhatsApp → "Book appointment" → appointment form opens prefilled → pick doctor, Today chip, time → Save.
3. On the day, Today shows the visit in Booked → open it → status Checked in. The lead moves to "Clinic visited" automatically.
4. The "Not a patient yet" card → Create patient record → the visit can now be Completed.

**Flow 2: Visit → prescription → sale → payment**
1. Doctor opens the patient from Today → Patient file › Prescriptions → "New prescription".
2. Quick line: types `adapalene 0-0-1 face 4w` ↵ → row added with dose, where, qty. Save & sell.
3. Medical sale drawer opens prefilled; stock is deducted by earliest expiry.
4. Front desk → Receive → ₹ amount, mode UPI → Save. Ledger shows PAY-1042 Received.

**Flow 3: Treatment plan and feedback**
1. In the appointment form, Offering suggestions → "Add offering" → Hydrafacial ×3 package, price → status Planned.
2. Counsellor creates the invoice; the plan row turns "✓ Invoiced".
3. Next day an Aftercare call task appears → outcome "Log check-in" → feel Worse, 3/10 → card shows "Action needed" and a doctor call-back task is created.

---

## 4. Data ⭐

### 4.1 Objects & fields

- **Lead:** id, name, mobile, source, interested in, status, assigned & involved, follow-up date, messages, created.
- **Patient:** id (P-####), name, mobile (+91…), gender, DOB, address, type, consent, doctor, branch, since, follow-up.
- **Appointment:** id, patient/lead, type, service, doctor, room/machine, date, time, length, reason, notes, status (Scheduled / Confirmed / Checked in / Completed / Cancelled), cancel reason.
- **Prescription:** id, patient, doctor, date, rows (medicine, dose M-A-N, SOS, meal, where, qty, note), lab report, today's procedure, advice, follow-up.
- **Treatment:** id, patient, offering, therapist, date, notes, aftercare call.
- **Image:** id, patient, album (General / Private / LHR), visit, date, file.
- **Offering:** id, name, category, sessions, list price, min price, type (offering / package / offer).
- **Plan row:** patient, offering, qty, price, status (Planned / Accepted / Next time / Declined / Invoiced), by, from.
- **Invoice / Sale:** id (INV- / S-), patient, type (Clinic / Medical), lines (item, qty, rate, disc %, GST %), total, paid, status.
- **Payment:** id (PAY-####), direction (Received / Paid), party, mode, amount, links (invoice / PO / credit note), date.
- **Credit:** id, party, way (Give / Take), amount, state.
- **Medicine:** id, name, composition, manufacturer, MRP, stock by batch + expiry.
- **Purchase order:** id, supplier, lines, bill no, stage (Ordered / Received / Paid), paid.
- **Supplier / Manufacturer / MR / Clinic vendor:** name, phone, connections.
- **Clinic item:** name, category, unit, size + measure, stock, movements (signed delta).
- **Check-in / Review:** patient, appointment/treatment, feel, score 1–10, followed, text / rating, source, action taken.
- **Task:** kind, who, why, due, owner, outcomes, state.
- **User:** name, mobile, email, roles, branches, hours, colour, active.
- **Branch:** name, address, hours, people, colour.

### 4.2 Sample data

| Patient | ID | Mobile | Last visit | Doctor | Due |
|---------|----|--------|-----------|--------|-----|
| Priya Shah | P-1042 | +91 98250 44120 | Today · Hydrafacial | Dr. Nisha Mavani | ₹0 |
| Ankit Desai | P-0987 | +91 99090 21877 | 24 Sep · PRP (2 of 6) | Dr. Reenal Patel | ₹4,500 |
| Hetal Joshi | P-1110 | +91 97277 63014 | 18 Sep · Chemical peel | Dr. Nisha Mavani | ₹0 |
| Rohan Mehta | P-0751 | +91 98980 11536 | 02 Sep · LHR full face | Dr. Reenal Patel | ₹1,200 |

| Appointment | Time | Service | Doctor | Status |
|-------------|------|---------|--------|--------|
| Priya Shah | 11:30 | Hydrafacial | Dr. Nisha | Checked in |
| Kavya Trivedi (lead) | 12:15 | Consultation | Dr. Reenal | Confirmed |
| Ankit Desai | 15:00 | PRP session 3 | Dr. Reenal | Scheduled |

| Offering | Category | Sessions | List | Min |
|----------|----------|----------|------|-----|
| Hydrafacial | Facial | 1 | ₹3,500 | ₹3,000 |
| PRP hair package | Hair | 6 | ₹24,000 | ₹21,000 |
| Glycolic peel | Peel | 1 | ₹2,200 | ₹1,800 |
| LHR full face | Laser | 6 | ₹15,000 | ₹13,500 |

---

## 5. Feature Priorities

**Must-have (working in prototype):**
- [x] Header with pinned section tabs, All sections, branch picker, ⌘K
- [x] Today floor stages
- [x] Leads list + lead drawer with chat and progress
- [x] Appointments calendar + appointment form with status strip, reschedule, cancel, copy
- [x] Patients list + Patient file with all tabs
- [x] Prescription with quick line, one-click dose/meal, print (A4)
- [x] One invoice drawer for clinic and medical sales, print (A4)
- [x] Medical store: stock, sales, POs, suppliers, manufacturers, MRs
- [x] Clinic stock: use, stock check, revert
- [x] Payments ledger: Receive / Pay, pending credits, day close, credit notes
- [x] Offering suggestions plan + Feedback (check-ins, reviews, action needed)
- [x] Tasks from rules with outcomes
- [x] Users, roles & access, branches
- [x] Dropdown engine (search, recent, create-from-picker), filters, tables with fold-to-fit, bulk select
- [x] Draft/save model with failed-save retry, delete with reason + Undo
- [x] Dark mode, reduced motion, offline splash, failed-load states

**Nice-to-have (visual only is OK):**
- [ ] WhatsApp sending (chat is simulated)
- [ ] Real reminders going out on save
- [ ] "Verify your email" banner
- [ ] Final route URLs (currently one page switching sections)

**Explicitly out of scope:**
- [ ] Phone layout (desktop / tablet only for now)
- [ ] Patient-facing app or booking page
- [ ] Real backend, auth, integrations

---

## 6. Visual Direction

- **Design system / brand guide:** Clinozy's own — shadcn-style zinc neutrals, deep pastel section colours with dark ink (AA contrast), Lucide icons. Rules in `clinozy-fe/CLAUDE.md`, tokens in `clinozy-fe/iterations/launch-2026-09-30-jxmr/intake-files/preset.md`.
- **Products whose look you like:** shadcn/ui, Linear, Notion-style calm tables.
- **Adjectives:** calm, clean, fast, colour-coded, dense but readable, light theme with dark mode.
- **Logo / brand colors:** Clinozy "C" mark with a green dot · green oklch(0.52 0.12 150) for success · #18181b for primary actions.
- **Tone of copy:** plain and friendly, staff language ("Received / Paid", "Give back", "Not saved · your changes are kept").

---

## 7. Platform Behavior (Web + Mobile)

- **Web (desktop):** top header with section tabs, data tables, right drawers, calendar grid. Compact spacing below 1440 × 800.
- **Tablet:** same layout; row actions always visible (no hover-only), tap tooltips, 44px hit targets for quick inputs.
- **Mobile:** not designed yet.
- **Mobile-only or web-only screens:** prints (Rx, invoice, sale) are A4 from web.
- **Primary platform:** desktop at the front desk, tablet in the consult room.

---

## 8. Interactions & States

- **Empty states:** each list explains what goes there and offers its "New …" button; empty Feedback card says no feedback yet with "Log feedback"; empty peek tiles show a dashed "Empty".
- **Loading / success / error:** skeleton rows while lists fetch; hover cards open only after data loads; Save reads "Saving…"; failed save keeps the drawer open with "Not saved · your changes are kept" + "Retry save"; failed list load shows a message with Retry; offline splash with Retry. Success = toast (with Undo where it applies).
- **Notifications or confirmations:** delete / cancel / void = right confirm drawer with reason chips (Created by mistake · Duplicate · No longer needed · Other), then Undo toast. Rescheduling shows "a new reminder goes out on save".
- **Search / filter / sort:** every list has search (300 ms debounce), Filters (its columns + Created + Follow-up date where it applies) and sortable columns. Leads: status, source, assigned. Appointments: doctor, status, type. Medical stock: low stock, nearest expiry. Sales: unpaid, returned. POs: stage.

---

## 9. Open Questions / Notes

- Dark-mode pale tints need a visual check on real screens.
- Should the "verify your email" banner be built now?
- Final URLs: routes are proposed in `iterations/launch-2026-09-30-jxmr/intake-files/schema-routes.md` (93 routes) but the prototype is still one page.
- When should the phone layout be designed, and for which roles first (doctor? front desk)?
- Is WhatsApp the only messaging channel, or are SMS / calls logged too?

---

## ✅ Checklist

- [x] Every screen listed with its actions (§3.1)
- [x] At least 2 end-to-end flows (§3.2)
- [x] Realistic sample data, no placeholders (§4.2)
- [x] Must-haves vs nice-to-haves marked (§5)
- [x] Visual direction stated (§6)
