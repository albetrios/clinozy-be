# Screens

| Slug | Route | Purpose |
| --- | --- | --- |
| splash | `/organization/:organizationSlug` (first load of the org layout, before the redirect to the role home) | Branded ~3.7s load sequence that cross-fades into the app |
| today | `/organization/:organizationSlug/today` | The clinic floor now: arrivals, waiting, with doctor, checkout |
| leads | `/organization/:organizationSlug/leads` (drawers `/leads/create`, `/leads/:leadId`) | Enquiries and their conversations, until they become patients |
| appointments | `/organization/:organizationSlug/appointments` (drawers `/appointments/create`, `/appointments/:appointmentId`) | Bookings by doctor, room and machine in Agenda, Day, Week and Month views (Agenda opens first; Week is not offered on phone) |
| patients | `/organization/:organizationSlug/patients` | Registered patients list with views All · In clinic today · With dues · Follow-up due · Recall |
| patient-file | `/organization/:organizationSlug/patients/:patientId/:section` | One patient: Overview, Clinical notes, Visits, Prescriptions, Treatments, Photos, Reports, Invoices, Payments, Packages, Team notes, beside the shared chat column (Activity) |
| medical | `/organization/:organizationSlug/medical/:section` (`sales` · `medicines` · `purchases` · `suppliers` · `manufacturers` · `mrs` · `payments`) | The medicine store: medicines for sale, suppliers, MRs, purchases, sales |
| clinic-stock | `/organization/:organizationSlug/stock/:section` (`items` · `purchases` · `movements`) | Clinic consumables and equipment used in procedures · not for sale |
| payments | `/organization/:organizationSlug/payments` and `/payments/pending` (drawer `/payments/day-close`) | Collections, invoices and dues: the Payments ledger, Pending credits and Day close |
| tasks | `/organization/:organizationSlug/tasks` | Follow-ups, feedback calls, reminders, with an owner and due time (To do · Snoozed · Done) |
| offerings | `/organization/:organizationSlug/offerings` and `/offerings/offers` | What the clinic sells: offerings, packages, offers and prices |
| users | `/organization/:organizationSlug/users`, `/users/roles`, `/users/branches` | Team, roles & access, branches |

Routes come from `schema-routes.md`. The prototype is one page that switches a `room` state, so it determines no URL — every path above is derived; the splash has no route of its own (it plays on the first load of whatever org URL the user opens).

Shared: `shell.md` (header, phone tab bar, All sections, Account menu, signed-out state — the design's only sign-in surface; `/login` per `schema-routes.md`) · `_patterns.md` (drawer, step cards, delete confirm, dropdown, list toolbar, filters, table, item rows, chat column, command menu, contact card, team card, toasts, tooltip, upload tray, photo viewer, states, motion) · `preset.md` (theme) · `_report.md` (self-check).

Not specified (design documentation, not product screens): the Blueprint section (All sections › Blueprint, "The design proposal behind Clinozy") and the "How data connects" explainer (header button → "How records connect" panel).
