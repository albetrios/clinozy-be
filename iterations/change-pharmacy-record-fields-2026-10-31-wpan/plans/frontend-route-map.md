# Frontend route map — change-pharmacy-record-fields-2026-10-31-wpan

For the frontend: what changed in the API for this iteration's design drop, each design operation's
route, every route the API has, and the design features the backend dropped.

Section 3 is generated — `pnpm iteration:frontend-map change-pharmacy-record-fields-2026-10-31-wpan` rewrites it from `docs/routes.txt`, the
OpenAPI document and `plans/routes-final.md`. Write sections 1, 2 and 4 by hand.

## 1. What changes on every call

No route is added or removed and no header, gate or status changes. Fields are added to existing
bodies and responses (backend `plans/route-changes.md`):

- **Units:** a medicine's `quantity`, `min_stock`, `max_stock`, a batch's `quantity`, a sale line's,
  a return's and a supplier credit's `quantity` count **units** — a pack while `units_per_pack` is 1
  (every medicine today). An order line's `quantity`, `free_quantity`, `rate` and every MRP stay per
  pack.
- **Medicine:** `hsn_code`, `pack_label`, `units_per_pack`; `batches[].mrp`. Changing
  `units_per_pack` with stock is a 409 `medicine_has_stock`.
- **Supplier:** `email`, `address`.
- **Purchase order:** `note` (the one field a received order still changes); `items[].mrp`; receive
  takes each line's `mrp` and the `note`.
- **Sale and bill lines:** `hsn_code`, `pack_size` (the pack label); a sale line's `rate` is the
  unit price — the batch's MRP (else the medicine's) over `units_per_pack`, rounded down; sale lines
  also carry `units_per_pack`.

## 2. Each design operation → its route

| Screen | Design operation | Route(s) | Notes |
| --- | --- | --- | --- |
| Medicine drawer | HSN, Pack, Units per pack; batch MRP | `POST /app/medicines`, `PATCH /app/medicines/{medicine_id}` | units per pack locked while stocked (409) |
| Medicines tab | stock in packs + loose; HSN and pack | `GET /app/medicines` | `quantity` is units |
| Supplier drawer | Email, Address | `POST /app/suppliers`, `PATCH /app/suppliers/{supplier_id}` | — |
| Purchase order drawer | Note; line MRP | `POST /app/medical-purchase-orders`, `PATCH …/{medical_purchase_order_id}` | a received order: `note` only |
| Receive goods | line MRP; note | `POST …/{medical_purchase_order_id}/receive` | adds `(quantity + free) × units_per_pack` units |
| New sale | sell in units | `POST /app/medical-sales` | the line rate is per unit |
| Sale view, bill view | pack and HSN on each line | `GET /app/medical-sales/{medical_sale_id}`, `GET /app/invoices/{invoice_id}` | `pack_size`, `hsn_code` |
| Expiring return | quantity in units | `POST /app/suppliers/{supplier_id}/credits` | priced per unit |

## 3. Every available route

<!-- GENERATED:START -->

449 routes, 312 of them the clinic's under `/api/v1/app`, from `docs/routes.txt`.
Paths drop `/api/v1`; the health and operations routes in the last module sit outside it.
**Gate**: a permission code, `signed in`, `public`, `platform admin` or a token. **Idem** `req`:
`X-Idempotency-Key` required. **Team** `team`: team organizations only (`422` on a personal one).
**#**: the route review number (blank where the review does not name the route). Success is `200`,
or `204` for a `DELETE`. **What it does** is the OpenAPI summary.

