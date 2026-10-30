# Clinozy API — final routes for feat-lead-follows-bookings, sub-domain by sub-domain

**Route review final — 2026-10-30.** Every sub-domain is confirmed (D16–D18); the frontend may kick off on these routes.

Started 2026-10-30 from the code on `feat/lead-follows-bookings` (= `6e92210`, the first slice — D9 — on `main` at
`f0975e7`). This file is the iteration's route review (`be-iteration-planning` Step 5), shaped by
[`routes-final-template.md`](../../../docs/design-workflow/process/routes-final-template.md). Each sub-domain is finalized
one at a time: **rev n — awaiting your OK** → **final** only after you confirm it in chat. It is the binding design:
kickoff builds it ditto, and where agent-os cannot, the row stops and asks first.

What exists is the code as built — the launch's route review as the code stands, `docs/routes.txt`, and the first slice
of this change (`6e92210`) — and this file only describes what this iteration adds or changes on top of it. Rows marked
**(built — verify)** are already in the first slice; kickoff checks them against this review instead of writing them.

How to read the tables: paths are under `/api/v1/app`; `{x_id}` is a public id; **Gate** is the permission the caller
needs; **Idem** `req` = `X-Idempotency-Key` header required; `*` = required.

## Sub-domains (in build order — each builds on the ones above it)

| # | Sub-domain | Folder (`src/domains/app/sub-domains/…`) | Paths (`/app/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Leads — **CHANGED** | `leads/` (as built) | `leads` — routes 1, 2, 3, 4, 5, 7 | 6 changed (of 9) | contacts, appointments (read) | **final (rev 1, confirmed 2026-10-30)** |
| 2 | Appointments — **CHANGED** | `appointments/` (as built) | `appointments` — routes 5, 8, 9, 11, 13, 14, 15, 17 | 8 changed (of 20) | 1, contacts, patients | **final (rev 1, confirmed 2026-10-30)** |
| 3 | Tasks — **CHANGED rule, no route** | `tasks/` (as built) | — | 0 | 1 | **final (rev 1, confirmed 2026-10-30)** |

App total: **no route added or removed; 14 routes change behaviour or output** — sub-domain 1: the booking status and the
close date on the lead; sub-domain 2: every booking write moves the person's lead, and a check-in wins a closed lead back;
sub-domain 3: the lead's follow-up task waits while a visit is booked.

## Code layout and tables without routes

Every sub-domain is one folder, laid out like a domain, as built. No table is added; `app.leads` gains one column
(1.3). The appointments rules write the person's lead **through the leads repository** in the booking's transaction, as
the check-in conversion does today (as built — `convertAtCheckIn`).

## Rules for every sub-domain

The launch's rules hold unchanged. This iteration adds **no pointer** (no new foreign key), so no member-leave rule
changes.

| # | Rule |
| --- | --- |
| K-L11 | **A lead follows its person's bookings.** "A booking still to happen" = a live (not removed) appointment of the contact that is `scheduled` or `confirmed` — its date passed or not. While one exists, the contact's **open** lead is `appointment_scheduled`; when none is left, a lead in `appointment_scheduled` goes back to `follow_up`, its `follow_up_at` now. Every move the server makes writes one `system` line in the contact's stream naming why. |
| K-WB | **A check-in converts — an open lead first, else a lead won back.** The contact's open lead → `clinic_visited` (as built). With no open lead, the contact's **latest** lead (most recently created, live) closed as `lost` or `not_interested` with `closed_at` within the last 90 days → `clinic_visited` ("Won back"). `invalid`, older, or none → nothing. |

## Connections

```text
1) WHO POINTS AT WHOM                      A ──► B = a column on A points at B   (all as built — no new pointer)

   app.contacts ◄── app.leads · app.appointments · app.patients · app.contact_activities
   app.leads ◄───── app.patients.lead_id (the lead a file came from) · app.tasks.lead_id

2) THE GRAPH — each row reads the columns marked ●  (○ = writes there through the other's repository, same transaction)

                     Contacts  Leads  Appointments  Patients  Activities  Tasks
   1  Leads          ●         —      ●
   2  Appointments   ●         ●○     —             ●○        ○
   3  Tasks                    ●      ●                                   —

3) WHAT ONE ACTION SETS OFF (same transaction unless marked worker)

   2 POST /appointments (a booking), …/copy, …/reinstate, …/restore ─► the open lead → appointment_scheduled · a stream line
   2 PATCH /appointments/{id} (a reschedule), …/confirm ────────────► nothing (the booking is still to happen)
   2 …/cancel, …/no-show, DELETE (the last booking still to happen) ─► the lead → follow_up, follow_up_at now · a stream line
   2 …/check-in, a walk-in (POST is_walk_in) ────────────────────────► the open lead → clinic_visited, else a lead won back · the file opens linked · a stream line
   1 POST /leads, PATCH (reopen), …/restore — a booked person ───────► the lead → appointment_scheduled (in the response)
   1 PATCH (close) · 2 check-in · 2 win-back ────────────────────────► closed_at stamped; a reopen empties it
   any booking write ───────────────────────────────────────────────► the task rules run after the commit — follow-up task opens / closes   [worker]
```

