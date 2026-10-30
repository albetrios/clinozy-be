`src/domains/app/sub-domains/leads/`

# Lead

Parent: [app](../../app.overview.md)

## Purpose

One enquiry and its working state — status, source, interests, owner and hold, follow-up — for one
contact (launch ROUTE #131 — routes-final §5). The person lives on the [contact](../contacts/contacts.overview.md)
(L1); its conversation is the contact's activity. Tables `app.leads` and
`app.lead_involved_memberships` (who else works it, up to 10). One folder, no nested sub-domains.

## Layout

| File / folder | Role |
| --- | --- |
| `leads.schema.ts` | `app.leads` (the lead-number trigger in the baseline migration; the one-open-lead-per-contact partial unique index, L6; CHECKs; RLS) and `app.lead_involved_memberships` (composite keys into the organization's memberships) |
| `leads.constants.ts` | statuses (open and closed — and the closing ones a booked lead may still take), sources, interests and their labels, kinds, the `ownership` filter values, the caps |
| `leads.{dto,validator,serializer,types}.ts` | request shapes (`contact_id` or an inline `contact`); the `q` rules (the contact's text and numbers, `C-12345`, `#2371`); the response |
| `leads.rules.ts` | the open-lead check that names the lead, `appointment_scheduled` (the bookings', L11), `clinic_visited` (check-in's, final), the owner's hold, the replaced owner kept involved, the team added to the contact's members, claim and release, the contact summary |
| `leads.repository.ts` | the shared app record layers on this table: sorts (`created_at`, `name`, `status`, `source`, `follow_up_at`, `last_activity_at` — empty values last), derived filters (`search`, `interests`, `team_membership_id`, `is_awaiting_reply`, `ownership`), the contact and patient reads, the leave part, the moves the activity stream makes, the bookings' move (`followBookings`, L11), the check-in's win-back (`winBack`, D2) |
| `leads.service.ts` / `.controller.ts` / `.routes.ts` | routes 1–9 below; an inline `contact` is created through the contacts service in the same transaction |
| `seed/` | `seedLead` and `seedLeadsBulk` (two leads per organization on the contacts seed's people) |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/leads` | `lead:read` |
| `GET /app/leads/exports` | `lead:export` (+ `lead:read`) |
| `POST /app/leads` | `lead:create` (+ `contact:create` for an inline `contact`) |
| `GET /app/leads/{lead_id}` | `lead:read` |
| `PATCH /app/leads/{lead_id}` | `lead:update` |
| `DELETE /app/leads/{lead_id}` | `lead:delete` |
| `POST /app/leads/{lead_id}/restore` | `lead:delete` |
| `POST /app/leads/{lead_id}/claim` | `lead:update` |
| `POST /app/leads/{lead_id}/release` | `lead:update` |

## Key invariants

- **One open lead per contact (L6):** open = `new`, `contacted`, `follow_up`,
  `appointment_scheduled`, `no_response`; a
  create, a reopening `PATCH` or a restore of a second is a 409 `lead_open_exists` naming the one
  there; the partial unique index backs it up.
- **`clinic_visited` is check-in's (L8):** set only when the person checks in at an appointment
  (sub-domain 6) — the open lead, or one closed as `lost` / `not_interested` within 90 days won
  back (`winBack`, D2) — and final; a 409 `lead_closed` otherwise; claim and release work on open leads only. A claim is one guarded `UPDATE` (`LeadsRepository.claim`): two members claiming at once cannot both win — the loser gets the 409 `lead_held`.
- **`appointment_scheduled` follows the bookings (L11):** a scheduled or confirmed appointment of
  the person — booked, reinstated or restored — moves their open lead there; when the last one is
  cancelled, marked no-show or removed it goes back to `follow_up`, its `follow_up_at` now, so the
  follow-up task opens again (a `system` line in the stream either way —
  `LeadsRepository.followBookings`, run by the appointments rules after every booking write). A
  reschedule is a move of the same booking, so the lead stays. Neither a create nor a `PATCH`
  sets it (409 `lead_status_by_booking`); while a booking is still to happen a `PATCH` leaves it
  only for `not_interested`, `invalid` or `lost` (the same 409 otherwise — cancel the booking); a
  lead created, reopened or restored for a booked person starts in it. The `follow_up` task rule
  skips it — the booking's own tasks follow the person up.
- **The close date (D10, D11, D13):** `closed_at` is stamped when a lead enters `not_interested`,
  `invalid`, `lost` or `clinic_visited`, kept while it moves between them, emptied on a reopen;
  output only (a body sending it is a 400) and held by `chk_leads_closed_at`. The win-back's 90
  days count from it; the export carries it.
- **The hold (D40, L9):** a new owner holds the lead for `lead_hold_days`; no owner, no hold
  (`chk_leads_held_until_owner`); the owner a claim or `PATCH` replaces stays involved, and the owner
  is never also involved. A member who leaves releases their leads and stays involved (K4).
- **The contact (L1, CT7, CT11):** `ON DELETE RESTRICT`, and a contact a live lead points at cannot
  be removed (`contact_in_use`); the owner and involved members handle the contact.
- **Moves from the stream (5.10):** a sent line moves the contact's open lead from `new` to
  `contacted`; a message's `<interest>` is the open lead's first interest.
- **Who worked it (WC-16, D79):** a member who sends the person a message, logs a call, writes a
  note or books their visit joins the open lead's involved members (`involveInOpenLead` — never its
  owner, at most ten).
- **Re-target leads (D35, WC-17):** the task rules run opens one (`kind` `retarget`, no owner) for
  each patient whose last visit is `retarget_after_days` ago, with marketing consent and nothing
  booked; staff send the first message.
- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm
  (USING only) lets the deleted-record purge (D38) erase rows. Branch visibility is the service's
  (D9 — no branch = every branch).
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other`
  needs a `delete_note`.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who
  changed it and when.
