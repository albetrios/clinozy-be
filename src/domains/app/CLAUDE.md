# The app domain — clinozy-be

Claude Code loads this file when it works in `src/domains/app/`. It holds sections moved out of the root [`CLAUDE.md`](../../../CLAUDE.md), which keeps a pointer to each; the root rules apply here too.

## Sub-domains

The app row of the domain → sub-domain map in [`../CLAUDE.md`](../CLAUDE.md):

| Domain (folder) | Sub-domains (folders) |
| --------------- | --------------------- |
| **app**         | the app's own records, Postgres schema `app` — one sub-domain per section of the launch route review, each with its nested sub-domains inside: branches (branch-members, branch-rooms, branch-machines, branch-holidays), memberships (membership-preferences, membership-saved-views), offerings (offering-groups, offers), contacts (contact-members, contact-activities, contact-message-templates), leads, appointments, patients (patient-clinical-notes, patient-prescriptions, prescription-kits, patient-diagnoses, patient-images, patient-reports, patient-treatments, patient-check-ins, patient-reviews, patient-feedback-actions, patient-offerings, patient-offering-suggestions, patient-ideas), billing (invoices, invoice-credit-notes, payments, pending-credits, day-closes), stock (stock-items, stock-item-movements, stock-counts, stock-purchases, stock-vendors), tasks (task-rule-settings), medical (manufacturers, suppliers (supplier-credits), medicines, medical-purchase-orders, medical-reps (medical-rep-visits), medical-sales, medical-payments) — rebuilt one by one, launch ROUTE #125–#138, #152 and #153 |
