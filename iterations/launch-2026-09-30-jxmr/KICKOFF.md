# KICKOFF — launch-2026-09-30-jxmr

> The plan and the ROUTE ledger for the launch — frozen at approval. Requirements and decisions only; each
> ROUTE row's technical design is decided at kickoff by agent-os and recorded in `AS-BUILT.md`.

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `launch-2026-09-30-jxmr` |
| Mode | initial |
| Baseline | none |
| Intake mode | full |
| Intake note | 22 received |
| Drop placed | 2026-10-03 |
| Intake hash | 036cbb592ac5 |
| Schema-routes | 5f90325208e1 |
| Date | 2026-10-03 |

## 2. Goal and scope

**Goal.** The backend for the Clinozy clinic launch: every PRD must-have (PRD.md:180–195) and every
schema-routes operation (schema-routes.md:1537–1755), plus the frontend's backend requests (its Appendix F),
so that every frontend room can leave its fixtures ([D2](plans/decisions.md), [D3](plans/decisions.md)).

**In scope:** the 60 tables of [db-changes.md](plans/db-changes.md), the routes of [route-changes.md](plans/route-changes.md),
the background work of [worker-changes.md](plans/worker-changes.md); real WhatsApp ([D32](plans/decisions.md)), reminders
([D34](plans/decisions.md)), AI ideas ([D39](plans/decisions.md)).

**Out of scope:** presentation and every `frontend only` item ([D1](plans/decisions.md), [D11](plans/decisions.md)); phone layout
and the patient-facing app (PRD.md:204–205); SMS and email to patients ([D33](plans/decisions.md)); AI drafts beyond ideas
([D44](plans/decisions.md)); legacy import ([D40](plans/decisions.md)); push updates ([D37](plans/decisions.md)); the "verify your email"
banner ([D40](plans/decisions.md)).

## 3. Locked decisions

| # | Question | Decision | Kind |
| --- | --- | --- | --- |
| [D1](plans/decisions.md) | How are PRD ↔ schema-routes mismatches settled? | R1–R4 | RED |
| [D2](plans/decisions.md) | What does this backend launch build? | All must-haves | RED |
| [D3](plans/decisions.md) | Which of the approved frontend launch's backend requests (its KICKOFF.md › Appendix F, 18 domains beyond schema-routes) belong in this launch? | All of Appendix F | RED |
| [D4](plans/decisions.md) | How does a staff member get an account? | Invitation | RED |
| [D5](plans/decisions.md) | How are the 9 clinic roles held? | Editable, several per person | RED |
| [D6](plans/decisions.md) | How are the Appendix F requests (D3) traced, given this iteration's intake held only `PRD.md` and `schema-routes.md`? | Re-place with the full drop | RED |
| [D7](plans/decisions.md) | Where do the drop's Organization fields live? | Extend the organization | RED |
| [D8](plans/decisions.md) | What may Owner do that Admin may not? | Only organization-level acts | RED |
| [D9](plans/decisions.md) | May a user see branches they are not assigned to? | Own branches; Owner and Admin all | RED |
| [D10](plans/decisions.md) | How are fixed value lists and the access sections held? | Allowed values, never database enum types, and sections are dynamic | RED |
| [D11](plans/decisions.md) | How are the full drop's screen specs and prototype weighed against `PRD.md` and `schema-routes.md`? | R5–R7 | RED |
| [D12](plans/decisions.md) | What does each role get by default? | View + Create + Edit in each role's rooms; only Owner and Admin delete | RED |
| [D13](plans/decisions.md) | How do the actions schema-routes ties to role names work? | Permission codes | RED |
| [D14](plans/decisions.md) | Who may write prescriptions by default? | Doctor and Admin | RED |
| [D15](plans/decisions.md) | What may the Accountant see in a patient's file? | Billing sections only | RED |
| [D16](plans/decisions.md) | How does Marketing work with reviews? | Reviews section only | RED |
| [D17](plans/decisions.md) | What do schema-routes' `billing.*` permissions mean? | The Payments section | AMBER |
| [D18](plans/decisions.md) | Who holds the 11 special permissions by default? | The prototype's presets, minus the clashes | AMBER |
| [D19](plans/decisions.md) | Who may change the task-rule settings? | Owner and Admin | AMBER |
| [D20](plans/decisions.md) | How does a bill's overall discount interact with GST? | Before tax | RED |
| [D21](plans/decisions.md) | Are prices entered with GST included or GST on top? | Inclusive where marked | RED |
| [D22](plans/decisions.md) | Can a credit note exist without an invoice? | Only against an invoice | RED |
| [D23](plans/decisions.md) | How do invoice numbers run? | Per GSTIN and financial year | RED |
| [D24](plans/decisions.md) | Can a day be closed when the counted cash doesn't match? | Yes, with a reason | AMBER |
| [D25](plans/decisions.md) | Who may refund money? | Owner or Accountant | AMBER |
| [D26](plans/decisions.md) | How are discounts limited? | The lowest price only | AMBER |
| [D27](plans/decisions.md) | What GST rates are seeded on offerings? | Seed the defaults | AMBER |
| [D28](plans/decisions.md) | How do rooms and machines work? | Rooms and machines, both per branch | RED |
| [D29](plans/decisions.md) | How are offerings categorised? | A fixed kind plus clinic groups | RED |
| [D30](plans/decisions.md) | How does a no-show get set? | Staff mark it, only after the start time | RED |
| [D31](plans/decisions.md) | Do prescriptions need approval? | Draft, then approve | RED |
| [D32](plans/decisions.md) | Does the launch really send WhatsApp messages? | Real, via the WhatsApp Business API | RED |
| [D33](plans/decisions.md) | Which other channels really send at launch? | Neither | RED |
| [D34](plans/decisions.md) | Do appointment reminders go out at launch? | A confirm request + one reminder | RED |
| [D35](plans/decisions.md) | How do re-target leads for lapsed patients start? | Daily; staff send the first message | RED |
| [D36](plans/decisions.md) | Where do the new tables live? | Keep `app` for now | RED |
| [D37](plans/decisions.md) | How fresh must shared screens be? | Refresh every 60 s | RED |
| [D38](plans/decisions.md) | How long are medical records kept, and can they be deleted? | Deleted records are purged after 7 days | RED |
| [D39](plans/decisions.md) | How are "ideas from history" computed? | AI suggestions | RED |
| [D40](plans/decisions.md) | The AMBER defaults | All accepted as proposed | AMBER |
| [D41](plans/decisions.md) | When is a booking slot free? | Person, room and machine free, inside branch hours and outside the branch's holidays | RED |
| [D42](plans/decisions.md) | Which medicine-sale rules does the server enforce? | All three | RED |
| [D43](plans/decisions.md) | What happens when two people edit the same record? | Refuse, and say who and when | RED |
| [D44](plans/decisions.md) | Which AI drafts beyond ideas belong in this launch? | None at launch | SCOPE |