---

## 1. Leads — final (rev 1, confirmed 2026-10-30) — nested sub-domain 1.A only

Code: the **`leads` sub-domain folder** — `app/sub-domains/leads/` (the lead at the folder root), as built. No nested
sub-domain.

1.1 Decisions · 1.2 Open questions · 1.3 Tables and relations · 1.4 Permissions · 1.5 Common to every route ·
1.6 Objects returned · 1.7 Routes · 1.8 Request details · 1.9 Errors · 1.10 Rules worth knowing · 1.11 Code changes ·
1.12 Nested sub-domains · then **1.A Leads** with the same eleven sections.

What changes: the lead gains the booking status `appointment_scheduled` (built — verify) and a **close date**; the rules
that keep both true when the lead is written by hand. Sources: BRIEF.md:56–68, 109–120; D1, D2, D7, D10–D12.

### 1.1 Decisions (whole sub-domain)

| # | Decision |
| --- | --- |
| LF1 | **`appointment_scheduled` is an open status owned by the bookings** (built — verify). Open: one open lead per contact counts it (the partial unique index), claim, release and the hold work on it. Before the first slice: no such status; a lead stayed in Follow-up whatever was booked. |
| LF2 | **By hand** (built — verify): `POST` and `PATCH` sending `status: appointment_scheduled` → `409 lead_status_by_booking`; while the contact has a booking still to happen, a `PATCH` leaves `appointment_scheduled` only for `not_interested`, `invalid` or `lost` — `new`, `contacted`, `follow_up`, `no_response` → the same `409`, its message naming the way (cancel the appointment). With no booking left (a stale status) the move is allowed. Before: any status but `clinic_visited` could follow any. |
| LF3 | **A booked person's lead starts booked** (built — verify): a create, a reopening `PATCH` (closed → open) or a restore of an open lead, for a contact with a booking still to happen, is saved and answered as `appointment_scheduled`. |
| LF4 | **The close date** (D7, D10): new `closed_at` — set to now whenever the lead **enters** a closing status (`not_interested`, `invalid`, `lost`, `clinic_visited`) by any path (a create in a closing status, a `PATCH`, a check-in, a win-back), kept while it moves between closing statuses by hand, **emptied** when it moves to an open status. A database `CHECK` holds it: `closed_at` is set exactly when the status is a closing one. Existing closed leads take their `updated_at`. Today: no close date; `updated_at` moves with any edit. Other option: no `CHECK`, the service alone keeps it — rejected: the seeds and any future writer would drift silently. |
| LF5 | **`closed_at` is read-only output** (D11): in the Lead object (list, one, the CSV export); never accepted in a body (an unknown field → `400`, as built). |
| LF6 | **The win-back read and write live here** (D2): the leads repository answers "win back the contact's latest lead closed `lost` / `not_interested` within the last 90 days, if it has no open lead" in one guarded `UPDATE` (→ `clinic_visited`, `closed_at` now), returning the lead or nothing; the appointments rules call it at check-in (2.1 AF2). The 90 days is a fixed constant (`LEAD_WIN_BACK_DAYS`), not a clinic setting (BRIEF.md:153). |

### 1.2 Open questions

None.

### 1.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.leads` | one enquiry and its working state (as built) | `status` adds `appointment_scheduled` — `varchar(21)`, the `CHECK`, the one-open-lead index (built — verify, migrations `20261028131034`, `20261028131036`); **`closed_at` ADDED** (LF4) |

**PostgreSQL design** — one migration, transactional:

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `closed_at` | `timestamptz` | yes | | set exactly when `status` is `not_interested`, `invalid`, `lost` or `clinic_visited` — `chk_leads_closed_at` |

