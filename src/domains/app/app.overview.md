`src/domains/app/`

# App (the app's own records)

## Purpose

The organization's own records for the launch iteration (`iterations/launch-2026-09-30-jxmr/`), served
under `/api/v1/app` and stored in the Postgres `app` schema. It starts with the branches an organization
works from and who works in each; patients, appointments, billing and the rest join it row by row
as the launch's ROUTE builds them.

## Key invariants

- Every table is organization-scoped: ENABLE + FORCE RLS on the signed `org` claim; routes carry no
  organization segment.
- Permission codes are per resource (`branch:read|create|update|delete`, `app.permissions.ts`),
  granted to TEAM owners and the Admin role by default.
- Everyday reads every member needs (`GET /app/branches/my`) are gated by `organization:read` only;
  management routes by the resource's codes.
- A person's branches are `app.branch_members` rows on their membership (D9) — an ended
  membership's rows stay but drop out of every list (D57); a restore brings them back.

## Sub-domains

| Sub-domain | Tables | Routes |
| --- | --- | --- |
| [branches](sub-domains/branches/branches.overview.md) | `app.branches`; nested `app.branch_members`, `app.branch_rooms`, `app.branch_machines`, `app.branch_holidays` | `/app/branches`, `/app/branches/my`, `/app/branches/{branch_id}`, `/app/branches/{branch_id}/{members,rooms,machines,holidays}…` |
| [memberships](sub-domains/memberships/memberships.overview.md) | reads `tenancy.memberships` (the team picker and member directory); nested `app.membership_preferences`, `app.membership_preference_branches`, `app.membership_saved_views` | `/app/memberships`, `/app/memberships/me/{preferences,saved-views…}` |
| [offerings](sub-domains/offerings/offerings.overview.md) | `app.offerings`; nested `app.offering_groups`, `app.offers` | `/app/offerings…`, `/app/offering-groups…`, `/app/offers…` |
| [contacts](sub-domains/contacts/contacts.overview.md) | `app.contacts`, `app.contact_phones`; nested `app.contact_members`, `app.contact_activities`, `app.contact_message_templates` | `/app/contacts…`, `/app/contacts/{contact_id}/{members,activities…}`, `/app/contact-message-templates…` |
| [leads](sub-domains/leads/leads.overview.md) | `app.leads`, `app.lead_involved_memberships` | `/app/leads…` |
| [appointments](sub-domains/appointments/appointments.overview.md) | `app.appointments` (the visit merged in) | `/app/appointments…` |
| [patients](sub-domains/patients/patients.overview.md) | `app.patients`; nested `app.patient_clinical_notes`, `app.patient_prescriptions`, `app.prescription_kits`, `app.patient_diagnoses`, `app.patient_images`, `app.patient_reports`, `app.patient_treatments`, `app.patient_check_ins`, `app.patient_reviews`, `app.patient_feedback_actions`, `app.patient_offerings`, `app.patient_offering_suggestions` | `/app/patients…`, `/app/patients/{patient_id}/{clinical-notes,prescriptions,images,reports,treatments,check-ins,reviews,offerings,offering-suggestions}…`, `/app/patient-prescriptions`, `/app/patient-treatments`, `/app/prescription-kits…`, `/app/patient-diagnoses…` |
| [billing](sub-domains/billing/billing.overview.md) | nested `app.invoices`, `app.invoice_items`, `app.invoice_members`, `app.invoice_credit_notes`, `app.payments`, `app.payment_edits`, `app.pending_credits`, `app.day_closes`, `app.day_close_events`; the day auto-close worker (WC-39) | `/app/invoices…`, `/app/invoices/{invoice_id}/credit-notes…`, `/app/invoice-credit-notes`, `/app/payments…`, `/app/pending-credits…`, `/app/day-closes…` |

## Patterns used

- [tenant-isolation](../../PATTERNS.md#tenant-isolation)
- [rls-context](../../PATTERNS.md#rls-context)
- [audit-emission](../../PATTERNS.md#audit-emission)
- [soft-delete](../../PATTERNS.md#soft-delete)

## Cross-domain flows

- [organization-switch-and-capability-discovery-flow](../../FLOWS.md#organization-switch-and-capability-discovery-flow) — the active organization (the `org` claim) scopes every app route.
- Reads tenancy through `OrganizationService` and `MembershipService` only (never their repositories).