## 4. Features and order

Screen features first (each owns its tables), then the flows that involve them.

| # | Feature | Kind | Depends on | Tables |
| --- | --- | --- | --- | --- |
| 1 | [Team, roles and branches](plans/features/team-and-access/story.md) | screen | — | organization, branch, user, membership, role, permission, role_permission |
| 2 | [Shell, lists and record rules](plans/features/shell-and-patterns/story.md) | screen | team-and-access | user_preference, saved_view |
| 3 | [Offerings and offers](plans/features/offerings/story.md) | screen | team-and-access | offering_group, offering, offer |
| 4 | [Leads and conversations](plans/features/leads-and-messages/story.md) | screen | team-and-access, shell-and-patterns | lead, lead_message, lead_read, message_template |
| 5 | [Patients](plans/features/patients/story.md) | screen | team-and-access, shell-and-patterns | patient |
| 6 | [Appointments](plans/features/appointments/story.md) | screen | team-and-access, patients, leads-and-messages | branch_holiday, room, machine, appointment |
| 7 | [Patient file and clinical record](plans/features/patient-file/story.md) | screen | patients, appointments, offerings | diagnosis, patient_clinical_note, prescription, prescription_kit, patient_image, patient_report, patient_note, patient_package, offering_suggestion, patient_idea, treatment, check_in, review, feedback_action |
| 8 | [Today and the visit](plans/features/today-floor/story.md) | screen | appointments, patient-file | visit |
| 9 | [Invoices, payments and day close](plans/features/payments-and-invoices/story.md) | screen | patients, offerings, patient-file | invoice, payment, payment_edit, credit_note, pending_credit, day_close, day_close_event |
| 10 | [Medical store](plans/features/medical-store/story.md) | screen | payments-and-invoices, patient-file | manufacturer, supplier, medical_rep, medical_rep_visit, medicine, medical_purchase_order, medical_contact, medical_sale, supplier_credit |
| 11 | [Clinic stock](plans/features/clinic-stock/story.md) | screen | payments-and-invoices | stock_vendor, stock_item, stock_purchase, stock_movement, stock_count |
| 12 | [Tasks and rules](plans/features/tasks/story.md) | screen | leads-and-messages, appointments, patient-file, payments-and-invoices | task, task_owner_change, task_rule_setting |
| 13 | [Flow 1 — an enquiry becomes a patient](plans/features/flow-enquiry-to-patient/story.md) | flow | leads-and-messages, appointments, today-floor, patients | — |
| 14 | [Flow 2 — visit, prescription, sale, payment](plans/features/flow-visit-to-payment/story.md) | flow | today-floor, patient-file, medical-store, payments-and-invoices | — |
| 15 | [Flow 3 — treatment plan and feedback](plans/features/flow-plan-and-feedback/story.md) | flow | patient-file, payments-and-invoices, tasks | — |

## 5. ROUTE