| Module | Routes |
| --- | --- |
| [Session and account](#session-and-account) | 49 |
| [Organization and team](#organization-and-team) | 52 |
| [Branches and places](#branches-and-places) | 25 |
| [Offerings](#offerings) | 19 |
| [Contacts and messaging](#contacts-and-messaging) | 22 |
| [Leads](#leads) | 9 |
| [Appointments](#appointments) | 20 |
| [Patients](#patients) | 74 |
| [Billing — invoices, payments, credits, day close](#billing--invoices-payments-credits-day-close) | 34 |
| [Clinic stock](#clinic-stock) | 28 |
| [Tasks](#tasks) | 12 |
| [Medical store](#medical-store) | 57 |
| [Files](#files) | 4 |
| [Notifications and webhooks](#notifications-and-webhooks) | 14 |
| [Subscription billing (the platform)](#subscription-billing-the-platform) | 13 |
| [Platform administration and operations](#platform-administration-and-operations) | 17 |

### Session and account

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/email/login` | public |  |  |  | Log in with an email verification code |
| POST | `/auth/email/send-code` | public |  |  |  | Send email sign-in code |
| POST | `/auth/login` | public |  |  |  | Login with email and password |
| POST | `/auth/logout` | token (access-token) |  |  |  | Logout current session |
| GET | `/auth/me/auth-methods` | signed in |  |  |  | List my auth methods |
| POST | `/auth/me/auth-methods` | signed in |  |  |  | Add auth method |
| DELETE | `/auth/me/auth-methods/:auth_method_id` | signed in |  |  |  | Remove auth method |
| GET | `/auth/me/context` | signed in |  |  |  | Get my session context |
| GET | `/auth/me/mfa` | signed in |  |  |  | List enrolled MFA methods |
| DELETE | `/auth/me/mfa/:mfa_method_id` | signed in |  |  |  | Remove MFA method |
| POST | `/auth/me/mfa/enroll` | signed in |  |  |  | Begin MFA enrollment (phase 1 of 2) |
| POST | `/auth/me/mfa/enroll/confirm` | signed in |  |  |  | Confirm MFA enrollment (phase 2 of 2) |
| POST | `/auth/me/mfa/verify` | signed in |  |  |  | Verify MFA code |
| GET | `/auth/me/sessions` | signed in |  |  |  | List my active sessions |
| DELETE | `/auth/me/sessions` | signed in |  |  |  | Revoke all sessions |
| DELETE | `/auth/me/sessions/:session_id` | signed in |  |  |  | Revoke a specific session |
| GET | `/auth/me/webauthn/credentials` | signed in |  |  |  | List registered passkeys |
| DELETE | `/auth/me/webauthn/credentials/:credential_id` | signed in |  |  |  | Revoke a passkey |
| POST | `/auth/me/webauthn/register/options` | signed in |  |  |  | Begin passkey registration |
| POST | `/auth/me/webauthn/register/verify` | signed in |  |  |  | Complete passkey registration |
| POST | `/auth/mfa/login` | public |  |  |  | Complete MFA during login |
| GET | `/auth/oauth/:provider` | public |  |  |  | Initiate OAuth flow |
| GET | `/auth/oauth/:provider/callback` | public |  |  |  | OAuth callback |
| GET | `/auth/oauth/providers` | public |  |  |  | List available OAuth providers |
| POST | `/auth/password/change` | signed in |  |  |  | Change current password |
| POST | `/auth/password/forgot` | public |  |  |  | Request password reset |
| POST | `/auth/password/reset` | public |  |  |  | Reset password with token |
| POST | `/auth/refresh` | token (session-cookie) |  |  |  | Refresh access token |
| POST | `/auth/step-up` | signed in |  |  |  | Step-up (re-authenticate) |
| POST | `/auth/switch-to-organization` | signed in |  |  |  | Switch active organization |
| POST | `/auth/switch-to-personal` | signed in |  |  |  | Switch to personal organization |
| POST | `/auth/webauthn/authenticate/options` | public |  |  |  | Begin passkey authentication |
| POST | `/auth/webauthn/authenticate/verify` | public |  |  |  | Complete passkey authentication |
| GET | `/users/me` | signed in |  |  |  | Get current user profile |
| PATCH | `/users/me` | signed in |  |  |  | Update current user profile |
| DELETE | `/users/me` | signed in |  |  |  | Delete my account |
| PUT | `/users/me/avatar` | signed in |  |  |  | Upload avatar |
| DELETE | `/users/me/avatar` | signed in |  |  |  | Remove avatar |
| POST | `/users/me/bug-reports` | signed in |  |  |  | Report a bug |
| POST | `/users/me/data-export` | signed in |  |  |  | Request GDPR data export |
| GET | `/users/me/data-export/:data_export_id` | signed in |  |  |  | Get GDPR data export status |
| GET | `/users/me/membership-invitations` | signed in |  |  |  | List my invitations |
| GET | `/users/me/notification-preferences` | signed in |  |  |  | Get my notification preferences |
| PUT | `/users/me/notification-preferences` | signed in |  |  |  | Replace notification preferences |
| POST | `/users/me/onboarding/complete` | signed in |  |  |  | Mark onboarding complete |
| GET | `/users/me/organizations` | signed in |  |  |  | List my organizations |
| PUT | `/users/me/presence` | signed in |  |  |  | Set my presence |
| GET | `/users/me/settings` | signed in |  |  |  | Get my settings |
| PATCH | `/users/me/settings` | signed in |  |  |  | Update my settings |

### Organization and team

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/memberships` | `organization:read` |  |  |  | List memberships (picker) |
| GET | `/app/memberships/me/preferences` | `organization:read` |  |  |  | Get my preferences |
| PATCH | `/app/memberships/me/preferences` | `organization:read` |  |  |  | Save my preferences |
| GET | `/app/memberships/me/saved-views` | `organization:read` |  |  |  | List my saved views |
| POST | `/app/memberships/me/saved-views` | `organization:read` | req |  |  | Save a view |
| GET | `/app/memberships/me/saved-views/:membership_saved_view_id` | `organization:read` |  |  |  | Get my saved view |
| PATCH | `/app/memberships/me/saved-views/:membership_saved_view_id` | `organization:read` |  |  |  | Update my saved view |
| DELETE | `/app/memberships/me/saved-views/:membership_saved_view_id` | `organization:read` |  |  |  | Remove my saved view |
| GET | `/app/roles` | `organization:read` |  |  |  | List roles (directory) |
| POST | `/tenancy/membership-invitations/:membership_invitation_id/accept` | signed in | req |  |  | Accept invitation |
| POST | `/tenancy/membership-invitations/:membership_invitation_id/decline` | signed in | req |  |  | Decline invitation |
| GET | `/tenancy/organization` | signed in |  |  |  | Get active organization |
| PATCH | `/tenancy/organization` | `organization:update` |  |  |  | Update organization |
| DELETE | `/tenancy/organization` | `organization:delete` |  | team |  | Delete organization |
| GET | `/tenancy/organization/api-keys` | `api-key:read` |  |  |  | List API keys |
| POST | `/tenancy/organization/api-keys` | `api-key:manage` | req |  |  | Create API key |
| GET | `/tenancy/organization/api-keys/:api_key_id` | `api-key:read` |  |  |  | Get API key |
| PATCH | `/tenancy/organization/api-keys/:api_key_id` | `api-key:manage` |  |  |  | Update API key |
| DELETE | `/tenancy/organization/api-keys/:api_key_id` | `api-key:manage` |  |  |  | Delete API key |
| POST | `/tenancy/organization/api-keys/:api_key_id/rotate` | `api-key:manage` |  |  |  | Rotate API key |
| GET | `/tenancy/organization/audit-logs` | `audit-log:read` |  |  |  | List organization audit logs |
| POST | `/tenancy/organization/leave` | signed in |  |  |  | Leave organization |
| PUT | `/tenancy/organization/logo` | `organization:update` |  |  |  | Upload organization logo |
| DELETE | `/tenancy/organization/logo` | `organization:update` |  |  |  | Remove organization logo |
| GET | `/tenancy/organization/memberships` | `membership:read` |  |  |  | List memberships |
| POST | `/tenancy/organization/memberships` | `membership:create` | req | team |  | Add member by email |
| GET | `/tenancy/organization/memberships/:membership_id` | `membership:read` |  |  |  | Get membership |
| PATCH | `/tenancy/organization/memberships/:membership_id` | `membership:update` |  |  |  | Update membership |
| DELETE | `/tenancy/organization/memberships/:membership_id` | `membership:delete` |  |  |  | Remove membership |
| DELETE | `/tenancy/organization/memberships/:membership_id/invitation` | `membership:delete` |  |  |  | Revoke invitation |
| POST | `/tenancy/organization/memberships/:membership_id/invitation/resend` | `membership:update` | req |  |  | Resend invitation |
| GET | `/tenancy/organization/memberships/:membership_id/permissions` | `membership:read` |  |  |  | Get membership permissions |
| POST | `/tenancy/organization/memberships/:membership_id/restore` | `membership:delete` | req | team |  | Restore membership |
| GET | `/tenancy/organization/notification-policies` | `notification-policy:read` |  |  |  | List notification policies |
| POST | `/tenancy/organization/notification-policies` | `notification-policy:manage` | req |  |  | Create notification policy |
| GET | `/tenancy/organization/notification-policies/:notification_policy_id` | `notification-policy:read` |  |  |  | Get notification policy |
| PATCH | `/tenancy/organization/notification-policies/:notification_policy_id` | `notification-policy:manage` |  |  |  | Update notification policy |
| DELETE | `/tenancy/organization/notification-policies/:notification_policy_id` | `notification-policy:manage` |  |  |  | Delete notification policy |
| GET | `/tenancy/organization/roles` | `role:read` |  |  |  | List roles |
| POST | `/tenancy/organization/roles` | `role:create` | req | team |  | Create role |
| GET | `/tenancy/organization/roles/:role_id` | `role:read` |  |  |  | Get role |
| PATCH | `/tenancy/organization/roles/:role_id` | `role:update` |  |  |  | Update role |
| DELETE | `/tenancy/organization/roles/:role_id` | `role:delete` |  |  |  | Delete role |
| GET | `/tenancy/organization/roles/:role_id/permissions` | `role:read` |  |  |  | List role permissions |
| PUT | `/tenancy/organization/roles/:role_id/permissions` | `role:update` |  |  |  | Replace role permissions |
| POST | `/tenancy/organization/roles/:role_id/restore` | `role:delete` | req |  |  | Restore role |
| GET | `/tenancy/organization/settings` | `organization:read` |  |  |  | Get organization settings |
| PATCH | `/tenancy/organization/settings` | `organization:update` |  |  |  | Update organization settings |
| POST | `/tenancy/organization/transfer-ownership` | signed in | req | team |  | Transfer organization ownership |
| POST | `/tenancy/organizations` | signed in | req |  |  | Create organization |
| GET | `/tenancy/organizations/by-slug/:slug` | signed in |  |  |  | Get organization by slug |
| GET | `/tenancy/permissions` | signed in |  |  |  | List all permissions |

### Branches and places

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/branches` | `branch:read` |  |  |  | List branches |
| POST | `/app/branches` | `branch:create` | req |  |  | Create branch |
| GET | `/app/branches/:branch_id` | `branch:read` |  |  |  | Get branch |
| PATCH | `/app/branches/:branch_id` | `branch:update` |  |  |  | Update branch |
| GET | `/app/branches/:branch_id/holidays` | `organization:read` |  |  |  | List a branch's branch holidays |
| POST | `/app/branches/:branch_id/holidays` | `branch:create` | req |  |  | Add a branch holiday |
| GET | `/app/branches/:branch_id/holidays/:branch_holiday_id` | `organization:read` |  |  |  | Get branch holiday |
| PATCH | `/app/branches/:branch_id/holidays/:branch_holiday_id` | `branch:update` |  |  |  | Update branch holiday |
| DELETE | `/app/branches/:branch_id/holidays/:branch_holiday_id` | `branch:delete` |  |  |  | Delete branch holiday |
| POST | `/app/branches/:branch_id/holidays/:branch_holiday_id/restore` | `branch:delete` | req |  |  | Restore branch holiday |
| GET | `/app/branches/:branch_id/machines` | `organization:read` |  |  |  | List a branch's machines |
| POST | `/app/branches/:branch_id/machines` | `branch:create` | req |  |  | Add a machine |
| GET | `/app/branches/:branch_id/machines/:branch_machine_id` | `organization:read` |  |  |  | Get machine |
| PATCH | `/app/branches/:branch_id/machines/:branch_machine_id` | `branch:update` |  |  |  | Update machine |
| DELETE | `/app/branches/:branch_id/machines/:branch_machine_id` | `branch:delete` |  |  |  | Delete machine |
| POST | `/app/branches/:branch_id/machines/:branch_machine_id/restore` | `branch:delete` | req |  |  | Restore machine |
| GET | `/app/branches/:branch_id/members` | `branch:update` |  |  |  | List branch members |
| PUT | `/app/branches/:branch_id/members` | `branch:update` |  |  |  | Replace branch members |
| GET | `/app/branches/:branch_id/rooms` | `organization:read` |  |  |  | List a branch's rooms |
| POST | `/app/branches/:branch_id/rooms` | `branch:create` | req |  |  | Add a room |
| GET | `/app/branches/:branch_id/rooms/:branch_room_id` | `organization:read` |  |  |  | Get room |
| PATCH | `/app/branches/:branch_id/rooms/:branch_room_id` | `branch:update` |  |  |  | Update room |
| DELETE | `/app/branches/:branch_id/rooms/:branch_room_id` | `branch:delete` |  |  |  | Delete room |
| POST | `/app/branches/:branch_id/rooms/:branch_room_id/restore` | `branch:delete` | req |  |  | Restore room |
| GET | `/app/branches/my` | `organization:read` |  |  |  | List my branches |

### Offerings

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/offering-groups` | `organization:read` |  |  |  | List offering groups |
| POST | `/app/offering-groups` | `offering:create` | req |  |  | Create offering group |
| GET | `/app/offering-groups/:offering_group_id` | `organization:read` |  |  |  | Get offering group |
| PATCH | `/app/offering-groups/:offering_group_id` | `offering:update` |  |  |  | Update offering group |
| DELETE | `/app/offering-groups/:offering_group_id` | `offering:delete` |  |  |  | Delete offering group |
| POST | `/app/offering-groups/:offering_group_id/restore` | `offering:delete` | req |  |  | Restore offering group |
| GET | `/app/offerings` | `organization:read` |  |  |  | List offerings |
| POST | `/app/offerings` | `offering:create` | req |  |  | Create offering |
| GET | `/app/offerings/:offering_id` | `organization:read` |  |  |  | Get offering |
| PATCH | `/app/offerings/:offering_id` | `offering:update` |  |  |  | Update offering |
| DELETE | `/app/offerings/:offering_id` | `offering:delete` |  |  |  | Delete offering |
| POST | `/app/offerings/:offering_id/restore` | `offering:delete` | req |  |  | Restore offering |
| GET | `/app/offerings/exports` | `offering:export` |  |  |  | Export offerings |
| GET | `/app/offers` | `organization:read` |  |  |  | List offers |
| POST | `/app/offers` | `offering:create` | req |  |  | Create offer |
| GET | `/app/offers/:offer_id` | `organization:read` |  |  |  | Get offer |
| PATCH | `/app/offers/:offer_id` | `offering:update` |  |  |  | Update offer |
| DELETE | `/app/offers/:offer_id` | `offering:delete` |  |  |  | Delete offer |
| POST | `/app/offers/:offer_id/restore` | `offering:delete` | req |  |  | Restore offer |

### Contacts and messaging

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/app/contact-activities/message-batches` | `contact_activity:create` | req |  |  | Send contact message batch |
| GET | `/app/contact-message-templates` | `organization:read` |  |  |  | List contact message templates |
| POST | `/app/contact-message-templates` | `contact_activity:create` | req |  |  | Create contact message template |
| GET | `/app/contact-message-templates/:contact_message_template_id` | `organization:read` |  |  |  | Get contact message template |
| PATCH | `/app/contact-message-templates/:contact_message_template_id` | `contact_activity:update` |  |  |  | Update contact message template |
| DELETE | `/app/contact-message-templates/:contact_message_template_id` | `contact_activity:delete` |  |  |  | Delete contact message template |
| POST | `/app/contact-message-templates/:contact_message_template_id/restore` | `contact_activity:delete` | req |  |  | Restore contact message template |
| GET | `/app/contacts` | `contact:read` |  |  |  | List contacts |
| POST | `/app/contacts` | `contact:create` | req |  |  | Create contact |
| GET | `/app/contacts/:contact_id` | `contact:read` |  |  |  | Get contact |
| PATCH | `/app/contacts/:contact_id` | `contact:update` |  |  |  | Update contact |
| DELETE | `/app/contacts/:contact_id` | `contact:delete` |  |  |  | Delete contact |
| GET | `/app/contacts/:contact_id/activities` | `contact_activity:read` |  |  |  | List contact activities |
| GET | `/app/contacts/:contact_id/activities/:contact_activity_id` | `contact_activity:read` |  |  |  | Get contact activity |
| POST | `/app/contacts/:contact_id/activities/:contact_activity_id/resend` | `contact_activity:update` | req |  |  | Resend contact message |
| POST | `/app/contacts/:contact_id/activities/add-note` | `contact_activity:create` | req |  |  | Add contact note |
| POST | `/app/contacts/:contact_id/activities/log-call` | `contact_activity:create` | req |  |  | Log contact call |
| POST | `/app/contacts/:contact_id/activities/send-message` | `contact_activity:create` | req |  |  | Send contact message |
| GET | `/app/contacts/:contact_id/members` | `contact:read` |  |  |  | List contact members |
| PUT | `/app/contacts/:contact_id/members` | `contact:update` |  |  |  | Replace contact members |
| GET | `/app/contacts/:contact_id/preview` | `contact:read` |  |  |  | Preview contact |
| POST | `/app/contacts/:contact_id/restore` | `contact:delete` | req |  |  | Restore contact |

### Leads

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/leads` | `lead:read` |  |  |  | List leads |
| POST | `/app/leads` | `lead:create` | req |  |  | Create lead |
| GET | `/app/leads/:lead_id` | `lead:read` |  |  |  | Get lead |
| PATCH | `/app/leads/:lead_id` | `lead:update` |  |  |  | Update lead |
| DELETE | `/app/leads/:lead_id` | `lead:delete` |  |  |  | Delete lead |
| POST | `/app/leads/:lead_id/claim` | `lead:update` | req |  |  | Claim lead |
| POST | `/app/leads/:lead_id/release` | `lead:update` | req |  |  | Release lead |
| POST | `/app/leads/:lead_id/restore` | `lead:delete` | req |  |  | Restore lead |
| GET | `/app/leads/exports` | `lead:export` |  |  |  | Export leads |

### Appointments

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/appointments` | `appointment:read` |  |  |  | List appointments |
| POST | `/app/appointments` | `appointment:create` | req |  |  | Book an appointment |
| GET | `/app/appointments/:appointment_id` | `appointment:read` |  |  |  | Get appointment |
| PATCH | `/app/appointments/:appointment_id` | `appointment:update` |  |  |  | Change or move appointment |
| DELETE | `/app/appointments/:appointment_id` | `appointment:delete` |  |  |  | Delete appointment |
| POST | `/app/appointments/:appointment_id/cancel` | `appointment:update` | req |  |  | Cancel appointment |
| POST | `/app/appointments/:appointment_id/check-in` | `appointment:update` | req |  |  | Check in |
| POST | `/app/appointments/:appointment_id/complete` | `appointment:update` | req |  |  | Complete appointment |
| POST | `/app/appointments/:appointment_id/confirm` | `appointment:update` | req |  |  | Confirm appointment |
| POST | `/app/appointments/:appointment_id/copy` | `appointment:create` | req |  |  | Copy appointment |
| POST | `/app/appointments/:appointment_id/no-show` | `appointment:update` | req |  |  | Mark no-show |
| POST | `/app/appointments/:appointment_id/pause` | `appointment:update` | req |  |  | Pause visit |
| POST | `/app/appointments/:appointment_id/reinstate` | `appointment:update` | req |  |  | Reinstate appointment |
| POST | `/app/appointments/:appointment_id/restore` | `appointment:delete` | req |  |  | Restore appointment |
| POST | `/app/appointments/:appointment_id/resume` | `appointment:update` | req |  |  | Resume visit |
| POST | `/app/appointments/:appointment_id/stage` | `appointment:update` | req |  |  | Move floor stage |
| POST | `/app/appointments/:appointment_id/undo-check-in` | `appointment:update` | req |  |  | Undo check-in |
| GET | `/app/appointments/daily-counts` | `appointment:read` |  |  |  | Daily appointment counts |
| GET | `/app/appointments/exports` | `appointment:export` |  |  |  | Export appointments |
| GET | `/app/appointments/slots` | `appointment:read` |  |  |  | Free slots for a day |

### Patients

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/patient-diagnoses` | `organization:read` |  |  |  | List the diagnosis catalogue |
| POST | `/app/patient-diagnoses` | `patient_prescription:create` | req |  |  | Add a diagnosis |
| GET | `/app/patient-diagnoses/:patient_diagnosis_id` | `organization:read` |  |  |  | Get a diagnosis |
| PATCH | `/app/patient-diagnoses/:patient_diagnosis_id` | `patient_prescription:update` |  |  |  | Rename a diagnosis |
| DELETE | `/app/patient-diagnoses/:patient_diagnosis_id` | `patient_prescription:delete` |  |  |  | Delete a diagnosis |
| POST | `/app/patient-diagnoses/:patient_diagnosis_id/restore` | `patient_prescription:delete` | req |  |  | Restore a diagnosis |
| GET | `/app/patient-prescriptions` | `patient_prescription:read` |  |  |  | List prescriptions — the pharmacy queue |
| GET | `/app/patient-treatments` | `patient_treatment:read` |  |  |  | List every patient's treatments |
| GET | `/app/patients` | `patient:read` |  |  |  | List patients |
| POST | `/app/patients` | `patient:create` | req |  |  | Create patient |
| GET | `/app/patients/:patient_id` | `patient:read` |  |  |  | Get patient |
| PATCH | `/app/patients/:patient_id` | `patient:update` |  |  |  | Update patient |
| DELETE | `/app/patients/:patient_id` | `patient:delete` |  |  |  | Delete patient |
| GET | `/app/patients/:patient_id/check-ins` | `patient:read` |  |  |  | List a patient's check-ins |
| POST | `/app/patients/:patient_id/check-ins` | `patient:update` | req |  |  | Log a check-in |
| GET | `/app/patients/:patient_id/check-ins/:patient_check_in_id` | `patient:read` |  |  |  | Get a check-in |
| PATCH | `/app/patients/:patient_id/check-ins/:patient_check_in_id` | `patient:update` |  |  |  | Change a check-in |
| DELETE | `/app/patients/:patient_id/check-ins/:patient_check_in_id` | `patient:update` |  |  |  | Delete a check-in |
| POST | `/app/patients/:patient_id/check-ins/:patient_check_in_id/actions` | `patient:update` | req |  |  | Log a check-in action |
| POST | `/app/patients/:patient_id/check-ins/:patient_check_in_id/restore` | `patient:update` | req |  |  | Restore a check-in |
| GET | `/app/patients/:patient_id/clinical-notes` | `patient:clinical_record:read` |  |  |  | List a patient's clinical notes |
| POST | `/app/patients/:patient_id/clinical-notes` | `patient:update` + `patient:clinical_record:read` | req |  |  | Add a clinical note |
| GET | `/app/patients/:patient_id/clinical-notes/:patient_clinical_note_id` | `patient:clinical_record:read` |  |  |  | Get a clinical note |
| DELETE | `/app/patients/:patient_id/clinical-notes/:patient_clinical_note_id` | `patient:update` + `patient:clinical_record:read` |  |  |  | Delete a clinical note |
| POST | `/app/patients/:patient_id/clinical-notes/:patient_clinical_note_id/restore` | `patient:update` + `patient:clinical_record:read` | req |  |  | Restore a clinical note |
| GET | `/app/patients/:patient_id/images` | `patient:clinical_record:read` |  |  |  | List a patient's photos |
| POST | `/app/patients/:patient_id/images` | `patient:update` + `patient:clinical_record:read` | req |  |  | Add a photo |
| GET | `/app/patients/:patient_id/images/:patient_image_id` | `patient:clinical_record:read` |  |  |  | Get a photo |
| PATCH | `/app/patients/:patient_id/images/:patient_image_id` | `patient:update` + `patient:clinical_record:read` |  |  |  | Change or move a photo |
| DELETE | `/app/patients/:patient_id/images/:patient_image_id` | `patient:update` + `patient:clinical_record:read` |  |  |  | Delete a photo |
| POST | `/app/patients/:patient_id/images/:patient_image_id/restore` | `patient:update` + `patient:clinical_record:read` | req |  |  | Restore a photo |
| GET | `/app/patients/:patient_id/offering-ideas` | `patient:read` |  |  |  | A patient's ideas from history |
| GET | `/app/patients/:patient_id/offering-suggestions` | `patient:read` |  |  |  | List a patient's plan |
| POST | `/app/patients/:patient_id/offering-suggestions` | `patient:update` | req |  |  | Add to the plan |
| GET | `/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id` | `patient:read` |  |  |  | Get a plan row |
| PATCH | `/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id` | `patient:update` |  |  |  | Change a plan row |
| DELETE | `/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id` | `patient:update` |  |  |  | Remove from the plan |
| POST | `/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id/restore` | `patient:update` | req |  |  | Restore a plan row |
| GET | `/app/patients/:patient_id/offerings` | `patient:read` |  |  |  | List what a patient bought |
| GET | `/app/patients/:patient_id/offerings/:patient_offering_id` | `patient:read` |  |  |  | Get a bought offering |
| PATCH | `/app/patients/:patient_id/offerings/:patient_offering_id` | `payment:update` |  |  |  | Change a bought offering |
| GET | `/app/patients/:patient_id/prescriptions` | `patient_prescription:read` |  |  |  | List a patient's prescriptions |
| POST | `/app/patients/:patient_id/prescriptions` | `patient_prescription:create` | req |  |  | Write a prescription |
| GET | `/app/patients/:patient_id/prescriptions/:patient_prescription_id` | `patient_prescription:read` |  |  |  | Get a prescription |
| PATCH | `/app/patients/:patient_id/prescriptions/:patient_prescription_id` | `patient_prescription:update` |  |  |  | Change a draft prescription |
| DELETE | `/app/patients/:patient_id/prescriptions/:patient_prescription_id` | `patient_prescription:delete` |  |  |  | Delete a draft prescription |
| POST | `/app/patients/:patient_id/prescriptions/:patient_prescription_id/approve` | `patient_prescription:update` | req |  |  | Approve a prescription |
| POST | `/app/patients/:patient_id/prescriptions/:patient_prescription_id/restore` | `patient_prescription:delete` | req |  |  | Restore a draft prescription |
| GET | `/app/patients/:patient_id/reports` | `patient:clinical_record:read` |  |  |  | List a patient's reports |
| POST | `/app/patients/:patient_id/reports` | `patient:update` + `patient:clinical_record:read` | req |  |  | Add a report |
| GET | `/app/patients/:patient_id/reports/:patient_report_id` | `patient:clinical_record:read` |  |  |  | Get a report |
| PATCH | `/app/patients/:patient_id/reports/:patient_report_id` | `patient:update` + `patient:clinical_record:read` |  |  |  | Change a report |
| DELETE | `/app/patients/:patient_id/reports/:patient_report_id` | `patient:update` + `patient:clinical_record:read` |  |  |  | Delete a report |
| POST | `/app/patients/:patient_id/reports/:patient_report_id/restore` | `patient:update` + `patient:clinical_record:read` | req |  |  | Restore a report |
| POST | `/app/patients/:patient_id/restore` | `patient:delete` | req |  |  | Restore patient |
| GET | `/app/patients/:patient_id/reviews` | `patient:read` |  |  |  | List a patient's reviews |
| POST | `/app/patients/:patient_id/reviews` | `patient_review:create` | req |  |  | Log a review |
| GET | `/app/patients/:patient_id/reviews/:patient_review_id` | `patient:read` |  |  |  | Get a review |
| PATCH | `/app/patients/:patient_id/reviews/:patient_review_id` | `patient_review:update` |  |  |  | Change a review |
| DELETE | `/app/patients/:patient_id/reviews/:patient_review_id` | `patient_review:delete` |  |  |  | Delete a review |
| POST | `/app/patients/:patient_id/reviews/:patient_review_id/actions` | `patient_review:update` | req |  |  | Log a review action |
| POST | `/app/patients/:patient_id/reviews/:patient_review_id/restore` | `patient_review:delete` | req |  |  | Restore a review |
| GET | `/app/patients/:patient_id/treatments` | `patient_treatment:read` |  |  |  | List a patient's treatments |
| POST | `/app/patients/:patient_id/treatments` | `patient_treatment:create` | req |  |  | Record a treatment session |
| GET | `/app/patients/:patient_id/treatments/:patient_treatment_id` | `patient_treatment:read` |  |  |  | Get a treatment session |
| PATCH | `/app/patients/:patient_id/treatments/:patient_treatment_id` | `patient_treatment:update` |  |  |  | Change a treatment session |
| POST | `/app/patients/:patient_id/treatments/:patient_treatment_id/reverse` | `patient_treatment:update` | req |  |  | Reverse a treatment session |
| GET | `/app/patients/exports` | `patient:export` |  |  |  | Export patients |
| GET | `/app/prescription-kits` | `patient_prescription:create` |  |  |  | List prescription kits |
| POST | `/app/prescription-kits` | `patient_prescription:create` | req |  |  | Create prescription kit |
| GET | `/app/prescription-kits/:prescription_kit_id` | `patient_prescription:create` |  |  |  | Get prescription kit |
| PATCH | `/app/prescription-kits/:prescription_kit_id` | `patient_prescription:create` |  |  |  | Update prescription kit |
| DELETE | `/app/prescription-kits/:prescription_kit_id` | `patient_prescription:create` |  |  |  | Delete prescription kit |
| POST | `/app/prescription-kits/:prescription_kit_id/restore` | `patient_prescription:create` | req |  |  | Restore prescription kit |

### Billing — invoices, payments, credits, day close

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/day-closes` | `payment:read` |  |  |  | List day closes |
| POST | `/app/day-closes` | `payment:update` | req |  |  | Open the day |
| GET | `/app/day-closes/:day_close_id` | `payment:read` |  |  |  | Get a day close |
| POST | `/app/day-closes/:day_close_id/close` | `payment:update` | req |  |  | Close the day |
| POST | `/app/day-closes/:day_close_id/reopen` | `payment:delete` | req |  |  | Reopen a closed day |
| GET | `/app/invoice-credit-notes` | `payment:read` |  |  |  | List credit notes |
| GET | `/app/invoices` | `payment:read` |  |  |  | List invoices |
| POST | `/app/invoices` | `payment:create` | req |  |  | Bill |
| GET | `/app/invoices/:invoice_id` | `payment:read` |  |  |  | Get an invoice |
| PATCH | `/app/invoices/:invoice_id` | `payment:update` |  |  |  | Change an invoice |
| DELETE | `/app/invoices/:invoice_id` | `payment:delete` |  |  |  | Delete an unpaid invoice |
| GET | `/app/invoices/:invoice_id/credit-notes` | `payment:read` |  |  |  | List an invoice's credit notes |
| POST | `/app/invoices/:invoice_id/credit-notes` | `payment:delete` | req |  |  | Refund with a credit note |
| GET | `/app/invoices/:invoice_id/credit-notes/:invoice_credit_note_id` | `payment:read` |  |  |  | Get a credit note |
| POST | `/app/invoices/:invoice_id/preview` | `payment:update` |  |  |  | Preview a change to an invoice |
| POST | `/app/invoices/:invoice_id/restore` | `payment:delete` | req |  |  | Restore an invoice |
| GET | `/app/invoices/exports` | `payment:export` |  |  |  | Export invoices |
| POST | `/app/invoices/preview` | `payment:create` |  |  |  | Preview a bill |
| GET | `/app/payments` | `payment:read` |  |  |  | List payments |
| POST | `/app/payments` | `payment:create` | req |  |  | Receive or pay |
| GET | `/app/payments/:payment_id` | `payment:read` |  |  |  | Get a payment |
| PATCH | `/app/payments/:payment_id` | `payment:update` |  |  |  | Change a payment |
| DELETE | `/app/payments/:payment_id` | `payment:delete` |  |  |  | Delete a payment |
| GET | `/app/payments/:payment_id/edits` | `payment:read` |  |  |  | List a payment's changes |
| POST | `/app/payments/:payment_id/restore` | `payment:delete` | req |  |  | Restore a payment |
| POST | `/app/payments/:payment_id/reverse` | `payment:delete` | req |  |  | Reverse a settled payment |
| GET | `/app/payments/exports` | `payment:export` |  |  |  | Export payments |
| GET | `/app/pending-credits` | `payment:read` |  |  |  | List pending credits |
| POST | `/app/pending-credits` | `payment:create` | req |  |  | Add a pending credit |
| GET | `/app/pending-credits/:pending_credit_id` | `payment:read` |  |  |  | Get a pending credit |
| PATCH | `/app/pending-credits/:pending_credit_id` | `payment:update` |  |  |  | Change a pending credit |
| DELETE | `/app/pending-credits/:pending_credit_id` | `payment:delete` |  |  |  | Delete a pending credit |
| POST | `/app/pending-credits/:pending_credit_id/restore` | `payment:delete` | req |  |  | Restore a pending credit |
| POST | `/app/pending-credits/:pending_credit_id/settle` | `payment:create` | req |  |  | Settle a pending credit |

### Clinic stock

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/stock-counts` | `stock_item:read` |  |  |  | List stock counts |
| POST | `/app/stock-counts` | `stock_item:update` | req |  |  | Save a stock count |
| GET | `/app/stock-counts/:stock_count_id` | `stock_item:read` |  |  |  | Get a stock count |
| GET | `/app/stock-item-movements` | `stock_item:read` |  |  |  | List stock movements |
| GET | `/app/stock-items` | `stock_item:read` |  |  |  | List stock items |
| POST | `/app/stock-items` | `stock_item:create` | req |  |  | Add a stock item |
| GET | `/app/stock-items/:stock_item_id` | `stock_item:read` |  |  |  | Get a stock item |
| PATCH | `/app/stock-items/:stock_item_id` | `stock_item:update` |  |  |  | Change a stock item |
| DELETE | `/app/stock-items/:stock_item_id` | `stock_item:delete` |  |  |  | Delete a stock item |
| GET | `/app/stock-items/:stock_item_id/movements` | `stock_item:read` |  |  |  | List a stock item's movements |
| POST | `/app/stock-items/:stock_item_id/movements` | `stock_item:update` | req |  |  | Move stock |
| GET | `/app/stock-items/:stock_item_id/movements/:stock_item_movement_id` | `stock_item:read` |  |  |  | Get a stock movement |
| POST | `/app/stock-items/:stock_item_id/movements/:stock_item_movement_id/revert` | `stock_item:update` | req |  |  | Revert a stock movement |
| POST | `/app/stock-items/:stock_item_id/restore` | `stock_item:delete` | req |  |  | Restore a stock item |
| GET | `/app/stock-items/exports` | `stock_item:export` |  |  |  | Export stock items |
| GET | `/app/stock-purchases` | `stock_item:read` |  |  |  | List stock purchases |
| POST | `/app/stock-purchases` | `stock_item:create` | req |  |  | Record a stock purchase |
| GET | `/app/stock-purchases/:stock_purchase_id` | `stock_item:read` |  |  |  | Get a stock purchase |
| PATCH | `/app/stock-purchases/:stock_purchase_id` | `stock_item:update` |  |  |  | Change a stock purchase |
| DELETE | `/app/stock-purchases/:stock_purchase_id` | `stock_item:delete` |  |  |  | Delete a stock purchase |
| POST | `/app/stock-purchases/:stock_purchase_id/restore` | `stock_item:delete` | req |  |  | Restore a stock purchase |
| GET | `/app/stock-purchases/exports` | `stock_item:export` |  |  |  | Export stock purchases |
| GET | `/app/stock-vendors` | `stock_item:read` |  |  |  | List stock vendors |
| POST | `/app/stock-vendors` | `stock_item:create` | req |  |  | Add a stock vendor |
| GET | `/app/stock-vendors/:stock_vendor_id` | `stock_item:read` |  |  |  | Get a stock vendor |
| PATCH | `/app/stock-vendors/:stock_vendor_id` | `stock_item:update` |  |  |  | Change a stock vendor |
| DELETE | `/app/stock-vendors/:stock_vendor_id` | `stock_item:delete` |  |  |  | Delete a stock vendor |
| POST | `/app/stock-vendors/:stock_vendor_id/restore` | `stock_item:delete` | req |  |  | Restore a stock vendor |

### Tasks

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/task-rule-settings` | `task:read` |  |  |  | List task rules |
| PUT | `/app/task-rule-settings` | `organization:update` |  |  |  | Save task rules |
| GET | `/app/tasks` | `task:read` |  |  |  | List tasks |
| POST | `/app/tasks` | `task:create` | req |  |  | Add a task |
| GET | `/app/tasks/:task_id` | `task:read` |  |  |  | Get a task |
| PATCH | `/app/tasks/:task_id` | `task:update` |  |  |  | Change a task |
| DELETE | `/app/tasks/:task_id` | `task:delete` |  |  |  | Delete a task |
| POST | `/app/tasks/:task_id/reassign` | `task:update` | req |  |  | Reassign a task |
| POST | `/app/tasks/:task_id/resolve` | `task:update` | req |  |  | Resolve a task |
| POST | `/app/tasks/:task_id/restore` | `task:delete` | req |  |  | Restore a task |
| POST | `/app/tasks/:task_id/snooze` | `task:update` | req |  |  | Snooze a task |
| GET | `/app/tasks/exports` | `task:export` |  |  |  | Export tasks |

### Medical store

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/manufacturers` | `medicine:read` |  |  |  | List manufacturers |
| POST | `/app/manufacturers` | `medicine:create` | req |  |  | Add a manufacturer |
| GET | `/app/manufacturers/:manufacturer_id` | `medicine:read` |  |  |  | Get a manufacturer |
| PATCH | `/app/manufacturers/:manufacturer_id` | `medicine:update` |  |  |  | Change a manufacturer |
| DELETE | `/app/manufacturers/:manufacturer_id` | `medicine:delete` |  |  |  | Delete a manufacturer |
| POST | `/app/manufacturers/:manufacturer_id/restore` | `medicine:delete` | req |  |  | Restore a manufacturer |
| GET | `/app/medical-payments` | `medicine:read` |  |  |  | List the medical store's payments |
| GET | `/app/medical-payments/exports` | `medicine:export` |  |  |  | Export the medical store's payments |
| GET | `/app/medical-pending-credits` | `medicine:read` |  |  |  | List the medical store's customer credits |
| GET | `/app/medical-purchase-orders` | `medicine:read` |  |  | 3.4 | List medical purchase orders |
| POST | `/app/medical-purchase-orders` | `medicine:create` | req |  | 3.1 | Create a medical purchase order |
| GET | `/app/medical-purchase-orders/:medical_purchase_order_id` | `medicine:read` |  |  | 3.5 | Get a medical purchase order |
| PATCH | `/app/medical-purchase-orders/:medical_purchase_order_id` | `medicine:update` |  |  | 3.2 | Change a medical purchase order |
| DELETE | `/app/medical-purchase-orders/:medical_purchase_order_id` | `medicine:delete` |  |  |  | Cancel a medical purchase order |
| POST | `/app/medical-purchase-orders/:medical_purchase_order_id/receive` | `medicine:update` | req |  | 3.3 | Receive a medical purchase order |
| POST | `/app/medical-purchase-orders/:medical_purchase_order_id/restore` | `medicine:delete` | req |  |  | Undo a medical purchase order cancel |
| GET | `/app/medical-purchase-orders/exports` | `medicine:export` |  |  |  | Export medical purchase orders |
| GET | `/app/medical-reps` | `medicine:read` |  |  |  | List medical reps |
| POST | `/app/medical-reps` | `medicine:create` | req |  |  | Add a medical rep |
| GET | `/app/medical-reps/:medical_rep_id` | `medicine:read` |  |  |  | Get a medical rep |
| PATCH | `/app/medical-reps/:medical_rep_id` | `medicine:update` |  |  |  | Change a medical rep |
| DELETE | `/app/medical-reps/:medical_rep_id` | `medicine:delete` |  |  |  | Delete a medical rep |
| POST | `/app/medical-reps/:medical_rep_id/restore` | `medicine:delete` | req |  |  | Restore a medical rep |
| GET | `/app/medical-reps/:medical_rep_id/visits` | `medicine:read` |  |  |  | List an MR's visits |
| POST | `/app/medical-reps/:medical_rep_id/visits` | `medicine:create` | req |  |  | Log an MR visit |
| GET | `/app/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id` | `medicine:read` |  |  |  | Get an MR visit |
| DELETE | `/app/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id` | `medicine:delete` |  |  |  | Delete an MR visit |
| POST | `/app/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id/restore` | `medicine:delete` | req |  |  | Restore an MR visit |
| GET | `/app/medical-sales` | `medicine:read` |  |  |  | List medical sales |
| POST | `/app/medical-sales` | `medicine:create` | req |  | 4.1 | Create a medical sale |
| GET | `/app/medical-sales/:medical_sale_id` | `medicine:read` |  |  |  | Get a medical sale |
| DELETE | `/app/medical-sales/:medical_sale_id` | `medicine:delete` |  |  |  | Void a medical sale |
| POST | `/app/medical-sales/:medical_sale_id/restore` | `medicine:delete` | req |  |  | Undo a medical sale void |
| POST | `/app/medical-sales/:medical_sale_id/returns` | `payment:delete` | req |  |  | Return from patient |
| GET | `/app/medical-sales/dues` | `medicine:read` |  |  |  | List who owes on medical sales |
| GET | `/app/medical-sales/exports` | `medicine:export` |  |  |  | Export medical sales |
| GET | `/app/medicines` | `medicine:read` |  |  | 1.3 | List medicines |
| POST | `/app/medicines` | `medicine:create` | req |  | 1.1 | Add a medicine |
| GET | `/app/medicines/:medicine_id` | `medicine:read` |  |  | 1.4 | Get a medicine |
| PATCH | `/app/medicines/:medicine_id` | `medicine:update` |  |  | 1.2 | Change a medicine |
| DELETE | `/app/medicines/:medicine_id` | `medicine:delete` |  |  |  | Delete a medicine |
| POST | `/app/medicines/:medicine_id/restore` | `medicine:delete` | req |  |  | Restore a medicine |
| GET | `/app/medicines/exports` | `medicine:export` |  |  |  | Export medicines |
| POST | `/app/medicines/near-expiry-discount` | `medicine:update` | req |  |  | Set the near-expiry discount |
| GET | `/app/supplier-credits` | `medicine:read` |  |  |  | List supplier credits |
| GET | `/app/suppliers` | `medicine:read` |  |  | 2.3 | List suppliers |
| POST | `/app/suppliers` | `medicine:create` | req |  | 2.1 | Add a supplier |
| GET | `/app/suppliers/:supplier_id` | `medicine:read` |  |  | 2.4 | Get a supplier |
| PATCH | `/app/suppliers/:supplier_id` | `medicine:update` |  |  | 2.2 | Change a supplier |
| DELETE | `/app/suppliers/:supplier_id` | `medicine:delete` |  |  |  | Delete a supplier |
| GET | `/app/suppliers/:supplier_id/credits` | `medicine:read` |  |  |  | List a supplier's credits |
| POST | `/app/suppliers/:supplier_id/credits` | `medicine:update` | req |  | 2.5 | Return stock to a supplier |
| GET | `/app/suppliers/:supplier_id/credits/:supplier_credit_id` | `medicine:read` |  |  |  | Get a supplier credit |
| DELETE | `/app/suppliers/:supplier_id/credits/:supplier_credit_id` | `medicine:delete` |  |  |  | Void a supplier credit |
| POST | `/app/suppliers/:supplier_id/credits/:supplier_credit_id/restore` | `medicine:delete` | req |  |  | Undo a supplier credit void |
| POST | `/app/suppliers/:supplier_id/payments` | `payment:create` | req |  |  | Pay a supplier |
| POST | `/app/suppliers/:supplier_id/restore` | `medicine:delete` | req |  |  | Restore a supplier |

### Files

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/uploads` | signed in | req |  |  | Request pre-signed upload URL |
| GET | `/uploads/:upload_id` | signed in |  |  |  | Get upload metadata |
| DELETE | `/uploads/:upload_id` | signed in |  |  |  | Delete upload |
| POST | `/uploads/:upload_id/confirm` | signed in |  |  |  | Confirm uploaded object |

### Notifications and webhooks

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/notify/notifications` | signed in |  |  |  | List my notifications |
| GET | `/notify/notifications/:notification_id` | signed in |  |  |  | Get notification |
| DELETE | `/notify/notifications/:notification_id` | signed in |  |  |  | Delete notification |
| PATCH | `/notify/notifications/:notification_id/read` | signed in |  |  |  | Mark notification as read |
| POST | `/notify/notifications/mark-all-read` | signed in |  |  |  | Mark all notifications as read |
| GET | `/notify/notifications/unread-count` | signed in |  |  |  | Get unread notification count |
| GET | `/notify/webhook-events` | `webhook:read` |  |  |  | List dispatchable webhook event types |
| GET | `/notify/webhooks` | `webhook:read` |  |  |  | List webhooks |
| POST | `/notify/webhooks` | `webhook:manage` | req |  |  | Create webhook |
| GET | `/notify/webhooks/:webhook_id` | `webhook:read` |  |  |  | Get webhook |
| PATCH | `/notify/webhooks/:webhook_id` | `webhook:manage` |  |  |  | Update webhook |
| DELETE | `/notify/webhooks/:webhook_id` | `webhook:manage` |  |  |  | Delete webhook |
| GET | `/notify/webhooks/:webhook_id/delivery-attempts` | `webhook:read` |  |  |  | List webhook delivery attempts |
| POST | `/notify/webhooks/:webhook_id/test` | `webhook:manage` |  |  |  | Send test webhook |

### Subscription billing (the platform)

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/billing/invoices` | `subscription:read` |  |  |  | List billing invoices |
| GET | `/billing/payment-methods` | `subscription:read` |  |  |  | List payment methods |
| POST | `/billing/payment-methods/setup` | `subscription:manage` | req | team |  | Create payment method setup |
| GET | `/billing/plans` | public |  |  |  | List available plans |
| GET | `/billing/plans/:plan_id` | public |  |  |  | Get plan details |
| GET | `/billing/subscriptions` | `subscription:read` |  |  |  | List subscriptions |
| POST | `/billing/subscriptions` | `subscription:manage` | req | team |  | Create subscription |
| GET | `/billing/subscriptions/:subscription_id` | `subscription:read` |  |  |  | Get subscription |
| POST | `/billing/subscriptions/:subscription_id/cancel` | `subscription:manage` | req | team |  | Cancel subscription |
| POST | `/billing/subscriptions/:subscription_id/change-plan` | `subscription:manage` | req | team |  | Change subscription plan |
| GET | `/billing/subscriptions/:subscription_id/payment-setup` | `subscription:read` |  |  |  | Get payment setup for incomplete subscription |
| POST | `/billing/subscriptions/:subscription_id/resume` | `subscription:manage` | req | team |  | Resume cancelled subscription |
| POST | `/billing/webhook` | public |  |  |  | Stripe webhook receiver |

### Platform administration and operations

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/onboarding-setup` | `organization:update` |  | team |  | Get clinic setup |
| PATCH | `/app/onboarding-setup` | `organization:update` |  | team |  | Change clinic setup |
| POST | `/app/onboarding-setup/complete` | `organization:update` | req | team |  | Go live |
| GET | `/audit/logs` | platform admin |  |  |  | List audit logs (admin) |
| GET | `/mcp` | platform admin |  |  |  | MCP streamable HTTP (GET) |
| POST | `/mcp` | platform admin |  |  |  | MCP streamable HTTP (POST) |
| GET | `/users` | platform admin |  |  |  | List all users (admin) |
| GET | `/users/:user_id` | platform admin |  |  |  | Get user by ID (admin) |
| PATCH | `/users/:user_id` | platform admin |  |  |  | Update user (admin) |
| DELETE | `/users/:user_id` | platform admin |  |  |  | Delete user (admin) |
| POST | `/users/:user_id/suspend` | platform admin |  |  |  | Suspend user (admin) |
| POST | `/users/:user_id/unsuspend` | platform admin |  |  |  | Unsuspend user (admin) |
| GET | `/internal/ops/circuit-breakers` | token (metrics) |  |  |  | List the outbound circuit breakers (operations only) |
| POST | `/internal/ops/circuit-breakers/:circuit_name/reset` | token (ops-admin) |  |  |  | Reset one circuit breaker (operations only) |
| GET | `/livez` | public |  |  |  | Liveness probe |
| GET | `/readyz` | public |  |  |  | Readiness probe |
| GET | `/metrics` | token (metrics) |  |  |  | Prometheus metrics (operations only) |

<!-- GENERATED:END -->

## 4. In the design, dropped — remove from the frontend

None.
