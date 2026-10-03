# Access — launch-2026-09-30-jxmr

Status: ready — planning Step 5. Answers: which role may see or do what, scoped to what. Requirements state WHAT must be true; the
technical design is decided per ROUTE row at kickoff and recorded in `AS-BUILT.md` (agent-os decides).

| Requirement | Change | What must be true | Source | Features |
| --- | --- | --- | --- | --- |
| `access.session-context` | CHANGED | The signed-in session also carries the person's clinic roles, assigned branches and section permissions | RC-1; D5, D9; schema-routes.md:1563 | [team-and-access](../features/team-and-access/story.md) |
| `access.membership-roles` | CHANGED | A member holds one or more roles; their access is the union of what those roles allow | D5; schema-routes.md:225 | [team-and-access](../features/team-and-access/story.md) |
| `access.custom-roles` | CHANGED | The nine clinic roles are seeded as editable organization roles (with colour and purpose); a clinic may add its own roles and copy access from another | D5, D3; users.md:11, 61, 236, 361 | [team-and-access](../features/team-and-access/story.md) |
| `access.section-permissions` | CHANGED | The ten clinic sections, each with View, Create, Edit and Delete, are codes in the permission catalog that roles hold; Delete needs View (not Edit) | D10, D3; users.md:61–65; P67 | [team-and-access](../features/team-and-access/story.md) |
| `access.default-matrix` | NEW | Each clinic starts with the default matrix: View + Create + Edit in each role's rooms, Delete for Owner and Admin | D12 | [team-and-access](../features/team-and-access/story.md) |
| `access.action-codes` | NEW | Prescribing, recording treatments, closing the day and managing users are permission codes seeded on the roles schema-routes names, movable like the rest of the matrix | D13 | [team-and-access](../features/team-and-access/story.md) |
| `access.prescribe` | NEW | Doctor and Admin may write and approve prescriptions by default | D14; schema-routes.md:35, 37 | [patient-file](../features/patient-file/story.md) |
| `access.treatments` | NEW | Doctor and Therapist may record and reverse treatments by default | D12, D13; PRD.md:19; schema-routes.md:38–39 | [patient-file](../features/patient-file/story.md) |
| `access.accountant-billing` | NEW | The Accountant sees only a patient's invoices, payments and packages, from Payments — no clinical sections, no patient list | D15 | [patient-file](../features/patient-file/story.md) |
| `access.marketing-reviews` | NEW | Marketing reads and logs reviews in a patient's Reviews section and sees nothing else of the file | D16 | [patient-file](../features/patient-file/story.md) |
| `access.billing-is-payments` | NEW | schema-routes' billing permissions are the Payments section's View, Create and Edit | D17 | [payments-and-invoices](../features/payments-and-invoices/story.md) |
| `access.special-permissions` | NEW | The 11 special permissions are codes with the default holders of D18, refunds amended by D25 | D18, D25; users.md:71, 73 | [team-and-access](../features/team-and-access/story.md) |
| `access.task-rule-settings` | NEW | Owner and Admin change the task-rule settings | D19 | [tasks](../features/tasks/story.md) |
| `access.branch-visibility` | NEW | A user sees and works only in their assigned branches; Owner and Admin see every branch | D9 | [team-and-access](../features/team-and-access/story.md) |
| `access.owner-acts` | NEW | Admin holds every clinic section and permission; only Owner deletes the organization, transfers ownership or manages the platform subscription | D8 | [team-and-access](../features/team-and-access/story.md) |
| `access.staff-invitation` | CHANGED | A new staff member is invited with roles, branches and profile and sets their own sign-in; nobody else sets or sees their password | D4 | [team-and-access](../features/team-and-access/story.md) |
| `access.member-removal` | CHANGED | Removing a member takes a reason and a note and can be undone for 10 seconds; an inactive member is signed out | D3; users.md:117, 247–252 | [team-and-access](../features/team-and-access/story.md) |
| `access.private-album` | NEW | The Private photo album is seen only by Doctor and Admin | P46; schema-routes.md:40 | [patient-file](../features/patient-file/story.md) |
| `access.discounts` | NEW | A discount stops at the offer price unless the person holds "Bill below the offer price", and never goes below the offering's lowest price | D26; users.md:71 | [offerings](../features/offerings/story.md) |
| `access.refunds` | NEW | Refunds and credit notes are given by holders of the refund permission — Accountant, Owner and Admin by default | D25 | [payments-and-invoices](../features/payments-and-invoices/story.md) |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `access.session-context` | the user, the active organization and its permissions | also the clinic roles held, the assigned branches and the section permissions | D5, D9 |
| `access.membership-roles` | a member holds exactly one role | a member holds one or more roles; access is their union | D5 |
| `access.custom-roles` | the platform's Admin / Member / Viewer roles | nine seeded editable clinic roles plus custom roles | D5, D3 |
| `access.section-permissions` | the catalog holds platform permissions only | it also holds the clinic section codes, the role-named action codes and the special permissions | D10, D13, D18 |
| `access.staff-invitation` | an invitation adds a member with one role | an invitation carries roles, branches and the staff profile; no admin-set password | D4 |
| `access.member-removal` | removing a member is immediate | with a reason and a note, restorable for 10 seconds | D3 |