- `ADD COLUMN closed_at timestamptz` (nullable, no default — no rewrite); backfill `closed_at = updated_at` for the live
  and deleted rows in a closing status, inside the `NO FORCE` / `FORCE ROW LEVEL SECURITY` bracket (the migration lint's
  rule for data on a FORCE-RLS table); then `ADD CONSTRAINT chk_leads_closed_at CHECK ((status IN (…closing…)) = (closed_at IS NOT NULL)) NOT VALID` and `VALIDATE`.
- No index: the win-back reads one contact's leads through the existing `idx_leads_contact_id`.
- RLS: unchanged (organization policy, enabled and forced).

### 1.4 Permissions

As built — no code changes.

| Code | Routes this iteration touches |
| --- | --- |
| `lead:read` | 1, 4 (the Lead object gains `closed_at`) |
| `lead:export` | 2 (the CSV gains the column) |
| `lead:create` | 3 |
| `lead:update` | 5 |
| `lead:delete` | 7 |

### 1.5 Common to every route

As built: base `/api/v1/app`; `Authorization: Bearer`; every `POST` needs `X-Idempotency-Key`; `PATCH` takes
`expected_updated_at`; `200` with `{ data, meta }`; errors `{ error: { type, code, reason?, detail, errors[] } }`.

### 1.6 Objects returned

| Object | Where |
| --- | --- |
| Lead · Leads export | 1.A.6 — `status` may read `appointment_scheduled`; **`closed_at` added** |

### 1.7 Routes

