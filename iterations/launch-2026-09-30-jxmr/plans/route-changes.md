# Route changes — launch-2026-09-30-jxmr

The iteration's proposed routes, in one file (`be-iteration-planning` › Route changes). Proposals only —
kickoff confirms each route when it builds it and records any change in `AS-BUILT.md`; the built truth is
`docs/routes.txt`.

Status: **regenerated 2026-10-08 from the route review** ([routes-final.md](routes-final.md), [D46](decisions.md)) — one
section per sub-domain, in build order ([D47](decisions.md)). The proposals of 2026-10-03 are superseded (git history keeps
them). Mode initial (Baseline `none`) · Intake hash `036cbb592ac5`.

Paths are under `/api/v1/app`, except sub-domain 2's team routes (2.B–2.E), which are the platform's, under `/api/v1`.
**#** is `<sub-domain>.<route>` as the route review numbers them. **Change** is against the code today: `NEW` — a route
that does not exist yet; `CHANGED` — moved, renamed or rebuilt (the route review's marker); `KEPT` — the same method
and path, whatever its behaviour now follows. Routes the review removes are named in each sub-domain's decisions
(for example the patient timeline, the global search, patient notes); `docs/routes.txt` shows them go when the row
that drops them is built. The medical store's routes wait for its own review ([D49](decisions.md)).

## Counts

| Sub-domain | NEW | CHANGED | KEPT | Total |
| --- | --- | --- | --- | --- |
| 1. Branches & places | 0 | 14 | 11 | 25 |
| 2. Team | 1 | 11 | 15 | 27 |
| 3. Offerings | 0 | 0 | 19 | 19 |
| 4. Contacts | 10 | 3 | 9 | 22 |
| 5. Leads | 0 | 0 | 9 | 9 |
| 6. Appointments | 4 | 3 | 13 | 20 |
| 7. Patients | 0 | 43 | 30 | 73 |
| 8. Billing | 4 | 2 | 26 | 32 |
| 9. Stock | 1 | 3 | 24 | 28 |
| 10. Tasks & rules | 1 | 0 | 11 | 12 |
| **Total** | **21** | **79** | **167** | **267** |

## 1. Branches & places

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1 | KEPT | GET | `/branches` | `branch:read` | List every branch (management) | routes-final §1.A.7 | `GET /api/v1/app/branches` · #125 · 4339fc3 |
| 1.2 | KEPT | GET | `/branches/my` | any member | The caller's branches (after login, pickers) | routes-final §1.A.7 | `GET /api/v1/app/branches/my` · #125 · 4339fc3 |
| 1.3 | KEPT | POST | `/branches` | `branch:create` | Create a branch | routes-final §1.A.7 | `POST /api/v1/app/branches` · #125 · 4339fc3 |
| 1.4 | KEPT | GET | `/branches/{branch_id}` | `branch:read` | Get a branch | routes-final §1.A.7 | `GET /api/v1/app/branches/:branch_id` · #125 · 4339fc3 |
| 1.5 | KEPT | PATCH | `/branches/{branch_id}` | `branch:update` | Change a branch (or retire: `is_active=false`) | routes-final §1.A.7 | `PATCH /api/v1/app/branches/:branch_id` · #125 · 4339fc3 |
| 1.6 | CHANGED | GET | `/branches/{branch_id}/members` | `branch:update` | Who works at the branch | routes-final §1.B.7 | `GET /api/v1/app/branches/:branch_id/members` · #125 · 4339fc3 |
| 1.7 | CHANGED | PUT | `/branches/{branch_id}/members` | `branch:update` | Replace who works at the branch | routes-final §1.B.7 | `PUT /api/v1/app/branches/:branch_id/members` · #125 · 4339fc3 |
| 1.8 | KEPT | GET | `/branches/{branch_id}/rooms` | any member | List the branch's rooms | routes-final §1.C.7 | `GET /api/v1/app/branches/:branch_id/rooms` · #125 · 4339fc3 |
| 1.9 | KEPT | POST | `/branches/{branch_id}/rooms` | `branch:create` | Add a room | routes-final §1.C.7 | `POST /api/v1/app/branches/:branch_id/rooms` · #125 · 4339fc3 |
| 1.10 | CHANGED | GET | `/branches/{branch_id}/rooms/{branch_room_id}` | any member | Get a room | routes-final §1.C.7 | `GET /api/v1/app/branches/:branch_id/rooms/:branch_room_id` · #125 · 4339fc3 |
| 1.11 | CHANGED | PATCH | `/branches/{branch_id}/rooms/{branch_room_id}` | `branch:update` | Change a room | routes-final §1.C.7 | `PATCH /api/v1/app/branches/:branch_id/rooms/:branch_room_id` · #125 · 4339fc3 |
| 1.12 | CHANGED | DELETE | `/branches/{branch_id}/rooms/{branch_room_id}` | `branch:delete` | Delete a room | routes-final §1.C.7 | `DELETE /api/v1/app/branches/:branch_id/rooms/:branch_room_id` · #125 · 4339fc3 |
| 1.13 | CHANGED | POST | `/branches/{branch_id}/rooms/{branch_room_id}/restore` | `branch:delete` | Undo a delete | routes-final §1.C.7 | `POST /api/v1/app/branches/:branch_id/rooms/:branch_room_id/restore` · #125 · 4339fc3 |
| 1.14 | KEPT | GET | `/branches/{branch_id}/machines` | any member | List the branch's machines | routes-final §1.D.7 | `GET /api/v1/app/branches/:branch_id/machines` · #125 · 4339fc3 |
| 1.15 | KEPT | POST | `/branches/{branch_id}/machines` | `branch:create` | Add a machine | routes-final §1.D.7 | `POST /api/v1/app/branches/:branch_id/machines` · #125 · 4339fc3 |
| 1.16 | CHANGED | GET | `/branches/{branch_id}/machines/{branch_machine_id}` | any member | Get a machine | routes-final §1.D.7 | `GET /api/v1/app/branches/:branch_id/machines/:branch_machine_id` · #125 · 4339fc3 |
| 1.17 | CHANGED | PATCH | `/branches/{branch_id}/machines/{branch_machine_id}` | `branch:update` | Change a machine | routes-final §1.D.7 | `PATCH /api/v1/app/branches/:branch_id/machines/:branch_machine_id` · #125 · 4339fc3 |
| 1.18 | CHANGED | DELETE | `/branches/{branch_id}/machines/{branch_machine_id}` | `branch:delete` | Delete a machine | routes-final §1.D.7 | `DELETE /api/v1/app/branches/:branch_id/machines/:branch_machine_id` · #125 · 4339fc3 |
| 1.19 | CHANGED | POST | `/branches/{branch_id}/machines/{branch_machine_id}/restore` | `branch:delete` | Undo a delete | routes-final §1.D.7 | `POST /api/v1/app/branches/:branch_id/machines/:branch_machine_id/restore` · #125 · 4339fc3 |
| 1.20 | KEPT | GET | `/branches/{branch_id}/holidays` | any member | List the branch's holidays | routes-final §1.E.7 | `GET /api/v1/app/branches/:branch_id/holidays` · #125 · 4339fc3 |
| 1.21 | KEPT | POST | `/branches/{branch_id}/holidays` | `branch:create` | Add a holiday | routes-final §1.E.7 | `POST /api/v1/app/branches/:branch_id/holidays` · #125 · 4339fc3 |
| 1.22 | CHANGED | GET | `/branches/{branch_id}/holidays/{branch_holiday_id}` | any member | Get a holiday | routes-final §1.E.7 | `GET /api/v1/app/branches/:branch_id/holidays/:branch_holiday_id` · #125 · 4339fc3 |
| 1.23 | CHANGED | PATCH | `/branches/{branch_id}/holidays/{branch_holiday_id}` | `branch:update` | Change a holiday | routes-final §1.E.7 | `PATCH /api/v1/app/branches/:branch_id/holidays/:branch_holiday_id` · #125 · 4339fc3 |
| 1.24 | CHANGED | DELETE | `/branches/{branch_id}/holidays/{branch_holiday_id}` | `branch:delete` | Delete a holiday | routes-final §1.E.7 | `DELETE /api/v1/app/branches/:branch_id/holidays/:branch_holiday_id` · #125 · 4339fc3 |
| 1.25 | CHANGED | POST | `/branches/{branch_id}/holidays/{branch_holiday_id}/restore` | `branch:delete` | Undo a delete | routes-final §1.E.7 | `POST /api/v1/app/branches/:branch_id/holidays/:branch_holiday_id/restore` · #125 · 4339fc3 |

## 2. Team

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2.1 | CHANGED | GET | `/app/memberships` | any member | Team picker — active members | routes-final §2.A.7 | `GET /api/v1/app/memberships` · #126 · 4339fc3 |
| 2.2 | KEPT | GET | `/tenancy/organization/memberships` | `membership:read` | Team list (every status) | routes-final §2.B.7 | `GET /api/v1/tenancy/organization/memberships` · #126 · 4339fc3 |
| 2.3 | KEPT | POST | `/tenancy/organization/memberships` | `membership:create` | Add a member by email (sends the invite) | routes-final §2.B.7 | `POST /api/v1/tenancy/organization/memberships` · #126 · 4339fc3 |
| 2.4 | KEPT | GET | `/tenancy/organization/memberships/{membership_id}` | `membership:read` | Get a member | routes-final §2.B.7 | `GET /api/v1/tenancy/organization/memberships/:membership_id` · #126 · 4339fc3 |
| 2.5 | KEPT | PATCH | `/tenancy/organization/memberships/{membership_id}` | `membership:update` | Change roles, branches, hours, status | routes-final §2.B.7 | `PATCH /api/v1/tenancy/organization/memberships/:membership_id` · #126 · 4339fc3 |
| 2.6 | KEPT | DELETE | `/tenancy/organization/memberships/{membership_id}` | `membership:delete` | Remove a member | routes-final §2.B.7 | `DELETE /api/v1/tenancy/organization/memberships/:membership_id` · #126 · 4339fc3 |
| 2.7 | KEPT | POST | `/tenancy/organization/memberships/{membership_id}/restore` | `membership:delete` | Undo a removal | routes-final §2.B.7 | `POST /api/v1/tenancy/organization/memberships/:membership_id/restore` · #126 · 4339fc3 |
| 2.8 | KEPT | GET | `/tenancy/organization/memberships/{membership_id}/permissions` | `membership:read` | A member's effective codes | routes-final §2.B.7 | `GET /api/v1/tenancy/organization/memberships/:membership_id/permissions` · #126 · 4339fc3 |
| 2.9 | CHANGED | DELETE | `/tenancy/organization/memberships/{membership_id}/invitation` | `membership:delete` | Revoke the pending invite | routes-final §2.C.7 | `DELETE /api/v1/tenancy/organization/memberships/:membership_id/invitation` · #126 · 4339fc3 |
| 2.10 | CHANGED | POST | `/tenancy/organization/memberships/{membership_id}/invitation/resend` | `membership:update` | Resend the invite | routes-final §2.C.7 | `POST /api/v1/tenancy/organization/memberships/:membership_id/invitation/resend` · #126 · 4339fc3 |
| 2.11 | CHANGED | POST | `/tenancy/membership-invitations/{membership_invitation_id}/accept` | signed in | The invitee accepts | routes-final §2.C.7 | `POST /api/v1/tenancy/membership-invitations/:membership_invitation_id/accept` · #126 · 4339fc3 |
| 2.12 | KEPT | GET | `/tenancy/organization/roles` | `role:read` | List roles (with member counts) | routes-final §2.D.7 | `GET /api/v1/tenancy/organization/roles` · #126 · 4339fc3 |
| 2.13 | KEPT | POST | `/tenancy/organization/roles` | `role:create` | Create a role (optionally copy another) | routes-final §2.D.7 | `POST /api/v1/tenancy/organization/roles` · #126 · 4339fc3 |
| 2.14 | KEPT | GET | `/tenancy/organization/roles/{role_id}` | `role:read` | Get a role | routes-final §2.D.7 | `GET /api/v1/tenancy/organization/roles/:role_id` · #126 · 4339fc3 |
| 2.15 | KEPT | PATCH | `/tenancy/organization/roles/{role_id}` | `role:update` | Rename / recolour a role | routes-final §2.D.7 | `PATCH /api/v1/tenancy/organization/roles/:role_id` · #126 · 4339fc3 |
| 2.16 | KEPT | DELETE | `/tenancy/organization/roles/{role_id}` | `role:delete` | Delete a custom role | routes-final §2.D.7 | `DELETE /api/v1/tenancy/organization/roles/:role_id` · #126 · 4339fc3 |
| 2.17 | NEW | POST | `/tenancy/organization/roles/{role_id}/restore` | `role:delete` | Undo a delete | routes-final §2.D.7 | `POST /api/v1/tenancy/organization/roles/:role_id/restore` · #126 · 4339fc3 |
| 2.18 | KEPT | GET | `/tenancy/organization/roles/{role_id}/permissions` | `role:read` | A role's codes | routes-final §2.D.7 | `GET /api/v1/tenancy/organization/roles/:role_id/permissions` · #126 · 4339fc3 |
| 2.19 | KEPT | PUT | `/tenancy/organization/roles/{role_id}/permissions` | `role:update` | Replace a role's codes (the matrix) | routes-final §2.D.7 | `PUT /api/v1/tenancy/organization/roles/:role_id/permissions` · #126 · 4339fc3 |
| 2.20 | KEPT | GET | `/tenancy/permissions` | signed in | The permission catalog | routes-final §2.E.7 | `GET /api/v1/tenancy/permissions` · #126 · 4339fc3 |
| 2.21 | CHANGED | GET | `/app/memberships/me/preferences` | `organization:read` | My preferences (the defaults before the first save) | routes-final §2.F.7 | `GET /api/v1/app/memberships/me/preferences` · #127 · 30f8ddf |
| 2.22 | CHANGED | PATCH | `/app/memberships/me/preferences` | `organization:read` | Save them | routes-final §2.F.7 | `PATCH /api/v1/app/memberships/me/preferences` · #127 · 30f8ddf |
| 2.23 | CHANGED | GET | `/app/memberships/me/saved-views` | `organization:read` | My saved views | routes-final §2.G.7 | `GET /api/v1/app/memberships/me/saved-views` · #127 · 30f8ddf |
| 2.24 | CHANGED | POST | `/app/memberships/me/saved-views` | `organization:read` | Save a view | routes-final §2.G.7 | `POST /api/v1/app/memberships/me/saved-views` · #127 · 30f8ddf |
| 2.25 | CHANGED | GET | `/app/memberships/me/saved-views/{membership_saved_view_id}` | `organization:read` | Get one | routes-final §2.G.7 | `GET /api/v1/app/memberships/me/saved-views/:membership_saved_view_id` · #127 · 30f8ddf |
| 2.26 | CHANGED | PATCH | `/app/memberships/me/saved-views/{membership_saved_view_id}` | `organization:read` | Rename it or change its filters | routes-final §2.G.7 | `PATCH /api/v1/app/memberships/me/saved-views/:membership_saved_view_id` · #127 · 30f8ddf |
| 2.27 | CHANGED | DELETE | `/app/memberships/me/saved-views/{membership_saved_view_id}` | `organization:read` | Remove it — for good (U6) | routes-final §2.G.7 | `DELETE /api/v1/app/memberships/me/saved-views/:membership_saved_view_id` · #127 · 30f8ddf |

## 3. Offerings

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3.1 | KEPT | GET | `/offering-groups` | any member | List groups (menu order) | routes-final §3.A.7 | `GET /api/v1/app/offering-groups` · #128 · 7f93ef6 |
| 3.2 | KEPT | POST | `/offering-groups` | `offering:create` | Add a group | routes-final §3.A.7 | `POST /api/v1/app/offering-groups` · #128 · 7f93ef6 |
| 3.3 | KEPT | GET | `/offering-groups/{offering_group_id}` | any member | Get a group | routes-final §3.A.7 | `GET /api/v1/app/offering-groups/:offering_group_id` · #128 · 7f93ef6 |
| 3.4 | KEPT | PATCH | `/offering-groups/{offering_group_id}` | `offering:update` | Rename / reorder a group | routes-final §3.A.7 | `PATCH /api/v1/app/offering-groups/:offering_group_id` · #128 · 7f93ef6 |
| 3.5 | KEPT | DELETE | `/offering-groups/{offering_group_id}` | `offering:delete` | Delete an empty group (O7) | routes-final §3.A.7 | `DELETE /api/v1/app/offering-groups/:offering_group_id` · #128 · 7f93ef6 |
| 3.6 | KEPT | POST | `/offering-groups/{offering_group_id}/restore` | `offering:delete` | Undo a delete | routes-final §3.A.7 | `POST /api/v1/app/offering-groups/:offering_group_id/restore` · #128 · 7f93ef6 |
| 3.7 | KEPT | GET | `/offerings` | any member | List offerings | routes-final §3.B.7 | `GET /api/v1/app/offerings` · #128 · 7f93ef6 |
| 3.8 | KEPT | GET | `/offerings/exports` | `offering:export` | Download the list as CSV | routes-final §3.B.7 | `GET /api/v1/app/offerings/exports` · #128 · 7f93ef6 |
| 3.9 | KEPT | POST | `/offerings` | `offering:create` | Add an offering | routes-final §3.B.7 | `POST /api/v1/app/offerings` · #128 · 7f93ef6 |
| 3.10 | KEPT | GET | `/offerings/{offering_id}` | any member | Get an offering | routes-final §3.B.7 | `GET /api/v1/app/offerings/:offering_id` · #128 · 7f93ef6 |
| 3.11 | KEPT | PATCH | `/offerings/{offering_id}` | `offering:update` | Change an offering (prices included) | routes-final §3.B.7 | `PATCH /api/v1/app/offerings/:offering_id` · #128 · 7f93ef6 |
| 3.12 | KEPT | DELETE | `/offerings/{offering_id}` | `offering:delete` | Delete an offering | routes-final §3.B.7 | `DELETE /api/v1/app/offerings/:offering_id` · #128 · 7f93ef6 |
| 3.13 | KEPT | POST | `/offerings/{offering_id}/restore` | `offering:delete` | Undo a delete | routes-final §3.B.7 | `POST /api/v1/app/offerings/:offering_id/restore` · #128 · 7f93ef6 |
| 3.14 | KEPT | GET | `/offers` | any member | List offers (Live → Scheduled → Paused → Ended) | routes-final §3.C.7 | `GET /api/v1/app/offers` · #128 · 7f93ef6 |
| 3.15 | KEPT | POST | `/offers` | `offering:create` | Add an offer | routes-final §3.C.7 | `POST /api/v1/app/offers` · #128 · 7f93ef6 |
| 3.16 | KEPT | GET | `/offers/{offer_id}` | any member | Get an offer | routes-final §3.C.7 | `GET /api/v1/app/offers/:offer_id` · #128 · 7f93ef6 |
| 3.17 | KEPT | PATCH | `/offers/{offer_id}` | `offering:update` | Change, pause or resume an offer | routes-final §3.C.7 | `PATCH /api/v1/app/offers/:offer_id` · #128 · 7f93ef6 |
| 3.18 | KEPT | DELETE | `/offers/{offer_id}` | `offering:delete` | Delete an offer | routes-final §3.C.7 | `DELETE /api/v1/app/offers/:offer_id` · #128 · 7f93ef6 |
| 3.19 | KEPT | POST | `/offers/{offer_id}/restore` | `offering:delete` | Undo a delete | routes-final §3.C.7 | `POST /api/v1/app/offers/:offer_id/restore` · #128 · 7f93ef6 |

## 4. Contacts

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1 | CHANGED | GET | `/contacts` | `contact:read` | List / find contacts | routes-final §4.A.7 | `GET /api/v1/app/contacts` · #129 · df064f3 |
| 4.2 | NEW | POST | `/contacts` | `contact:create` | Add a contact | routes-final §4.A.7 | `POST /api/v1/app/contacts` · #129 · df064f3 |
| 4.3 | NEW | GET | `/contacts/{contact_id}` | `contact:read` | Get a contact | routes-final §4.A.7 | `GET /api/v1/app/contacts/:contact_id` · #129 · df064f3 |
| 4.4 | NEW | PATCH | `/contacts/{contact_id}` | `contact:update` | Change a contact | routes-final §4.A.7 | `PATCH /api/v1/app/contacts/:contact_id` · #129 · df064f3 |
| 4.5 | NEW | DELETE | `/contacts/{contact_id}` | `contact:delete` | Delete a contact not in use | routes-final §4.A.7 | `DELETE /api/v1/app/contacts/:contact_id` · #129 · df064f3 |
| 4.6 | NEW | POST | `/contacts/{contact_id}/restore` | `contact:delete` | Undo a delete | routes-final §4.A.7 | `POST /api/v1/app/contacts/:contact_id/restore` · #129 · df064f3 |
| 4.7 | KEPT | GET | `/contacts/{contact_id}/preview` | `contact:read` | The hover card | routes-final §4.A.7 | `GET /api/v1/app/contacts/:contact_id/preview` · #129 · df064f3 |
| 4.8 | NEW | GET | `/contacts/{contact_id}/members` | `contact:read` | Who handles this person | routes-final §4.B.7 | `GET /api/v1/app/contacts/:contact_id/members` · #129 · df064f3 |
| 4.9 | NEW | PUT | `/contacts/{contact_id}/members` | `contact:update` | Replace who handles them | routes-final §4.B.7 | `PUT /api/v1/app/contacts/:contact_id/members` · #129 · df064f3 |
| 4.10 | CHANGED | GET | `/contacts/{contact_id}/activities` | `contact_activity:read` | The contact's stream | routes-final §4.C.7 | `GET /api/v1/app/contacts/:contact_id/activities` · #130 |
| 4.11 | NEW | POST | `/contacts/{contact_id}/activities/send-message` | `contact_activity:create` | Send a WhatsApp or Instagram message | routes-final §4.C.7 | `POST /api/v1/app/contacts/:contact_id/activities/send-message` · #130 |
| 4.12 | NEW | POST | `/contacts/{contact_id}/activities/log-call` | `contact_activity:create` | Log a call that happened | routes-final §4.C.7 | `POST /api/v1/app/contacts/:contact_id/activities/log-call` · #130 |
| 4.13 | NEW | POST | `/contacts/{contact_id}/activities/add-note` | `contact_activity:create` | Add an internal note | routes-final §4.C.7 | `POST /api/v1/app/contacts/:contact_id/activities/add-note` · #130 |
| 4.14 | KEPT | GET | `/contacts/{contact_id}/activities/{contact_activity_id}` | `contact_activity:read` | Get an entry | routes-final §4.C.7 | `GET /api/v1/app/contacts/:contact_id/activities/:contact_activity_id` · #130 |
| 4.15 | KEPT | POST | `/contacts/{contact_id}/activities/{contact_activity_id}/resend` | `contact_activity:update` | Re-queue a failed message | routes-final §4.C.7 | `POST /api/v1/app/contacts/:contact_id/activities/:contact_activity_id/resend` · #130 |
| 4.16 | CHANGED | POST | `/contact-activities/message-batches` | `contact_activity:create` | One message to many contacts | routes-final §4.C.7 | `POST /api/v1/app/contact-activities/message-batches` · #130 |
| 4.17 | KEPT | GET | `/contact-message-templates` | any member | List templates | routes-final §4.D.7 | `GET /api/v1/app/contact-message-templates` · #130 |
| 4.18 | KEPT | POST | `/contact-message-templates` | `contact_activity:create` | Add a template | routes-final §4.D.7 | `POST /api/v1/app/contact-message-templates` · #130 |
| 4.19 | KEPT | GET | `/contact-message-templates/{contact_message_template_id}` | any member | Get a template | routes-final §4.D.7 | `GET /api/v1/app/contact-message-templates/:contact_message_template_id` · #130 |
| 4.20 | KEPT | PATCH | `/contact-message-templates/{contact_message_template_id}` | `contact_activity:update` | Change a template | routes-final §4.D.7 | `PATCH /api/v1/app/contact-message-templates/:contact_message_template_id` · #130 |
| 4.21 | KEPT | DELETE | `/contact-message-templates/{contact_message_template_id}` | `contact_activity:delete` | Delete a template | routes-final §4.D.7 | `DELETE /api/v1/app/contact-message-templates/:contact_message_template_id` · #130 |
| 4.22 | KEPT | POST | `/contact-message-templates/{contact_message_template_id}/restore` | `contact_activity:delete` | Undo a delete | routes-final §4.D.7 | `POST /api/v1/app/contact-message-templates/:contact_message_template_id/restore` · #130 |

## 5. Leads

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- |
| 5.1 | KEPT | GET | `/leads` | `lead:read` | List leads (Mine · Unreplied · All are filters) | routes-final §5.7 |
| 5.2 | KEPT | GET | `/leads/exports` | `lead:export` | Download the list as CSV | routes-final §5.7 |
| 5.3 | KEPT | POST | `/leads` | `lead:create` | Add a lead (for a contact, or with a new one) | routes-final §5.7 |
| 5.4 | KEPT | GET | `/leads/{lead_id}` | `lead:read` | Get a lead | routes-final §5.7 |
| 5.5 | KEPT | PATCH | `/leads/{lead_id}` | `lead:update` | Change a lead | routes-final §5.7 |
| 5.6 | KEPT | DELETE | `/leads/{lead_id}` | `lead:delete` | Remove a lead | routes-final §5.7 |
| 5.7 | KEPT | POST | `/leads/{lead_id}/restore` | `lead:delete` | Undo a removal | routes-final §5.7 |
| 5.8 | KEPT | POST | `/leads/{lead_id}/claim` | `lead:update` | Take the lead (and hold it) | routes-final §5.7 |
| 5.9 | KEPT | POST | `/leads/{lead_id}/release` | `lead:update` | Give it back to the team | routes-final §5.7 |

## 6. Appointments

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 6.1 | KEPT | GET | `/appointments` | `appointment:read` | List appointments — and the clinic floor (`status=checked_in`) | routes-final §6.7 |
| 6.2 | KEPT | GET | `/appointments/exports` | `appointment:export` | Download the list as CSV | routes-final §6.7 |
| 6.3 | KEPT | GET | `/appointments/slots` | `appointment:read` | Free slots for a day | routes-final §6.7 |
| 6.4 | KEPT | GET | `/appointments/daily-counts` | `appointment:read` | Counts per day and status | routes-final §6.7 |
| 6.5 | KEPT | POST | `/appointments` | `appointment:create` | Book, or record a walk-in | routes-final §6.7 |
| 6.6 | KEPT | GET | `/appointments/{appointment_id}` | `appointment:read` | Get an appointment | routes-final §6.7 |
| 6.7 | KEPT | PATCH | `/appointments/{appointment_id}` | `appointment:update` | Change or move a booking | routes-final §6.7 |
| 6.8 | KEPT | DELETE | `/appointments/{appointment_id}` | `appointment:delete` | Delete a booking | routes-final §6.7 |
| 6.9 | KEPT | POST | `/appointments/{appointment_id}/restore` | `appointment:delete` | Undo a delete | routes-final §6.7 |
| 6.10 | NEW | POST | `/appointments/{appointment_id}/confirm` | `appointment:update` | They said yes | routes-final §6.7 |
| 6.11 | NEW | POST | `/appointments/{appointment_id}/check-in` | `appointment:update` | They arrived — stage `waiting` | routes-final §6.7 |
| 6.12 | NEW | POST | `/appointments/{appointment_id}/complete` | `appointment:update` | The visit is done | routes-final §6.7 |
| 6.13 | NEW | POST | `/appointments/{appointment_id}/no-show` | `appointment:update` | They did not come | routes-final §6.7 |
| 6.14 | KEPT | POST | `/appointments/{appointment_id}/cancel` | `appointment:update` | Cancel with a reason | routes-final §6.7 |
| 6.15 | KEPT | POST | `/appointments/{appointment_id}/reinstate` | `appointment:update` | Undo a cancel | routes-final §6.7 |
| 6.16 | KEPT | POST | `/appointments/{appointment_id}/undo-check-in` | `appointment:update` | Undo a mistaken check-in | routes-final §6.7 |
| 6.17 | KEPT | POST | `/appointments/{appointment_id}/copy` | `appointment:create` | Book again on another day | routes-final §6.7 |
| 6.18 | CHANGED | POST | `/appointments/{appointment_id}/stage` | `appointment:update` | Move to a later floor stage | routes-final §6.7 |
| 6.19 | CHANGED | POST | `/appointments/{appointment_id}/pause` | `appointment:update` | Pause the visit | routes-final §6.7 |
| 6.20 | CHANGED | POST | `/appointments/{appointment_id}/resume` | `appointment:update` | Resume it | routes-final §6.7 |

## 7. Patients

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 7.1 | KEPT | GET | `/patients` | `patient:read` | List patient files | routes-final §7.A.7 |
| 7.2 | KEPT | GET | `/patients/exports` | `patient:export` | Download the list as CSV | routes-final §7.A.7 |
| 7.3 | KEPT | POST | `/patients` | `patient:create` | Add a patient file (for a contact, or with a new one) | routes-final §7.A.7 |
| 7.4 | KEPT | GET | `/patients/{patient_id}` | `patient:read` | Get a patient file | routes-final §7.A.7 |
| 7.5 | KEPT | PATCH | `/patients/{patient_id}` | `patient:update` | Change a patient file | routes-final §7.A.7 |
| 7.6 | KEPT | DELETE | `/patients/{patient_id}` | `patient:delete` | Remove a patient file | routes-final §7.A.7 |
| 7.7 | KEPT | POST | `/patients/{patient_id}/restore` | `patient:delete` | Undo a removal | routes-final §7.A.7 |
| 7.8 | KEPT | GET | `/patients/{patient_id}/clinical-notes` | `patient:clinical_record:read` | The clinical notes | routes-final §7.B.7 |
| 7.9 | KEPT | POST | `/patients/{patient_id}/clinical-notes` | `patient:update` + clinical | Add a clinical note | routes-final §7.B.7 |
| 7.10 | CHANGED | GET | `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}` | `patient:clinical_record:read` | Get one | routes-final §7.B.7 |
| 7.11 | CHANGED | DELETE | `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}` | `patient:update` + clinical | Delete a wrong note | routes-final §7.B.7 |
| 7.12 | CHANGED | POST | `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}/restore` | `patient:update` + clinical | Undo | routes-final §7.B.7 |
| 7.13 | KEPT | GET | `/patient-prescriptions` | `patient_prescription:read` | All prescriptions — the pharmacy queue | routes-final §7.C.7 |
| 7.14 | KEPT | GET | `/patients/{patient_id}/prescriptions` | `patient_prescription:read` | A patient's prescriptions | routes-final §7.C.7 |
| 7.15 | KEPT | POST | `/patients/{patient_id}/prescriptions` | `patient_prescription:create` | Write a prescription | routes-final §7.C.7 |
| 7.16 | CHANGED | GET | `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | `patient_prescription:read` | Get one | routes-final §7.C.7 |
| 7.17 | CHANGED | PATCH | `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | `patient_prescription:update` | Change a draft | routes-final §7.C.7 |
| 7.18 | CHANGED | POST | `/patients/{patient_id}/prescriptions/{patient_prescription_id}/approve` | `patient_prescription:update` | Approve — final | routes-final §7.C.7 |
| 7.19 | CHANGED | DELETE | `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | `patient_prescription:delete` | Delete a draft | routes-final §7.C.7 |
| 7.20 | CHANGED | POST | `/patients/{patient_id}/prescriptions/{patient_prescription_id}/restore` | `patient_prescription:delete` | Undo | routes-final §7.C.7 |
| 7.21 | KEPT | GET | `/prescription-kits` | `patient_prescription:create` | My kits | routes-final §7.D.7 |
| 7.22 | KEPT | POST | `/prescription-kits` | `patient_prescription:create` | Save a kit | routes-final §7.D.7 |
| 7.23 | KEPT | GET | `/prescription-kits/{prescription_kit_id}` | `patient_prescription:create` | Get a kit | routes-final §7.D.7 |
| 7.24 | KEPT | PATCH | `/prescription-kits/{prescription_kit_id}` | `patient_prescription:create` | Change a kit | routes-final §7.D.7 |
| 7.25 | KEPT | DELETE | `/prescription-kits/{prescription_kit_id}` | `patient_prescription:create` | Delete a kit | routes-final §7.D.7 |
| 7.26 | KEPT | POST | `/prescription-kits/{prescription_kit_id}/restore` | `patient_prescription:create` | Undo | routes-final §7.D.7 |
| 7.27 | CHANGED | GET | `/patient-diagnoses` | any member | The diagnosis catalogue | routes-final §7.E.7 |
| 7.28 | CHANGED | POST | `/patient-diagnoses` | `patient_prescription:create` | Add a diagnosis | routes-final §7.E.7 |
| 7.29 | CHANGED | GET | `/patient-diagnoses/{patient_diagnosis_id}` | any member | Get one | routes-final §7.E.7 |
| 7.30 | CHANGED | PATCH | `/patient-diagnoses/{patient_diagnosis_id}` | `patient_prescription:update` | Rename one | routes-final §7.E.7 |
| 7.31 | CHANGED | DELETE | `/patient-diagnoses/{patient_diagnosis_id}` | `patient_prescription:delete` | Delete one | routes-final §7.E.7 |
| 7.32 | CHANGED | POST | `/patient-diagnoses/{patient_diagnosis_id}/restore` | `patient_prescription:delete` | Undo | routes-final §7.E.7 |
| 7.33 | KEPT | GET | `/patients/{patient_id}/images` | `patient:clinical_record:read` | The photos — one album tab, or all you can see | routes-final §7.F.7 |
| 7.34 | KEPT | POST | `/patients/{patient_id}/images` | `patient:update` + clinical | Add a photo to an album | routes-final §7.F.7 |
| 7.35 | CHANGED | GET | `/patients/{patient_id}/images/{patient_image_id}` | `patient:clinical_record:read` | Get one | routes-final §7.F.7 |
| 7.36 | CHANGED | PATCH | `/patients/{patient_id}/images/{patient_image_id}` | `patient:update` + clinical | Change its details or move it to another album | routes-final §7.F.7 |
| 7.37 | CHANGED | DELETE | `/patients/{patient_id}/images/{patient_image_id}` | `patient:update` + clinical | Delete one | routes-final §7.F.7 |
| 7.38 | CHANGED | POST | `/patients/{patient_id}/images/{patient_image_id}/restore` | `patient:update` + clinical | Undo | routes-final §7.F.7 |
| 7.39 | KEPT | GET | `/patients/{patient_id}/reports` | `patient:clinical_record:read` | The reports | routes-final §7.G.7 |
| 7.40 | KEPT | POST | `/patients/{patient_id}/reports` | `patient:update` + clinical | Add a report | routes-final §7.G.7 |
| 7.41 | CHANGED | GET | `/patients/{patient_id}/reports/{patient_report_id}` | `patient:clinical_record:read` | Get one | routes-final §7.G.7 |
| 7.42 | CHANGED | PATCH | `/patients/{patient_id}/reports/{patient_report_id}` | `patient:update` + clinical | Change one | routes-final §7.G.7 |
| 7.43 | CHANGED | DELETE | `/patients/{patient_id}/reports/{patient_report_id}` | `patient:update` + clinical | Delete one | routes-final §7.G.7 |
| 7.44 | CHANGED | POST | `/patients/{patient_id}/reports/{patient_report_id}/restore` | `patient:update` + clinical | Undo | routes-final §7.G.7 |
| 7.45 | CHANGED | GET | `/patient-treatments` | `patient_treatment:read` | Every patient's treatments — a doctor's or therapist's sessions | routes-final §7.H.7 |
| 7.46 | KEPT | GET | `/patients/{patient_id}/treatments` | `patient_treatment:read` | The patient's treatments | routes-final §7.H.7 |
| 7.47 | KEPT | POST | `/patients/{patient_id}/treatments` | `patient_treatment:create` | Record a session (may spend a bought session) | routes-final §7.H.7 |
| 7.48 | CHANGED | GET | `/patients/{patient_id}/treatments/{patient_treatment_id}` | `patient_treatment:read` | Get one | routes-final §7.H.7 |
| 7.49 | CHANGED | PATCH | `/patients/{patient_id}/treatments/{patient_treatment_id}` | `patient_treatment:update` | Change a session | routes-final §7.H.7 |
| 7.50 | CHANGED | POST | `/patients/{patient_id}/treatments/{patient_treatment_id}/reverse` | `patient_treatment:update` | Reverse it with a reason | routes-final §7.H.7 |
| 7.51 | KEPT | GET | `/patients/{patient_id}/check-ins` | `patient:read` | The patient's check-ins | routes-final §7.I.7 |
| 7.52 | KEPT | POST | `/patients/{patient_id}/check-ins` | `patient:update` | Log a check-in | routes-final §7.I.7 |
| 7.53 | CHANGED | GET | `/patients/{patient_id}/check-ins/{patient_check_in_id}` | `patient:read` | Get one | routes-final §7.I.7 |
| 7.54 | CHANGED | PATCH | `/patients/{patient_id}/check-ins/{patient_check_in_id}` | `patient:update` | Change it | routes-final §7.I.7 |
| 7.55 | CHANGED | DELETE | `/patients/{patient_id}/check-ins/{patient_check_in_id}` | `patient:update` | Remove it | routes-final §7.I.7 |
| 7.56 | CHANGED | POST | `/patients/{patient_id}/check-ins/{patient_check_in_id}/restore` | `patient:update` | Undo | routes-final §7.I.7 |
| 7.57 | KEPT | GET | `/patients/{patient_id}/reviews` | `patient:read` | The patient's reviews | routes-final §7.J.7 |
| 7.58 | KEPT | POST | `/patients/{patient_id}/reviews` | `patient:update` | Log a review | routes-final §7.J.7 |
| 7.59 | CHANGED | GET | `/patients/{patient_id}/reviews/{patient_review_id}` | `patient:read` | Get one | routes-final §7.J.7 |
| 7.60 | CHANGED | PATCH | `/patients/{patient_id}/reviews/{patient_review_id}` | `patient:update` | Change it | routes-final §7.J.7 |
| 7.61 | CHANGED | DELETE | `/patients/{patient_id}/reviews/{patient_review_id}` | `patient:update` | Remove it | routes-final §7.J.7 |
| 7.62 | CHANGED | POST | `/patients/{patient_id}/reviews/{patient_review_id}/restore` | `patient:update` | Undo | routes-final §7.J.7 |
| 7.63 | CHANGED | POST | `/patients/{patient_id}/check-ins/{patient_check_in_id}/actions` | `patient:update` | Log what was done about a check-in | routes-final §7.K.7 |
| 7.64 | CHANGED | POST | `/patients/{patient_id}/reviews/{patient_review_id}/actions` | `patient:update` | Log what was done about a review | routes-final §7.K.7 |
| 7.65 | CHANGED | GET | `/patients/{patient_id}/offerings` | `patient:read` | What the patient bought — the Packages tab with `is_package=true` | routes-final §7.L.7 |
| 7.66 | CHANGED | GET | `/patients/{patient_id}/offerings/{patient_offering_id}` | `patient:read` | Get one | routes-final §7.L.7 |
| 7.67 | CHANGED | PATCH | `/patients/{patient_id}/offerings/{patient_offering_id}` | `payment:update` | Change its sessions or validity | routes-final §7.L.7 |
| 7.68 | KEPT | GET | `/patients/{patient_id}/offering-suggestions` | `patient:read` | The patient's plan | routes-final §7.M.7 |
| 7.69 | KEPT | POST | `/patients/{patient_id}/offering-suggestions` | `patient:update` | Add to the plan | routes-final §7.M.7 |
| 7.70 | CHANGED | GET | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | `patient:read` | Get one | routes-final §7.M.7 |
| 7.71 | CHANGED | PATCH | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | `patient:update` | Change quantity, price, status, reason | routes-final §7.M.7 |
| 7.72 | CHANGED | DELETE | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | `patient:update` | Remove from the plan | routes-final §7.M.7 |
| 7.73 | CHANGED | POST | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}/restore` | `patient:update` | Undo | routes-final §7.M.7 |

## 8. Billing

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 8.1 | KEPT | GET | `/invoices` | `payment:read` | List invoices | routes-final §8.A.7 |
| 8.2 | KEPT | GET | `/invoices/exports` | `payment:export` | The invoices CSV | routes-final §8.A.7 |
| 8.3 | KEPT | POST | `/invoices` | `payment:create` | Bill — optionally with "Paid now" | routes-final §8.A.7 |
| 8.4 | KEPT | GET | `/invoices/{invoice_id}` | `payment:read` | Get an invoice (the print preview) | routes-final §8.A.7 |
| 8.5 | KEPT | PATCH | `/invoices/{invoice_id}` | `payment:update` | Change it, until settled | routes-final §8.A.7 |
| 8.6 | KEPT | DELETE | `/invoices/{invoice_id}` | `payment:delete` | Delete an unpaid invoice | routes-final §8.A.7 |
| 8.7 | KEPT | POST | `/invoices/{invoice_id}/restore` | `payment:delete` | Undo | routes-final §8.A.7 |
| 8.8 | CHANGED | GET | `/invoice-credit-notes` | `payment:read` | Every credit note | routes-final §8.B.7 |
| 8.9 | KEPT | GET | `/invoices/{invoice_id}/credit-notes` | `payment:read` | An invoice's credit notes | routes-final §8.B.7 |
| 8.10 | NEW | POST | `/invoices/{invoice_id}/credit-notes` | `payment:create` | Refund: credit note + refund payment | routes-final §8.B.7 |
| 8.11 | CHANGED | GET | `/invoices/{invoice_id}/credit-notes/{invoice_credit_note_id}` | `payment:read` | Get one | routes-final §8.B.7 |
| 8.12 | KEPT | GET | `/payments` | `payment:read` | The ledger | routes-final §8.C.7 |
| 8.13 | KEPT | GET | `/payments/exports` | `payment:export` | The payments CSV | routes-final §8.C.7 |
| 8.14 | KEPT | POST | `/payments` | `payment:create` | Receive, pay an expense or a supplier bill, record money back | routes-final §8.C.7 |
| 8.15 | KEPT | GET | `/payments/{payment_id}` | `payment:read` | Get a payment | routes-final §8.C.7 |
| 8.16 | KEPT | PATCH | `/payments/{payment_id}` | `payment:update` | Change it on an open day — recorded | routes-final §8.C.7 |
| 8.17 | NEW | GET | `/payments/{payment_id}/edits` | `payment:read` | What changed | routes-final §8.C.7 |
| 8.18 | NEW | POST | `/payments/{payment_id}/reverse` | `payment:delete` | Undo a settled payment | routes-final §8.C.7 |
| 8.19 | KEPT | DELETE | `/payments/{payment_id}` | `payment:delete` | Delete on an open day | routes-final §8.C.7 |
| 8.20 | KEPT | POST | `/payments/{payment_id}/restore` | `payment:delete` | Undo | routes-final §8.C.7 |
| 8.21 | KEPT | GET | `/pending-credits` | `payment:read` | List pending credits | routes-final §8.D.7 |
| 8.22 | KEPT | POST | `/pending-credits` | `payment:create` | Add one — give or take | routes-final §8.D.7 |
| 8.23 | KEPT | GET | `/pending-credits/{pending_credit_id}` | `payment:read` | Get one | routes-final §8.D.7 |
| 8.24 | KEPT | PATCH | `/pending-credits/{pending_credit_id}` | `payment:update` | Change it, while nothing is settled | routes-final §8.D.7 |
| 8.25 | KEPT | DELETE | `/pending-credits/{pending_credit_id}` | `payment:delete` | Delete it, while nothing is settled | routes-final §8.D.7 |
| 8.26 | KEPT | POST | `/pending-credits/{pending_credit_id}/restore` | `payment:delete` | Undo | routes-final §8.D.7 |
| 8.27 | NEW | POST | `/pending-credits/{pending_credit_id}/settle` | `payment:create` | Give back, get back, or use on a bill | routes-final §8.D.7 |
| 8.28 | KEPT | GET | `/day-closes` | `payment:read` | Past and open days | routes-final §8.E.7 |
| 8.29 | KEPT | POST | `/day-closes` | `payment:update` | Open the day — accept or recount the opening cash | routes-final §8.E.7 |
| 8.30 | KEPT | GET | `/day-closes/{day_close_id}` | `payment:read` | A day, with its live figures and events | routes-final §8.E.7 |
| 8.31 | KEPT | POST | `/day-closes/{day_close_id}/close` | `payment:update` | Count and close — locks the day | routes-final §8.E.7 |
| 8.32 | KEPT | POST | `/day-closes/{day_close_id}/reopen` | `payment:delete` | Reopen a closed day | routes-final §8.E.7 |

## 9. Stock

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 9.1 | KEPT | GET | `/stock-items` | `stock_item:read` | The Items tab | routes-final §9.A.7 |
| 9.2 | KEPT | GET | `/stock-items/exports` | `stock_item:export` | The items CSV | routes-final §9.A.7 |
| 9.3 | KEPT | POST | `/stock-items` | `stock_item:create` | Add an item, with its opening quantity | routes-final §9.A.7 |
| 9.4 | KEPT | GET | `/stock-items/{stock_item_id}` | `stock_item:read` | Get an item | routes-final §9.A.7 |
| 9.5 | KEPT | PATCH | `/stock-items/{stock_item_id}` | `stock_item:update` | Change an item (not its quantity) | routes-final §9.A.7 |
| 9.6 | KEPT | DELETE | `/stock-items/{stock_item_id}` | `stock_item:delete` | Delete an item at zero | routes-final §9.A.7 |
| 9.7 | KEPT | POST | `/stock-items/{stock_item_id}/restore` | `stock_item:delete` | Undo | routes-final §9.A.7 |
| 9.8 | CHANGED | GET | `/stock-item-movements` | `stock_item:read` | Every movement — the Movements tab | routes-final §9.B.7 |
| 9.9 | KEPT | GET | `/stock-items/{stock_item_id}/movements` | `stock_item:read` | An item's history | routes-final §9.B.7 |
| 9.10 | CHANGED | POST | `/stock-items/{stock_item_id}/movements` | `stock_item:update` | Use, receive, damage, return or adjust | routes-final §9.B.7 |
| 9.11 | CHANGED | GET | `/stock-items/{stock_item_id}/movements/{stock_item_movement_id}` | `stock_item:read` | Get one | routes-final §9.B.7 |
| 9.12 | NEW | POST | `/stock-items/{stock_item_id}/movements/{stock_item_movement_id}/revert` | `stock_item:update` | Revert it with a reason | routes-final §9.B.7 |
| 9.13 | KEPT | GET | `/stock-counts` | `stock_item:read` | Past stock checks | routes-final §9.C.7 |
| 9.14 | KEPT | POST | `/stock-counts` | `stock_item:update` | Save a stock check — adjusts what differs | routes-final §9.C.7 |
| 9.15 | KEPT | GET | `/stock-counts/{stock_count_id}` | `stock_item:read` | Get one | routes-final §9.C.7 |
| 9.16 | KEPT | GET | `/stock-purchases` | `stock_item:read` | The Purchases tab | routes-final §9.D.7 |
| 9.17 | KEPT | GET | `/stock-purchases/exports` | `stock_item:export` | The purchases CSV | routes-final §9.D.7 |
| 9.18 | KEPT | POST | `/stock-purchases` | `stock_item:create` | Record a purchase — receives its lines, optionally pays | routes-final §9.D.7 |
| 9.19 | KEPT | GET | `/stock-purchases/{stock_purchase_id}` | `stock_item:read` | Get one | routes-final §9.D.7 |
| 9.20 | KEPT | PATCH | `/stock-purchases/{stock_purchase_id}` | `stock_item:update` | Change the bill details | routes-final §9.D.7 |
| 9.21 | KEPT | DELETE | `/stock-purchases/{stock_purchase_id}` | `stock_item:delete` | Delete an unpaid purchase | routes-final §9.D.7 |
| 9.22 | KEPT | POST | `/stock-purchases/{stock_purchase_id}/restore` | `stock_item:delete` | Undo | routes-final §9.D.7 |
| 9.23 | KEPT | GET | `/stock-vendors` | `stock_item:read` | The vendor picker | routes-final §9.E.7 |
| 9.24 | KEPT | POST | `/stock-vendors` | `stock_item:create` | Add a vendor | routes-final §9.E.7 |
| 9.25 | KEPT | GET | `/stock-vendors/{stock_vendor_id}` | `stock_item:read` | Get one | routes-final §9.E.7 |
| 9.26 | KEPT | PATCH | `/stock-vendors/{stock_vendor_id}` | `stock_item:update` | Change one | routes-final §9.E.7 |
| 9.27 | KEPT | DELETE | `/stock-vendors/{stock_vendor_id}` | `stock_item:delete` | Delete one with nothing owed | routes-final §9.E.7 |
| 9.28 | KEPT | POST | `/stock-vendors/{stock_vendor_id}/restore` | `stock_item:delete` | Undo | routes-final §9.E.7 |

## 10. Tasks & rules

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 10.1 | KEPT | GET | `/tasks` | `task:read` | The Tasks tabs — To do, Snoozed, Done | routes-final §10.A.7 |
| 10.2 | KEPT | GET | `/tasks/exports` | `task:export` | The tasks CSV | routes-final §10.A.7 |
| 10.3 | KEPT | POST | `/tasks` | `task:create` | Add a task by hand | routes-final §10.A.7 |
| 10.4 | KEPT | GET | `/tasks/{task_id}` | `task:read` | Get a task (the drawer) | routes-final §10.A.7 |
| 10.5 | KEPT | PATCH | `/tasks/{task_id}` | `task:update` | Change a task made by hand | routes-final §10.A.7 |
| 10.6 | KEPT | POST | `/tasks/{task_id}/snooze` | `task:update` | Snooze it | routes-final §10.A.7 |
| 10.7 | KEPT | POST | `/tasks/{task_id}/resolve` | `task:update` | Take an outcome — optionally set the next step | routes-final §10.A.7 |
| 10.8 | NEW | POST | `/tasks/{task_id}/reassign` | `task:update` | Give it to someone or a role queue | routes-final §10.A.7 |
| 10.9 | KEPT | DELETE | `/tasks/{task_id}` | `task:delete` | Delete a task made by hand | routes-final §10.A.7 |
| 10.10 | KEPT | POST | `/tasks/{task_id}/restore` | `task:delete` | Undo | routes-final §10.A.7 |
| 10.11 | KEPT | GET | `/task-rule-settings` | `task:read` | Every rule and its switches (the Rules popover) | routes-final §10.B.7 |
| 10.12 | KEPT | PUT | `/task-rule-settings` | `organization:update` | Turn rules on or off; let Clinozy handle them | routes-final §10.B.7 |

## Before → after

One row per `CHANGED` route; the decision in **Why** gives the path or shape it replaces.

| # | Route | What changes | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| 1.6 | GET `/branches/{branch_id}/members` | renamed | see the decision named in Why — today's path or shape | GET `/branches/{branch_id}/members` | §1 |
| 1.7 | PUT `/branches/{branch_id}/members` | renamed | see the decision named in Why — today's path or shape | PUT `/branches/{branch_id}/members` | §1 |
| 1.10 | GET `/branches/{branch_id}/rooms/{branch_room_id}` | moved | see the decision named in Why — today's path or shape | GET `/branches/{branch_id}/rooms/{branch_room_id}` | §1 |
| 1.11 | PATCH `/branches/{branch_id}/rooms/{branch_room_id}` | moved | see the decision named in Why — today's path or shape | PATCH `/branches/{branch_id}/rooms/{branch_room_id}` | §1 |
| 1.12 | DELETE `/branches/{branch_id}/rooms/{branch_room_id}` | moved | see the decision named in Why — today's path or shape | DELETE `/branches/{branch_id}/rooms/{branch_room_id}` | §1 |
| 1.13 | POST `/branches/{branch_id}/rooms/{branch_room_id}/restore` | moved | see the decision named in Why — today's path or shape | POST `/branches/{branch_id}/rooms/{branch_room_id}/restore` | §1 |
| 1.16 | GET `/branches/{branch_id}/machines/{branch_machine_id}` | moved | see the decision named in Why — today's path or shape | GET `/branches/{branch_id}/machines/{branch_machine_id}` | §1 |
| 1.17 | PATCH `/branches/{branch_id}/machines/{branch_machine_id}` | moved | see the decision named in Why — today's path or shape | PATCH `/branches/{branch_id}/machines/{branch_machine_id}` | §1 |
| 1.18 | DELETE `/branches/{branch_id}/machines/{branch_machine_id}` | moved | see the decision named in Why — today's path or shape | DELETE `/branches/{branch_id}/machines/{branch_machine_id}` | §1 |
| 1.19 | POST `/branches/{branch_id}/machines/{branch_machine_id}/restore` | moved | see the decision named in Why — today's path or shape | POST `/branches/{branch_id}/machines/{branch_machine_id}/restore` | §1 |
| 1.22 | GET `/branches/{branch_id}/holidays/{branch_holiday_id}` | moved | see the decision named in Why — today's path or shape | GET `/branches/{branch_id}/holidays/{branch_holiday_id}` | §1 |
| 1.23 | PATCH `/branches/{branch_id}/holidays/{branch_holiday_id}` | moved | see the decision named in Why — today's path or shape | PATCH `/branches/{branch_id}/holidays/{branch_holiday_id}` | §1 |
| 1.24 | DELETE `/branches/{branch_id}/holidays/{branch_holiday_id}` | moved | see the decision named in Why — today's path or shape | DELETE `/branches/{branch_id}/holidays/{branch_holiday_id}` | §1 |
| 1.25 | POST `/branches/{branch_id}/holidays/{branch_holiday_id}/restore` | moved | see the decision named in Why — today's path or shape | POST `/branches/{branch_id}/holidays/{branch_holiday_id}/restore` | §1 |
| 2.1 | GET `/app/memberships` | renamed | see the decision named in Why — today's path or shape | GET `/app/memberships` | T5 |
| 2.9 | DELETE `/tenancy/organization/memberships/{membership_id}/invitation` | moved | see the decision named in Why — today's path or shape | DELETE `/tenancy/organization/memberships/{membership_id}/invitation` | T9 |
| 2.10 | POST `/tenancy/organization/memberships/{membership_id}/invitation/resend` | moved | see the decision named in Why — today's path or shape | POST `/tenancy/organization/memberships/{membership_id}/invitation/resend` | T9 |
| 2.11 | POST `/tenancy/membership-invitations/{membership_invitation_id}/accept` | renamed | see the decision named in Why — today's path or shape | POST `/tenancy/membership-invitations/{membership_invitation_id}/accept` | T9 |
| 2.21 | GET `/app/memberships/me/preferences` | renamed | see the decision named in Why — today's path or shape | GET `/app/memberships/me/preferences` | §2 |
| 2.22 | PATCH `/app/memberships/me/preferences` | renamed | see the decision named in Why — today's path or shape | PATCH `/app/memberships/me/preferences` | §2 |
| 2.23 | GET `/app/memberships/me/saved-views` | renamed | see the decision named in Why — today's path or shape | GET `/app/memberships/me/saved-views` | §2 |
| 2.24 | POST `/app/memberships/me/saved-views` | renamed | see the decision named in Why — today's path or shape | POST `/app/memberships/me/saved-views` | §2 |
| 2.25 | GET `/app/memberships/me/saved-views/{membership_saved_view_id}` | renamed | see the decision named in Why — today's path or shape | GET `/app/memberships/me/saved-views/{membership_saved_view_id}` | §2 |
| 2.26 | PATCH `/app/memberships/me/saved-views/{membership_saved_view_id}` | renamed | see the decision named in Why — today's path or shape | PATCH `/app/memberships/me/saved-views/{membership_saved_view_id}` | §2 |
| 2.27 | DELETE `/app/memberships/me/saved-views/{membership_saved_view_id}` | renamed | see the decision named in Why — today's path or shape | DELETE `/app/memberships/me/saved-views/{membership_saved_view_id}` | §2 |
| 4.1 | GET `/contacts` | rebuilt | see the decision named in Why — today's path or shape | GET `/contacts` | §4 |
| 4.10 | GET `/contacts/{contact_id}/activities` | moved | see the decision named in Why — today's path or shape | GET `/contacts/{contact_id}/activities` | M1 |
| 4.16 | POST `/contact-activities/message-batches` | renamed | see the decision named in Why — today's path or shape | POST `/contact-activities/message-batches` | M12 |
| 6.18 | POST `/appointments/{appointment_id}/stage` | was the visit's | see the decision named in Why — today's path or shape | POST `/appointments/{appointment_id}/stage` | A10 |
| 6.19 | POST `/appointments/{appointment_id}/pause` | was the visit's | see the decision named in Why — today's path or shape | POST `/appointments/{appointment_id}/pause` | §6 |
| 6.20 | POST `/appointments/{appointment_id}/resume` | was the visit's | see the decision named in Why — today's path or shape | POST `/appointments/{appointment_id}/resume` | §6 |
| 7.10 | GET `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}` | moved | see the decision named in Why — today's path or shape | GET `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}` | §7 |
| 7.11 | DELETE `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}` | moved | see the decision named in Why — today's path or shape | DELETE `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}` | §7 |
| 7.12 | POST `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}/restore` | moved | see the decision named in Why — today's path or shape | POST `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}/restore` | §7 |
| 7.16 | GET `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | moved | see the decision named in Why — today's path or shape | GET `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | §7 |
| 7.17 | PATCH `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | moved | see the decision named in Why — today's path or shape | PATCH `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | §7 |
| 7.18 | POST `/patients/{patient_id}/prescriptions/{patient_prescription_id}/approve` | moved | see the decision named in Why — today's path or shape | POST `/patients/{patient_id}/prescriptions/{patient_prescription_id}/approve` | §7 |
| 7.19 | DELETE `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | moved | see the decision named in Why — today's path or shape | DELETE `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | §7 |
| 7.20 | POST `/patients/{patient_id}/prescriptions/{patient_prescription_id}/restore` | moved | see the decision named in Why — today's path or shape | POST `/patients/{patient_id}/prescriptions/{patient_prescription_id}/restore` | §7 |
| 7.27 | GET `/patient-diagnoses` | renamed | see the decision named in Why — today's path or shape | GET `/patient-diagnoses` | §7 |
| 7.28 | POST `/patient-diagnoses` | renamed | see the decision named in Why — today's path or shape | POST `/patient-diagnoses` | §7 |
| 7.29 | GET `/patient-diagnoses/{patient_diagnosis_id}` | renamed | see the decision named in Why — today's path or shape | GET `/patient-diagnoses/{patient_diagnosis_id}` | §7 |
| 7.30 | PATCH `/patient-diagnoses/{patient_diagnosis_id}` | renamed | see the decision named in Why — today's path or shape | PATCH `/patient-diagnoses/{patient_diagnosis_id}` | §7 |
| 7.31 | DELETE `/patient-diagnoses/{patient_diagnosis_id}` | renamed | see the decision named in Why — today's path or shape | DELETE `/patient-diagnoses/{patient_diagnosis_id}` | §7 |
| 7.32 | POST `/patient-diagnoses/{patient_diagnosis_id}/restore` | renamed | see the decision named in Why — today's path or shape | POST `/patient-diagnoses/{patient_diagnosis_id}/restore` | §7 |
| 7.35 | GET `/patients/{patient_id}/images/{patient_image_id}` | moved | see the decision named in Why — today's path or shape | GET `/patients/{patient_id}/images/{patient_image_id}` | §7 |
| 7.36 | PATCH `/patients/{patient_id}/images/{patient_image_id}` | moved | see the decision named in Why — today's path or shape | PATCH `/patients/{patient_id}/images/{patient_image_id}` | §7 |
| 7.37 | DELETE `/patients/{patient_id}/images/{patient_image_id}` | moved | see the decision named in Why — today's path or shape | DELETE `/patients/{patient_id}/images/{patient_image_id}` | §7 |
| 7.38 | POST `/patients/{patient_id}/images/{patient_image_id}/restore` | moved | see the decision named in Why — today's path or shape | POST `/patients/{patient_id}/images/{patient_image_id}/restore` | §7 |
| 7.41 | GET `/patients/{patient_id}/reports/{patient_report_id}` | moved | see the decision named in Why — today's path or shape | GET `/patients/{patient_id}/reports/{patient_report_id}` | §7 |
| 7.42 | PATCH `/patients/{patient_id}/reports/{patient_report_id}` | moved | see the decision named in Why — today's path or shape | PATCH `/patients/{patient_id}/reports/{patient_report_id}` | §7 |
| 7.43 | DELETE `/patients/{patient_id}/reports/{patient_report_id}` | moved | see the decision named in Why — today's path or shape | DELETE `/patients/{patient_id}/reports/{patient_report_id}` | §7 |
| 7.44 | POST `/patients/{patient_id}/reports/{patient_report_id}/restore` | moved | see the decision named in Why — today's path or shape | POST `/patients/{patient_id}/reports/{patient_report_id}/restore` | §7 |
| 7.45 | GET `/patient-treatments` | renamed | see the decision named in Why — today's path or shape | GET `/patient-treatments` | §7 |
| 7.48 | GET `/patients/{patient_id}/treatments/{patient_treatment_id}` | moved | see the decision named in Why — today's path or shape | GET `/patients/{patient_id}/treatments/{patient_treatment_id}` | §7 |
| 7.49 | PATCH `/patients/{patient_id}/treatments/{patient_treatment_id}` | moved | see the decision named in Why — today's path or shape | PATCH `/patients/{patient_id}/treatments/{patient_treatment_id}` | §7 |
| 7.50 | POST `/patients/{patient_id}/treatments/{patient_treatment_id}/reverse` | moved | see the decision named in Why — today's path or shape | POST `/patients/{patient_id}/treatments/{patient_treatment_id}/reverse` | §7 |
| 7.53 | GET `/patients/{patient_id}/check-ins/{patient_check_in_id}` | moved | see the decision named in Why — today's path or shape | GET `/patients/{patient_id}/check-ins/{patient_check_in_id}` | §7 |
| 7.54 | PATCH `/patients/{patient_id}/check-ins/{patient_check_in_id}` | moved | see the decision named in Why — today's path or shape | PATCH `/patients/{patient_id}/check-ins/{patient_check_in_id}` | §7 |
| 7.55 | DELETE `/patients/{patient_id}/check-ins/{patient_check_in_id}` | moved | see the decision named in Why — today's path or shape | DELETE `/patients/{patient_id}/check-ins/{patient_check_in_id}` | §7 |
| 7.56 | POST `/patients/{patient_id}/check-ins/{patient_check_in_id}/restore` | moved | see the decision named in Why — today's path or shape | POST `/patients/{patient_id}/check-ins/{patient_check_in_id}/restore` | §7 |
| 7.59 | GET `/patients/{patient_id}/reviews/{patient_review_id}` | moved | see the decision named in Why — today's path or shape | GET `/patients/{patient_id}/reviews/{patient_review_id}` | §7 |
| 7.60 | PATCH `/patients/{patient_id}/reviews/{patient_review_id}` | moved | see the decision named in Why — today's path or shape | PATCH `/patients/{patient_id}/reviews/{patient_review_id}` | §7 |
| 7.61 | DELETE `/patients/{patient_id}/reviews/{patient_review_id}` | moved | see the decision named in Why — today's path or shape | DELETE `/patients/{patient_id}/reviews/{patient_review_id}` | §7 |
| 7.62 | POST `/patients/{patient_id}/reviews/{patient_review_id}/restore` | moved | see the decision named in Why — today's path or shape | POST `/patients/{patient_id}/reviews/{patient_review_id}/restore` | §7 |
| 7.63 | POST `/patients/{patient_id}/check-ins/{patient_check_in_id}/actions` | moved | see the decision named in Why — today's path or shape | POST `/patients/{patient_id}/check-ins/{patient_check_in_id}/actions` | §7 |
| 7.64 | POST `/patients/{patient_id}/reviews/{patient_review_id}/actions` | moved | see the decision named in Why — today's path or shape | POST `/patients/{patient_id}/reviews/{patient_review_id}/actions` | §7 |
| 7.65 | GET `/patients/{patient_id}/offerings` | renamed | see the decision named in Why — today's path or shape | GET `/patients/{patient_id}/offerings` | §7 |
| 7.66 | GET `/patients/{patient_id}/offerings/{patient_offering_id}` | moved | see the decision named in Why — today's path or shape | GET `/patients/{patient_id}/offerings/{patient_offering_id}` | §7 |
| 7.67 | PATCH `/patients/{patient_id}/offerings/{patient_offering_id}` | moved | see the decision named in Why — today's path or shape | PATCH `/patients/{patient_id}/offerings/{patient_offering_id}` | §7 |
| 7.70 | GET `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | moved | see the decision named in Why — today's path or shape | GET `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | §7 |
| 7.71 | PATCH `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | moved | see the decision named in Why — today's path or shape | PATCH `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | §7 |
| 7.72 | DELETE `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | moved | see the decision named in Why — today's path or shape | DELETE `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | §7 |
| 7.73 | POST `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}/restore` | moved | see the decision named in Why — today's path or shape | POST `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}/restore` | §7 |
| 8.8 | GET `/invoice-credit-notes` | renamed | see the decision named in Why — today's path or shape | GET `/invoice-credit-notes` | §8 |
| 8.11 | GET `/invoices/{invoice_id}/credit-notes/{invoice_credit_note_id}` | moved | see the decision named in Why — today's path or shape | GET `/invoices/{invoice_id}/credit-notes/{invoice_credit_note_id}` | §8 |
| 9.8 | GET `/stock-item-movements` | renamed | see the decision named in Why — today's path or shape | GET `/stock-item-movements` | §9 |
| 9.10 | POST `/stock-items/{stock_item_id}/movements` | moved | see the decision named in Why — today's path or shape | POST `/stock-items/{stock_item_id}/movements` | §9 |
| 9.11 | GET `/stock-items/{stock_item_id}/movements/{stock_item_movement_id}` | moved | see the decision named in Why — today's path or shape | GET `/stock-items/{stock_item_id}/movements/{stock_item_movement_id}` | §9 |