One row per work item, in build order: tables (the stages of db-changes.md) → screen features → background
work → flows → acceptance. Driver: NEW table → the staged-build prompt (`docs/getting-started/staged-build-prompt.md`);
CHANGE table, feature, background work, flow → `/be-build-requirement`. Each row is one stop for your review
(`be-kickoff-iteration` › Each ROUTE row).

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `organization` — CHANGE table (Stage 1) | table | — | `/be-build-requirement` | its [db-changes.md section](plans/db-changes.md#organization--changed) approved and built (`data.stage-foundation`) | — | in progress |
| 2 | `branch` — NEW table (Stage 1) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#branch--new) approved and built (`data.stage-foundation`) | — | open |
| 3 | `user` — CHANGE table (Stage 1) | table | — | `/be-build-requirement` | its [db-changes.md section](plans/db-changes.md#user--changed) approved and built (`data.stage-foundation`) | — | open |
| 4 | `membership` — CHANGE table (Stage 1) | table | — | `/be-build-requirement` | its [db-changes.md section](plans/db-changes.md#membership--changed) approved and built (`data.stage-foundation`) | — | open |
| 5 | `role` — CHANGE table (Stage 1) | table | — | `/be-build-requirement` | its [db-changes.md section](plans/db-changes.md#role--changed) approved and built (`data.stage-foundation`) | — | open |
| 6 | `permission` — seed codes (no schema change) (Stage 1) | table | — | `/be-build-requirement` | its [db-changes.md section](plans/db-changes.md#permission--existing) approved and built (`data.stage-foundation`) | — | open |
| 7 | `role_permission` — seed codes (no schema change) (Stage 1) | table | — | `/be-build-requirement` | its [db-changes.md section](plans/db-changes.md#role_permission--existing) approved and built (`data.stage-foundation`) | — | open |
| 8 | `user_preference` — NEW table (Stage 1) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#user_preference--new) approved and built (`data.stage-foundation`) | — | open |
| 9 | `saved_view` — NEW table (Stage 1) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#saved_view--new) approved and built (`data.stage-foundation`) | — | open |
| 10 | `offering_group` — NEW table (Stage 2) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#offering_group--new) approved and built (`data.stage-catalogue`) | — | open |
| 11 | `offering` — NEW table (Stage 2) | table | #10 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#offering--new) approved and built (`data.stage-catalogue`) | — | open |
| 12 | `offer` — NEW table (Stage 2) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#offer--new) approved and built (`data.stage-catalogue`) | — | open |
| 13 | `patient` — NEW table (Stage 3); its link to `lead` lands with #14 | table | #2 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#patient--new) approved and built (`data.stage-people`) | — | open |
| 14 | `lead` — NEW table (Stage 3) | table | #2, #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#lead--new) approved and built (`data.stage-people`) | — | open |
| 15 | `lead_message` — NEW table (Stage 3); its link to `task` lands with #58 | table | #14 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#lead_message--new) approved and built (`data.stage-people`) | — | open |
| 16 | `lead_read` — NEW table (Stage 3) | table | #14 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#lead_read--new) approved and built (`data.stage-people`) | — | open |
| 17 | `message_template` — NEW table (Stage 3) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#message_template--new) approved and built (`data.stage-people`) | — | open |
| 18 | `branch_holiday` — NEW table (Stage 4) | table | #2 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#branch_holiday--new) approved and built (`data.stage-scheduling`) | — | open |
| 19 | `room` — NEW table (Stage 4) | table | #2 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#room--new) approved and built (`data.stage-scheduling`) | — | open |
| 20 | `machine` — NEW table (Stage 4) | table | #2 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#machine--new) approved and built (`data.stage-scheduling`) | — | open |
| 21 | `appointment` — NEW table (Stage 4); its link to `patient_package` lands with #31 | table | #2, #14, #20, #11, #13, #19 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#appointment--new) approved and built (`data.stage-scheduling`) | — | open |
| 22 | `visit` — NEW table (Stage 4) | table | #21, #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#visit--new) approved and built (`data.stage-scheduling`) | — | open |
| 23 | `diagnosis` — NEW table (Stage 5) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#diagnosis--new) approved and built (`data.stage-clinical-record`) | — | open |
| 24 | `patient_clinical_note` — NEW table (Stage 5) | table | #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#patient_clinical_note--new) approved and built (`data.stage-clinical-record`) | — | open |
| 25 | `prescription` — NEW table (Stage 5) | table | #21, #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#prescription--new) approved and built (`data.stage-clinical-record`) | — | open |
| 26 | `prescription_kit` — NEW table (Stage 5) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#prescription_kit--new) approved and built (`data.stage-clinical-record`) | — | open |
| 27 | `patient_image` — NEW table (Stage 5) | table | #21, #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#patient_image--new) approved and built (`data.stage-clinical-record`) | — | open |
| 28 | `patient_report` — NEW table (Stage 5) | table | #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#patient_report--new) approved and built (`data.stage-clinical-record`) | — | open |
| 29 | `patient_note` — NEW table (Stage 5) | table | #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#patient_note--new) approved and built (`data.stage-clinical-record`) | — | open |
| 30 | `invoice` — NEW table (Stage 6); its link to `medical_contact` lands with #50; its link to `medical_sale` lands with #51 | table | #2, #13, #25 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#invoice--new) approved and built (`data.stage-billing`) | — | open |
| 31 | `patient_package` — NEW table (Stage 6) | table | #30, #11, #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#patient_package--new) approved and built (`data.stage-billing`) | — | open |
| 32 | `offering_suggestion` — NEW table (Stage 6) | table | #21, #11, #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#offering_suggestion--new) approved and built (`data.stage-billing`) | — | open |
| 33 | `patient_idea` — NEW table (Stage 6) | table | #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#patient_idea--new) approved and built (`data.stage-billing`) | — | open |
| 34 | `payment` — NEW table (Stage 6); its link to `credit_note` lands with #36; its link to `day_close` lands with #38; its link to `pending_credit` lands with #37 | table | #2, #30, #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#payment--new) approved and built (`data.stage-billing`) | — | open |
| 35 | `payment_edit` — NEW table (Stage 6) | table | #34 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#payment_edit--new) approved and built (`data.stage-billing`) | — | open |
| 36 | `credit_note` — NEW table (Stage 6) | table | #30 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#credit_note--new) approved and built (`data.stage-billing`) | — | open |
| 37 | `pending_credit` — NEW table (Stage 6) | table | #30, #13, #34 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#pending_credit--new) approved and built (`data.stage-billing`) | — | open |
| 38 | `day_close` — NEW table (Stage 6) | table | #2 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#day_close--new) approved and built (`data.stage-billing`) | — | open |
| 39 | `day_close_event` — NEW table (Stage 6) | table | #38 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#day_close_event--new) approved and built (`data.stage-billing`) | — | open |
| 40 | `treatment` — NEW table (Stage 7) | table | #21, #11, #13, #31 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#treatment--new) approved and built (`data.stage-treatments-feedback`) | — | open |
| 41 | `check_in` — NEW table (Stage 7) | table | #21, #13, #40 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#check_in--new) approved and built (`data.stage-treatments-feedback`) | — | open |
| 42 | `review` — NEW table (Stage 7) | table | #21, #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#review--new) approved and built (`data.stage-treatments-feedback`) | — | open |
| 43 | `feedback_action` — NEW table (Stage 7) | table | #41, #42 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#feedback_action--new) approved and built (`data.stage-treatments-feedback`) | — | open |
| 44 | `manufacturer` — NEW table (Stage 8) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#manufacturer--new) approved and built (`data.stage-medical-store`) | — | open |
| 45 | `supplier` — NEW table (Stage 8) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#supplier--new) approved and built (`data.stage-medical-store`) | — | open |
| 46 | `medical_rep` — NEW table (Stage 8) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#medical_rep--new) approved and built (`data.stage-medical-store`) | — | open |
| 47 | `medical_rep_visit` — NEW table (Stage 8) | table | #46 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#medical_rep_visit--new) approved and built (`data.stage-medical-store`) | — | open |
| 48 | `medicine` — NEW table (Stage 8) | table | #44 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#medicine--new) approved and built (`data.stage-medical-store`) | — | open |
| 49 | `medical_purchase_order` — NEW table (Stage 8) | table | #45 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#medical_purchase_order--new) approved and built (`data.stage-medical-store`) | — | open |
| 50 | `medical_contact` — NEW table (Stage 8) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#medical_contact--new) approved and built (`data.stage-medical-store`) | — | open |
| 51 | `medical_sale` — NEW table (Stage 8) | table | #30, #14, #50, #13, #25 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#medical_sale--new) approved and built (`data.stage-medical-store`) | — | open |
| 52 | `supplier_credit` — NEW table (Stage 8) | table | #48, #45 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#supplier_credit--new) approved and built (`data.stage-medical-store`) | — | open |
| 53 | `stock_vendor` — NEW table (Stage 9) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#stock_vendor--new) approved and built (`data.stage-clinic-stock`) | — | open |
| 54 | `stock_item` — NEW table (Stage 9) | table | #53 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#stock_item--new) approved and built (`data.stage-clinic-stock`) | — | open |
| 55 | `stock_purchase` — NEW table (Stage 9) | table | #53 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#stock_purchase--new) approved and built (`data.stage-clinic-stock`) | — | open |
| 56 | `stock_movement` — NEW table (Stage 9); its link to `stock_count` lands with #57 | table | #13, #54, #55 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#stock_movement--new) approved and built (`data.stage-clinic-stock`) | — | open |
| 57 | `stock_count` — NEW table (Stage 9) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#stock_count--new) approved and built (`data.stage-clinic-stock`) | — | open |
| 58 | `task` — NEW table (Stage 10) | table | #14, #13 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#task--new) approved and built (`data.stage-tasks`) | — | open |
| 59 | `task_owner_change` — NEW table (Stage 10) | table | #58 | staged-build prompt | its [db-changes.md section](plans/db-changes.md#task_owner_change--new) approved and built (`data.stage-tasks`) | — | open |
| 60 | `task_rule_setting` — NEW table (Stage 10) | table | — | staged-build prompt | its [db-changes.md section](plans/db-changes.md#task_rule_setting--new) approved and built (`data.stage-tasks`) | — | open |
| 61 | [Team, roles and branches](plans/features/team-and-access/story.md) — the screen's cross-table operations and rules | feature | #1, #2, #3, #4, #5, #6, #7 | `/be-build-requirement` | team-and-access.1–6 | — | open |
| 62 | [Shell, lists and record rules](plans/features/shell-and-patterns/story.md) — the screen's cross-table operations and rules | feature | #8, #9, #61 | `/be-build-requirement` | shell-and-patterns.1–5 | — | open |
| 63 | [Offerings and offers](plans/features/offerings/story.md) — the screen's cross-table operations and rules | feature | #10, #11, #12, #61 | `/be-build-requirement` | offerings.1–3 | — | open |
| 64 | [Leads and conversations](plans/features/leads-and-messages/story.md) — the screen's cross-table operations and rules | feature | #14, #15, #16, #17, #61, #62 | `/be-build-requirement` | leads-and-messages.1–6 | — | open |
| 65 | [Patients](plans/features/patients/story.md) — the screen's cross-table operations and rules | feature | #13, #61, #62 | `/be-build-requirement` | patients.1–3 | — | open |
| 66 | [Appointments](plans/features/appointments/story.md) — the screen's cross-table operations and rules | feature | #18, #19, #20, #21, #61, #65, #64 | `/be-build-requirement` | appointments.1–6 | — | open |
| 67 | [Patient file and clinical record](plans/features/patient-file/story.md) — the screen's cross-table operations and rules | feature | #23, #24, #25, #26, #27, #28, #29, #31, #32, #33, #40, #41, #42, #43, #65, #66, #63 | `/be-build-requirement` | patient-file.1–6 | — | open |
| 68 | [Today and the visit](plans/features/today-floor/story.md) — the screen's cross-table operations and rules | feature | #22, #66, #67 | `/be-build-requirement` | today-floor.1–4 | — | open |
| 69 | [Invoices, payments and day close](plans/features/payments-and-invoices/story.md) — the screen's cross-table operations and rules | feature | #30, #34, #35, #36, #37, #38, #39, #65, #63, #67 | `/be-build-requirement` | payments-and-invoices.1–6 | — | open |
| 70 | [Medical store](plans/features/medical-store/story.md) — the screen's cross-table operations and rules | feature | #44, #45, #46, #47, #48, #49, #50, #51, #52, #69, #67 | `/be-build-requirement` | medical-store.1–4 | — | open |
| 71 | [Clinic stock](plans/features/clinic-stock/story.md) — the screen's cross-table operations and rules | feature | #53, #54, #55, #56, #57, #69 | `/be-build-requirement` | clinic-stock.1–3 | — | open |
| 72 | [Tasks and rules](plans/features/tasks/story.md) — the screen's cross-table operations and rules | feature | #58, #59, #60, #64, #66, #67, #69 | `/be-build-requirement` | tasks.1–4 | — | open |
| 73 | WC-1 `background.message-delivery` — send an outgoing message through the WhatsApp Business API (or Instagram) and follow its delivery (Sending → Sent → Delivered → Read, or Failed) (D32) | background | #64 | `/be-build-requirement` | WC-1 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 74 | WC-2 `background.message-outage-queue` — hold messages while WhatsApp is down and send them when it is back | background | #64 | `/be-build-requirement` | WC-2 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 75 | WC-3 `background.inbound-messages` — take in replies (WhatsApp, Instagram) and add them to the person's conversation | background | #64 | `/be-build-requirement` | WC-3 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 76 | WC-4 `background.channel-fallback` — when WhatsApp fails, flag a call — no SMS at launch (D33) | background | #64 | `/be-build-requirement` | WC-4 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 77 | WC-5 `background.booking-confirm-request` — ask the patient to confirm right after booking ("Yes" confirms) (D34) | background | #66 | `/be-build-requirement` | WC-5 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 78 | WC-6 `background.appointment-reminder` — remind the patient the day before the visit, at the hour the clinic sets — no 2-hour nudge (D34) | background | #66 | `/be-build-requirement` | WC-6 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 79 | WC-7 `background.reminder-rescheduling` — move reminders when a visit is rescheduled, stop them when it is cancelled, restart them on restore (D34) | background | #66 | `/be-build-requirement` | WC-7 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 80 | WC-8 `background.auto-confirm-on-reply` — confirm the appointment when the patient replies "Yes" | background | #66 | `/be-build-requirement` | WC-8 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 81 | WC-9 `background.payment-receipt` — send the receipt to the patient on WhatsApp | background | #69 | `/be-build-requirement` | WC-9 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 82 | WC-10 `background.day-close-summary` — send the day-close summary to the admin on WhatsApp | background | #69 | `/be-build-requirement` | WC-10 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 83 | WC-11 `background.visit-share` — deliver the "Share Rx, invoice & photos" message | background | #67 | `/be-build-requirement` | WC-11 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 84 | WC-12 `background.bulk-payment-reminders` — deliver bulk payment reminders | background | #69 | `/be-build-requirement` | WC-12 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 85 | WC-13 `background.bulk-message-drafts` — prepare bulk WhatsApp drafts | background | #64 | `/be-build-requirement` | WC-13 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 86 | WC-14 `background.lead-hold-release` — open a held lead to the team after its idle days (default 3), or at once when its owner has left; warn the day before | background | #64 | `/be-build-requirement` | WC-14 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 87 | WC-15 `background.lead-status-auto` — move a lead's status by itself: first reply or logged call → Contacted; check-in → Clinic visited — each with a system line in the chat (P21, D40) | background | #64 | `/be-build-requirement` | WC-15 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 88 | WC-16 `background.lead-involved-auto` — add a team member to "involved" when they reply, call, note or book | background | #64 | `/be-build-requirement` | WC-16 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 89 | WC-17 `background.retarget-leads` — create re-target leads for lapsed patients — no visit in N days (clinic setting, default 90), marketing consent given, nothing booked; staff send the first message, nothing goes out by itself (D35) | background | #64 | `/be-build-requirement` | WC-17 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 90 | WC-18 `background.task-reply` — **Reply** task — a lead's last message is from them | background | #72 | `/be-build-requirement` | WC-18 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 91 | WC-19 `background.task-failed-message` — **Message failed** task | background | #72 | `/be-build-requirement` | WC-19 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 92 | WC-20 `background.task-follow-up` — **Follow-up** task — lead in Follow-up / Contacted / No response, follow-up date reached | background | #72 | `/be-build-requirement` | WC-20 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 93 | WC-21 `background.task-call-back` — **Call back** task when a lead is set to No response (unless one is open) | background | #72 | `/be-build-requirement` | WC-21 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 94 | WC-22 `background.task-claim` — **Claim** task — a lead's hold is open and it is not yours | background | #72 | `/be-build-requirement` | WC-22 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 95 | WC-23 `background.task-confirm` — **Confirm** task — visit Scheduled within 48 h and not confirmed | background | #72 | `/be-build-requirement` | WC-23 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 96 | WC-24 `background.task-arrive` — **Arrived?** task — 15 min past start, not checked in | background | #72 | `/be-build-requirement` | WC-24 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 97 | WC-25 `background.task-rebook` — **Rebook** task after a no-show | background | #72 | `/be-build-requirement` | WC-25 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 98 | WC-26 `background.task-feedback` — **Feedback** task — visit completed 1–3 days ago | background | #72 | `/be-build-requirement` | WC-26 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 99 | WC-27 `background.task-aftercare` — **Aftercare call** task — a treatment asked for a call and no check-in exists | background | #72 | `/be-build-requirement` | WC-27 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 100 | WC-28 `background.task-next-visit` — **Next visit** task — last visit 1–45 days ago, nothing booked, no follow-up date | background | #72 | `/be-build-requirement` | WC-28 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 101 | WC-29 `background.task-gone-quiet` — **Gone quiet** task — 30+ days since the last visit, with a package left or 2+ visits; up to 3 come-back reminders first | background | #72 | `/be-build-requirement` | WC-29 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 102 | WC-30 `background.task-payment-due` — **Payment due** task — an invoice or sale is saved with money left to pay | background | #72 | `/be-build-requirement` | WC-30 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 103 | WC-31 `background.task-onboarding` — **Onboarding** task — collect consent, date of birth and a first photo | background | #72 | `/be-build-requirement` | WC-31 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 104 | WC-32 `background.task-unhappy` — **Doctor call-back** task — a check-in says Worse or scores 4 or less (due in 3 h), or a review rates 3 or less (due in 4 h) | background | #72 | `/be-build-requirement` | WC-32 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 105 | WC-33 `background.task-settle-by` — **Settle by** task for a pending credit | background | #72 | `/be-build-requirement` | WC-33 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 106 | WC-34 `background.task-medical-rep-visit` — **MR next visit** reminder | background | #72 | `/be-build-requirement` | WC-34 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 107 | WC-35 `background.task-auto-resolve` — close a task by itself when its condition is gone, logged "Done by Clinozy" | background | #72 | `/be-build-requirement` | WC-35 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 108 | WC-36 `background.task-snooze-return` — bring a snoozed task back | background | #72 | `/be-build-requirement` | WC-36 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 109 | WC-37 `background.task-automation` — "Clinozy handles it": send the rule's canned message and close the task (first reply with prices + free slots, check-in, reminder, two slots, feedback form, aftercare check-in) | background | #72 | `/be-build-requirement` | WC-37 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 110 | WC-38 `background.task-dedupe` — never create a second open task of the same kind for the same person | background | #72 | `/be-build-requirement` | WC-38 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 111 | WC-39 `background.day-auto-close` — close a past day that nobody closed, taking the cash as expected, and lock its entries | background | #69 | `/be-build-requirement` | WC-39 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 112 | WC-40 `background.permission-refresh` — apply a role's permission change to everyone holding it at once | background | #61 | `/be-build-requirement` | WC-40 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 113 | WC-41 `background.inactive-sign-out` — sign out a staff member set to Inactive | background | #61 | `/be-build-requirement` | WC-41 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 114 | WC-42 `background.photo-cleanup` — remove location data from uploaded photos, keeping capture order | background | #67 | `/be-build-requirement` | WC-42 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 115 | WC-43 `background.photo-pairing` — pair before photos with the matching after photos | background | #67 | `/be-build-requirement` | WC-43 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 116 | WC-44 `background.floor-live` — tell the doctor's queue and room that a patient checked in, and move the card for everyone on Today | background | #68 | `/be-build-requirement` | WC-44 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 117 | WC-45 `background.pharmacy-queue` — put an approved prescription in the pharmacy queue (D31) | background | #68 | `/be-build-requirement` | WC-45 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 118 | WC-46 `background.deleted-record-purge` — erase deleted records for good once their restore window ends (default 7 days, a clinic setting); live records are never touched | background | #62 | `/be-build-requirement` | WC-46 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 119 | WC-47 `background.patient-ideas` — refresh a patient's AI ideas from a de-identified summary (Data consent only) | background | #67 | `/be-build-requirement` | WC-47 as in [worker-changes.md](plans/worker-changes.md) | — | open |
| 120 | [Flow 1 — an enquiry becomes a patient](plans/features/flow-enquiry-to-patient/story.md) — end-to-end | flow | #64, #66, #68, #65 | `/be-build-requirement` | flow-enquiry-to-patient.1 | — | open |
| 121 | [Flow 2 — visit, prescription, sale, payment](plans/features/flow-visit-to-payment/story.md) — end-to-end | flow | #68, #67, #70, #69 | `/be-build-requirement` | flow-visit-to-payment.1 | — | open |
| 122 | [Flow 3 — treatment plan and feedback](plans/features/flow-plan-and-feedback/story.md) — end-to-end | flow | #67, #69, #72 | `/be-build-requirement` | flow-plan-and-feedback.1 | — | open |
| 123 | Acceptance — every criterion in [acceptance.md](plans/acceptance.md) checked with evidence | flow | #120, #121, #122 | `be-kickoff-iteration` › Close | every row of plans/acceptance.md | — | open |

## 6. Requirements index

| Requirement | File | Change |
| --- | --- | --- |
| `data.stage-foundation` | [requirements/data.md](plans/requirements/data.md) | CHANGED |
| `data.stage-catalogue` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.stage-people` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.stage-scheduling` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.stage-clinical-record` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.stage-billing` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.stage-treatments-feedback` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.stage-medical-store` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.stage-clinic-stock` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.stage-tasks` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.organization-scope` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.branch-scope` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.common-fields` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.display-numbers` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.formats` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.value-lists` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.organization-clinic-profile` | [requirements/data.md](plans/requirements/data.md) | CHANGED |
| `data.membership-profile` | [requirements/data.md](plans/requirements/data.md) | CHANGED |
| `data.user-presence` | [requirements/data.md](plans/requirements/data.md) | CHANGED |
| `data.contacts-on-records` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.package-sessions` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `data.deleted-record-purge` | [requirements/data.md](plans/requirements/data.md) | NEW |
| `access.session-context` | [requirements/access.md](plans/requirements/access.md) | CHANGED |
| `access.membership-roles` | [requirements/access.md](plans/requirements/access.md) | CHANGED |
| `access.custom-roles` | [requirements/access.md](plans/requirements/access.md) | CHANGED |
| `access.section-permissions` | [requirements/access.md](plans/requirements/access.md) | CHANGED |
| `access.default-matrix` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.action-codes` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.prescribe` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.treatments` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.accountant-billing` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.marketing-reviews` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.billing-is-payments` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.special-permissions` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.task-rule-settings` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.branch-visibility` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.owner-acts` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.staff-invitation` | [requirements/access.md](plans/requirements/access.md) | CHANGED |
| `access.member-removal` | [requirements/access.md](plans/requirements/access.md) | CHANGED |
| `access.private-album` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.discounts` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `access.refunds` | [requirements/access.md](plans/requirements/access.md) | NEW |
| `operations.lists` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.safe-saves` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.delete-restore` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.preferences` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.search` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.team` | [requirements/operations.md](plans/requirements/operations.md) | CHANGED |
| `operations.roles-and-access` | [requirements/operations.md](plans/requirements/operations.md) | CHANGED |
| `operations.branches` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.organization-settings` | [requirements/operations.md](plans/requirements/operations.md) | CHANGED |
| `operations.offerings` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.leads` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.messages` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.appointments` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.today-floor` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.patients` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.patient-file` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.prescriptions` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.treatments` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.images-and-reports` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.feedback` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.invoices` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.payments` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.pending-credits` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.day-close` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.medical-store` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.medical-sales` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.clinic-stock` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.tasks` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `operations.task-rules` | [requirements/operations.md](plans/requirements/operations.md) | NEW |
| `background.retries` | [requirements/background.md](plans/requirements/background.md) | NEW |
| `background.run-once` | [requirements/background.md](plans/requirements/background.md) | NEW |
| `background.clinic-local-time` | [requirements/background.md](plans/requirements/background.md) | NEW |
| `notifications.channels` | [requirements/notifications.md](plans/requirements/notifications.md) | NEW |
| `notifications.appointment-confirm` | [requirements/notifications.md](plans/requirements/notifications.md) | NEW |
| `notifications.appointment-reminder` | [requirements/notifications.md](plans/requirements/notifications.md) | NEW |
| `notifications.payment-receipt` | [requirements/notifications.md](plans/requirements/notifications.md) | NEW |
| `notifications.visit-share` | [requirements/notifications.md](plans/requirements/notifications.md) | NEW |
| `notifications.payment-reminders` | [requirements/notifications.md](plans/requirements/notifications.md) | NEW |
| `notifications.day-close-summary` | [requirements/notifications.md](plans/requirements/notifications.md) | NEW |
| `notifications.marketing-consent` | [requirements/notifications.md](plans/requirements/notifications.md) | NEW |
| `realtime.refresh-60s` | [requirements/realtime.md](plans/requirements/realtime.md) | NEW |
| `realtime.chat-refresh` | [requirements/realtime.md](plans/requirements/realtime.md) | NEW |
| `integrations.whatsapp-business` | [requirements/integrations.md](plans/requirements/integrations.md) | NEW |
| `integrations.instagram` | [requirements/integrations.md](plans/requirements/integrations.md) | NEW |
| `integrations.ai-ideas` | [requirements/integrations.md](plans/requirements/integrations.md) | NEW |
| `files.upload-limits` | [requirements/files.md](plans/requirements/files.md) | CHANGED |
| `files.patient-photos` | [requirements/files.md](plans/requirements/files.md) | NEW |
| `files.reports` | [requirements/files.md](plans/requirements/files.md) | NEW |
| `files.review-videos` | [requirements/files.md](plans/requirements/files.md) | NEW |
| `files.payment-attachments` | [requirements/files.md](plans/requirements/files.md) | NEW |
| `files.prints` | [requirements/files.md](plans/requirements/files.md) | NEW |
| `files.exports` | [requirements/files.md](plans/requirements/files.md) | NEW |
| `quality.tenant-isolation` | [requirements/quality.md](plans/requirements/quality.md) | NEW |
| `quality.audit` | [requirements/quality.md](plans/requirements/quality.md) | CHANGED |
| `quality.safe-retry` | [requirements/quality.md](plans/requirements/quality.md) | NEW |
| `quality.limits` | [requirements/quality.md](plans/requirements/quality.md) | NEW |
| `quality.privacy` | [requirements/quality.md](plans/requirements/quality.md) | NEW |
| `quality.retention` | [requirements/quality.md](plans/requirements/quality.md) | NEW |
| `background.message-delivery` | [worker-changes.md](plans/worker-changes.md) (WC-1) | NEW |
| `background.message-outage-queue` | [worker-changes.md](plans/worker-changes.md) (WC-2) | NEW |
| `background.inbound-messages` | [worker-changes.md](plans/worker-changes.md) (WC-3) | NEW |
| `background.channel-fallback` | [worker-changes.md](plans/worker-changes.md) (WC-4) | NEW |
| `background.booking-confirm-request` | [worker-changes.md](plans/worker-changes.md) (WC-5) | NEW |
| `background.appointment-reminder` | [worker-changes.md](plans/worker-changes.md) (WC-6) | NEW |
| `background.reminder-rescheduling` | [worker-changes.md](plans/worker-changes.md) (WC-7) | NEW |
| `background.auto-confirm-on-reply` | [worker-changes.md](plans/worker-changes.md) (WC-8) | NEW |
| `background.payment-receipt` | [worker-changes.md](plans/worker-changes.md) (WC-9) | NEW |
| `background.day-close-summary` | [worker-changes.md](plans/worker-changes.md) (WC-10) | NEW |
| `background.visit-share` | [worker-changes.md](plans/worker-changes.md) (WC-11) | NEW |
| `background.bulk-payment-reminders` | [worker-changes.md](plans/worker-changes.md) (WC-12) | NEW |
| `background.bulk-message-drafts` | [worker-changes.md](plans/worker-changes.md) (WC-13) | NEW |
| `background.lead-hold-release` | [worker-changes.md](plans/worker-changes.md) (WC-14) | NEW |
| `background.lead-status-auto` | [worker-changes.md](plans/worker-changes.md) (WC-15) | NEW |
| `background.lead-involved-auto` | [worker-changes.md](plans/worker-changes.md) (WC-16) | NEW |
| `background.retarget-leads` | [worker-changes.md](plans/worker-changes.md) (WC-17) | NEW |
| `background.task-reply` | [worker-changes.md](plans/worker-changes.md) (WC-18) | NEW |
| `background.task-failed-message` | [worker-changes.md](plans/worker-changes.md) (WC-19) | NEW |
| `background.task-follow-up` | [worker-changes.md](plans/worker-changes.md) (WC-20) | NEW |
| `background.task-call-back` | [worker-changes.md](plans/worker-changes.md) (WC-21) | NEW |
| `background.task-claim` | [worker-changes.md](plans/worker-changes.md) (WC-22) | NEW |
| `background.task-confirm` | [worker-changes.md](plans/worker-changes.md) (WC-23) | NEW |
| `background.task-arrive` | [worker-changes.md](plans/worker-changes.md) (WC-24) | NEW |
| `background.task-rebook` | [worker-changes.md](plans/worker-changes.md) (WC-25) | NEW |
| `background.task-feedback` | [worker-changes.md](plans/worker-changes.md) (WC-26) | NEW |
| `background.task-aftercare` | [worker-changes.md](plans/worker-changes.md) (WC-27) | NEW |
| `background.task-next-visit` | [worker-changes.md](plans/worker-changes.md) (WC-28) | NEW |
| `background.task-gone-quiet` | [worker-changes.md](plans/worker-changes.md) (WC-29) | NEW |
| `background.task-payment-due` | [worker-changes.md](plans/worker-changes.md) (WC-30) | NEW |
| `background.task-onboarding` | [worker-changes.md](plans/worker-changes.md) (WC-31) | NEW |
| `background.task-unhappy` | [worker-changes.md](plans/worker-changes.md) (WC-32) | NEW |
| `background.task-settle-by` | [worker-changes.md](plans/worker-changes.md) (WC-33) | NEW |
| `background.task-medical-rep-visit` | [worker-changes.md](plans/worker-changes.md) (WC-34) | NEW |
| `background.task-auto-resolve` | [worker-changes.md](plans/worker-changes.md) (WC-35) | NEW |
| `background.task-snooze-return` | [worker-changes.md](plans/worker-changes.md) (WC-36) | NEW |
| `background.task-automation` | [worker-changes.md](plans/worker-changes.md) (WC-37) | NEW |
| `background.task-dedupe` | [worker-changes.md](plans/worker-changes.md) (WC-38) | NEW |
| `background.day-auto-close` | [worker-changes.md](plans/worker-changes.md) (WC-39) | NEW |
| `background.permission-refresh` | [worker-changes.md](plans/worker-changes.md) (WC-40) | NEW |
| `background.inactive-sign-out` | [worker-changes.md](plans/worker-changes.md) (WC-41) | NEW |
| `background.photo-cleanup` | [worker-changes.md](plans/worker-changes.md) (WC-42) | NEW |
| `background.photo-pairing` | [worker-changes.md](plans/worker-changes.md) (WC-43) | NEW |
| `background.floor-live` | [worker-changes.md](plans/worker-changes.md) (WC-44) | NEW |
| `background.pharmacy-queue` | [worker-changes.md](plans/worker-changes.md) (WC-45) | NEW |
| `background.deleted-record-purge` | [worker-changes.md](plans/worker-changes.md) (WC-46) | NEW |
| `background.patient-ideas` | [worker-changes.md](plans/worker-changes.md) (WC-47) | NEW |

## 7. Open AMBER items

none — every AMBER default is accepted ([D40](plans/decisions.md)).

## 8. Standing deviations

n/a for the Baseline — this is the initial iteration (Baseline `none`). The deviations this iteration itself
plans from the drop, to be confirmed in `AS-BUILT.md` and carried to the next iteration:

| Item | Design says | Built as | Decision |
| --- | --- | --- | --- |
| API conventions | camelCase fields, organization in the URL, raw record ids (schema-routes.md:8–10) | the repository's API contract: snake_case, the signed organization claim, public ids | C1–C3 (R4, [D1](plans/decisions.md)) |
| Staff accounts | admin creates a user with a password (schema-routes.md:197, 1752) | invitation; the person sets their own sign-in | [D4](plans/decisions.md) |
| Roles | a fixed list of 9 (schema-routes.md:996–1007) | 9 seeded editable roles, several per person, custom roles | [D5](plans/decisions.md) |
| Value lists | 58 enums (schema-routes.md:994–1534) | allowed values; clinic-changeable lists are records | [D10](plans/decisions.md) |
| Rooms | a fixed room list, no machines (schema-routes.md:337) | rooms and machines per branch (also a request back to clinozy-fe) | [D28](plans/decisions.md) |
| Invoice numbers | one running seq (schema-routes.md:609) | per branch GSTIN and financial year | [D23](plans/decisions.md) |
| Discount and GST | overall discount after line GST (schema-routes.md:616, 622) | before tax; MRP includes GST | [D20](plans/decisions.md), [D21](plans/decisions.md) |
| Prescriptions | final on save, filled derived (schema-routes.md:372) | draft → approved | [D31](plans/decisions.md) |
| Delete | restore within 10 s (schema-routes.md:1546) | restorable until the 7-day purge | [D38](plans/decisions.md) |

## 9. Definition of done

- Every ROUTE row `done` (or `deferred` with your OK).
- [plans/acceptance.md](plans/acceptance.md) filled — every criterion with a result and evidence.
- `AS-BUILT.md`: every row recorded, its summary and Standing deviations written; db-changes.md, route-changes.md
  and worker-changes.md synced to what was built.
- The repository's gates green (`pnpm ci:local`, `pnpm validate:route-success-coverage`, the SonarQube gate).

## 10. Verification

- **Intake mode `full`:** the PRD's acceptance, traced in [plans/acceptance.md](plans/acceptance.md) — every row cites its
  `intake-files/PRD.md` line.
- **Gates:** `pnpm iteration:intake launch-2026-09-30-jxmr --check`, `pnpm ci:local`, `pnpm test:rls-role`, `pnpm routes:catalog:check`,
  `pnpm tsdoc:check`, `pnpm validate:route-success-coverage`.
- **Before launch, outside the code:** the clinic's accountant confirms the tax rules (D20, D21, D23); the clinic's
  advisor confirms the 7-day purge (D38); clinozy-fe confirms machines (D28); the WhatsApp Business number is verified (D32).