Only the changed routes; the other three (6 delete, 8 claim, 9 release) are as built.

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/leads` | List leads — **`closed_at` in each (changed output)** | `lead:read` | |
| 2 | GET | `/leads/exports` | The leads CSV — **the `closed_at` column (changed output)** | `lead:export` | |
| 3 | POST | `/leads` | Add a lead — **booked person → `appointment_scheduled`; never by hand; a closing status stamps `closed_at` (changed)** | `lead:create` | req |
| 4 | GET | `/leads/{lead_id}` | Get one — **`closed_at` (changed output)** | `lead:read` | |
| 5 | PATCH | `/leads/{lead_id}` | Change it — **LF2, LF3, LF4 (changed)** | `lead:update` | |
| 7 | POST | `/leads/{lead_id}/restore` | Undo a delete — **booked person → `appointment_scheduled` (changed)** | `lead:delete` | req |

### 1.8 Request details

In 1.A.8.

### 1.9 Errors

In 1.A.9 — one reason, `lead_status_by_booking` (built — verify).

### 1.10 Rules worth knowing

- Every move of a lead's status by the server (a booking write, a check-in, a win-back) keeps `closed_at` true too — the
  `CHECK` refuses a write that forgets it.
- A lead in `clinic_visited` is still final by hand (L8, as built); only a check-in's win-back moves a **closed** lead,
  and only from `lost` / `not_interested`.

### 1.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| LFC1 | LF1–LF3 (built — verify): `leads.constants.ts` (status, open set, the booked closing set), `leads.schema.ts`, migrations `20261028131034` / `20261028131036`, `leads.rules.ts` (`assertBookingAllowsMove`, `followBookings`), `leads.repository.ts` (`followBookings`, `hasLiveBooking`), the `409 lead_status_by_booking` and its en/es messages — check against LF1–LF3 and their tests |
| LFC2 | LF4: migration `<timestamp>_leads_closed_at.sql` (column, backfill in the RLS bracket, `CHECK … NOT VALID` + `VALIDATE`); `closed_at` in `leads.schema.ts` with the `CHECK`; the closing set as one constant (`LEAD_CLOSED_STATUS_VALUES`) |
| LFC3 | LF4: stamp or empty `closed_at` wherever the status is written — `prepareCreate` / `prepareUpdate` in `leads.rules.ts`; `markVisited` and the win-back in `leads.repository.ts` |
| LFC4 | LF5: `closed_at` in `leads.types.ts`, the serializer and the CSV; the OpenAPI response map (`tooling/openapi/response-map/schemas/app-records.ts`) — read-only; not in the DTOs |
| LFC5 | LF6: `LeadsRepository.winBack({ contactId, userId })` — one guarded `UPDATE` (the contact has no open lead; its latest live lead; `lost` / `not_interested`; `closed_at ≥ now() − 90 days`) → `clinic_visited`, `closed_at = now()`; `LEAD_WIN_BACK_DAYS = 90` in `leads.constants.ts` |
| LFC6 | Seeds (`be-seed-maintainer`): `seedLead` stamps `closed_at` for a closing status (its `updated_at`); tests that set a closing status in SQL set `closed_at` too |
| LFC7 | Tests (`be-test-generator`): the close date on create / close / reopen / check-in; the `CHECK` refuses a closing status without it; the backfill; the export column |
| LFC8 | Docs: `leads.overview.md` (L11, the close date, the win-back), the route descriptions of 3 and 5 (`be-route-schema-doc-guard`), TSDoc |

### 1.12 Nested sub-domains

| Nested sub-domain | Folder (`src/domains/app/sub-domains/leads/…`) | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 1.A Leads | folder root | `app.leads` (+ `app.lead_involved_memberships`, unchanged) | 1–5, 7 (changed) | final |

---

### 1.A Leads — `leads/` (folder root) — final

#### 1.A.1 Decisions

LF1–LF6 (1.1) — all six are this nested sub-domain's.

#### 1.A.2 Open questions

None.

#### 1.A.3 Tables and relations

As 1.3.

#### 1.A.4 Permissions

As 1.4.

#### 1.A.5 Common to every route

As 1.5.

#### 1.A.6 Objects returned

**Lead** — as built plus **`closed_at`**: `id` (`lead_…`), `lead_number`, `contact_id`, `contact` (summary), `patient_id`,
`status` (9 values, `appointment_scheduled` among the open ones), `source`, `interests`, `kind`, `retarget_reason`,
`owner_membership_id`, `involved_membership_ids`, `held_until`, `follow_up_at`, `branch_id`, `notes`, **`closed_at`**
(read-only — when it last closed; `null` while open), `last_activity_at`, `is_awaiting_reply`, `created_at`, `updated_at`.

**Leads export** (route 2): as built, with a `closed_at` column.

#### 1.A.7 Routes (1–5, 7)

As 1.7.

#### 1.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1, 2 | as built (`status` takes `appointment_scheduled` among the nine) | — | Lead[] · Leads export |
| 3 | — | as built; `status` ≠ `appointment_scheduled` (LF2) | Lead — `appointment_scheduled` for a booked person (LF3); `closed_at` set when created in a closing status |
| 4, 7 | — | — | Lead (7: `appointment_scheduled` for a booked person, LF3) |
| 5 | — | as built; `status` ≠ `appointment_scheduled`; from `appointment_scheduled` only to a closing status while booked (LF2) | Lead — a reopen while booked answers `appointment_scheduled` (LF3); `closed_at` stamped or emptied (LF4) |

#### 1.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 3, 5 | `409` · `lead_status_by_booking` | `status: appointment_scheduled` sent (message: set when an appointment is booked) |
| 5 | `409` · `lead_status_by_booking` | leaving `appointment_scheduled` for an open status while a booking is still to happen (message: cancel the appointment to move it back to Follow-up) |
| 3, 5, 7 | as built | `lead_open_exists`, `lead_closed`, `record_changed`, `record_restore_conflict`, `400` fields |

#### 1.A.10 Rules worth knowing

None beyond 1.10.

#### 1.A.11 Code changes

LFC1–LFC8 (1.11).

---

## 2. Appointments — final (rev 1, confirmed 2026-10-30) — nested sub-domain 2.A only

Code: the **`appointments` sub-domain folder** — `app/sub-domains/appointments/` (the appointment at the folder root), as
built. No nested sub-domain.

2.1 Decisions · 2.2 Open questions · 2.3 Tables and relations · 2.4 Permissions · 2.5 Common to every route ·
2.6 Objects returned · 2.7 Routes · 2.8 Request details · 2.9 Errors · 2.10 Rules worth knowing · 2.11 Code changes ·
2.12 Nested sub-domains · then **2.A Appointments** with the same eleven sections.

What changes: every booking write keeps the person's lead in step with their bookings (built — verify), and a check-in
— a walk-in's too — wins back a lead closed as Lost or Not interested within 90 days. No field, route or error is added.
Sources: BRIEF.md:54–86, 118–123; D1–D3, D12.

### 2.1 Decisions (whole sub-domain)

| # | Decision |
| --- | --- |
| AF1 | **The lead follows the bookings** (K-L11; built — verify): after every write of a booking — a booking, a copy or rebook (route 17), a cancel, a no-show, a delete, a reinstate, a restore — the person's lead is set by K-L11 in the same transaction, with one `system` stream line when it moves: "Moved to Appointment scheduled at booking" · "Moved back to Follow-up: the appointment was cancelled" · "…: they did not come to the appointment" · "…: the appointment was removed". A reschedule (route 7) or a confirm keeps the booking, so the lead stays. Before the first slice: a booking left the lead as it was. |
| AF2 | **A check-in wins back** (K-WB, D2): at a check-in (route 11) or a walk-in (route 5, checked in as it is made), when `markVisited` finds no open lead, the leads repository's win-back (LF6) runs; a lead it moves gets the `system` line **"Won back: moved to Clinic visited at check-in"**, and when this check-in opens the patient file, the file's `lead_id` is that lead. A person who already has a file keeps its link as it is. Today: no open lead → the closed lead stays closed and the file opens unlinked (coverage K3, K8). |
| AF3 | **A walk-in touches no other booking** (D3): a walk-in or a check-in never cancels, moves or confirms another booking (as built). The heads-up is the frontend's, from route 1 as built (`contact_id`, `status=scheduled,confirmed`) — no new field. Other option: the walk-in's answer carries the next booking — rejected: the frontend reads the person's bookings already, and the answer of a create stays the booking. |
| AF4 | **Nobody is told of a win-back** (D12): the stream line and the lead's status are the record; no notification. |
| AF5 | **Undo check-in unchanged** (route 16): the booking is `confirmed` again; the lead stays `clinic_visited` (BRIEF.md:123, 151). |

### 2.2 Open questions

None.

### 2.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.appointments` | one booking (as built) | no change |
| `app.leads` (sub-domain 1) | written through the leads repository in the booking's transaction | K-L11, K-WB |
| `app.patients` (as built) | the file a check-in opens once | `lead_id` names the won-back lead when this check-in opens the file (AF2) |
| `app.contact_activities` (as built) | the contact's stream | one `system` line per lead move, `appointment_id` the booking |

**PostgreSQL design**: no change — no migration for this sub-domain.

### 2.4 Permissions

As built — no code changes.

| Code | Routes this iteration touches |
| --- | --- |
| `appointment:create` | 5, 17 |
| `appointment:update` | 11, 13, 14, 15 |
| `appointment:delete` | 8, 9 |

### 2.5 Common to every route

As 1.5.

### 2.6 Objects returned

| Object | Where |
| --- | --- |
| Appointment | 2.A.6 — unchanged (its `lead_id` is the contact's open lead, as built — after a move it names the same lead, now `appointment_scheduled`) |

### 2.7 Routes

Only the changed routes; the other twelve are as built (1 list, 7 change/move, 10 confirm and 16 undo-check-in among
them, unchanged).

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 5 | POST | `/appointments` | Book, or a walk-in — **the lead follows (AF1); a walk-in's check-in wins back (AF2) (changed)** | `appointment:create` | req |
| 8 | DELETE | `/appointments/{appointment_id}` | Delete with a reason — **the last one → the lead back to Follow-up (changed)** | `appointment:delete` | |
| 9 | POST | `/appointments/{appointment_id}/restore` | Undo a delete — **the lead booked again (changed)** | `appointment:delete` | req |
| 11 | POST | `/appointments/{appointment_id}/check-in` | They arrived — **an open lead converts, else one won back (changed)** | `appointment:update` | req |
| 13 | POST | `/appointments/{appointment_id}/no-show` | They did not come — **the last one → Follow-up (changed)** | `appointment:update` | req |
| 14 | POST | `/appointments/{appointment_id}/cancel` | Cancel — **the last one → Follow-up (changed)** | `appointment:update` | req |
| 15 | POST | `/appointments/{appointment_id}/reinstate` | Undo a cancel — **the lead booked again (changed)** | `appointment:update` | req |
| 17 | POST | `/appointments/{appointment_id}/copy` | Copy or rebook — **the lead follows (changed)** | `appointment:create` | req |

### 2.8 Request details

In 2.A.8 — no request changes.

### 2.9 Errors

In 2.A.9 — no new error.

### 2.10 Rules worth knowing

- The lead moves **in the booking's transaction**: a booking write that fails leaves the lead as it was.
- Two cancels of the same person's two bookings at the same instant can each see the other still live, and the lead stays
  `appointment_scheduled` with nothing booked; a later write of any booking corrects it, and the lead moves freely by
  hand meanwhile (LF2). Accepted — rare, and never wrong for long.

### 2.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| AFC1 | AF1 (built — verify): `appointments.rules.ts` › `followLeadBookings`, its stream lines; the route descriptions of 5, 7, 8, 13, 14, 15 — check against AF1; add route 17's description (copy books) and route 9's (restore books again) |
| AFC2 | AF2: in `convertAtCheckIn`, when `markVisited` returns no lead, call `LeadsRepository.winBack`; write "Won back: moved to Clinic visited at check-in" for a lead it moves; the patient file's `lead_id` from either |
| AFC3 | AF2: the route descriptions of 5 and 11 (`be-route-schema-doc-guard`); `appointments.overview.md` (check-in converts — open first, else a win-back) |
| AFC4 | Tests (`be-test-generator`): a walk-in after a cancel (open lead → visited, follow-up task closed, file linked); a win-back within 90 days (Lost, Not interested — line, file linked); none for Invalid, for 91 days, for a person with an open lead (the open one converts), for a person whose latest lead is not the closed one; a walk-in with a later booking keeps it `scheduled`; copy and restore move the lead |

### 2.12 Nested sub-domains

| Nested sub-domain | Folder (`src/domains/app/sub-domains/appointments/…`) | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 2.A Appointments | folder root | `app.appointments` | 5, 8, 9, 11, 13, 14, 15, 17 (changed) | final |

---

### 2.A Appointments — `appointments/` (folder root) — final

#### 2.A.1 Decisions

AF1–AF5 (2.1).

#### 2.A.2 Open questions

None.

#### 2.A.3 Tables and relations

As 2.3.

#### 2.A.4 Permissions

As 2.4.

#### 2.A.5 Common to every route

As 1.5.

#### 2.A.6 Objects returned

**Appointment** — unchanged (as built): `id` (`appt_…`), `appointment_number`, `contact_id`, `contact`, `patient_id`, `lead_id`,
the booking's fields, `status`, the floor stage, `created_at`, `updated_at`.

#### 2.A.7 Routes (5, 8, 9, 11, 13, 14, 15, 17)

As 2.7.

#### 2.A.8 Request details

As built — no query, body or response change on any of them.

#### 2.A.9 Errors

As built — no new error; a lead move never fails a booking write (it is a guarded update that moves nothing when nothing
matches).

#### 2.A.10 Rules worth knowing

None beyond 2.10.

#### 2.A.11 Code changes

AFC1–AFC4 (2.11).

---

## 3. Tasks — final (rev 1, confirmed 2026-10-30) — no route

Code: the **`tasks` sub-domain folder** — `app/sub-domains/tasks/`, as built. Only the `follow_up` rule changes; no route,
table or field.

### 3.1 Decisions (whole sub-domain)

| # | Decision |
| --- | --- |
| TF1 | **The lead's follow-up task waits while a visit is booked** (built — verify): the `follow_up` rule does not qualify a lead in `appointment_scheduled`; its open task closes on the next run (TK4, as built). A cancel dates the follow-up now, so the task opens on the run right after the commit (every booking write asks for a run, as built). A check-in — a walk-in's, a win-back's — closes the lead, so its task closes the same way. Before the first slice: an open lead's task opened whenever its follow-up date came, booked or not. |

### 3.2 Open questions

None.

### 3.3 Tables and relations

`app.tasks` — no change (the rule reads `app.leads.status`).

### 3.4 Permissions

As built — no code changes.

### 3.5 Common to every route

As 1.5.

### 3.6 Objects returned

Task — unchanged.

### 3.7 Routes

None — the rule runs in the background (worker-changes WC-1).

### 3.8 Request details

None.

### 3.9 Errors

None.

### 3.10 Rules worth knowing

- The patient's own follow-ups after a visit — `feedback`, `aftercare`, `next_visit`, `rebook`, `gone_quiet` — are unchanged
  and start from the visit as for any patient (BRIEF.md:81–82, 155).

### 3.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| TFC1 | TF1 (built — verify): `task-rule-conditions.repository.ts` › `followUpRule` skips `appointment_scheduled`; the integration test "the follow-up task waits while the visit is booked and opens once it is cancelled" — check; add: a walk-in after the cancel closes the reopened task |

### 3.12 Nested sub-domains

None in scope (`task-rule-settings` unchanged).
