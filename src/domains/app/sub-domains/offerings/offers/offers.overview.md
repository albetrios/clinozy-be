`src/domains/app/sub-domains/offerings/offers/`

# Offers

Parent: [offerings](../offerings.overview.md) — a nested sub-domain. It keeps its own name (P22):
an offer is not owned by one offering.

## Purpose

A time-boxed deal on offerings — % off, ₹ off, a fixed price or extra sessions (launch ROUTE #12,
rebuilt at #128 — routes-final 3.C). Table `app.offers`, with the links `app.offer_offerings` (what
it applies to, 1–50) and `app.offer_branches` (where it runs; none = every branch).

## Layout

| File | Role |
| --- | --- |
| `offers.schema.ts` | the three tables, the per-kind value CHECK, the code CHECK and its unique index on live offers, RLS |
| `offers.constants.ts` | kinds, the derived statuses in list order, value and list limits |
| `offers.{dto,validator,serializer,types}.ts` | request shapes, parsing (`status`, `offering_id`, `branch_id` filters), the response with `status` |
| `offers.rules.ts` | `offerStatusOn` (the derived status), the value and date checks (O11), the uppercase code, `decorate` |
| `offers.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers; the status sort and filter in SQL on the organization's today |
| `offers.routes.ts` | the routes below |

## Routes

The offerings sub-domain's one code set (O2); reads are every member's.

| Route | Gate |
| --- | --- |
| `GET /app/offers` | `organization:read` (every member) |
| `POST /app/offers` | `offering:create` |
| `GET /app/offers/{offer_id}` | `organization:read` (every member) |
| `PATCH /app/offers/{offer_id}` | `offering:update` (pause and resume too) |
| `DELETE /app/offers/{offer_id}` | `offering:delete` |
| `POST /app/offers/{offer_id}/restore` | `offering:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC on all three tables; the retention-cleanup arm (USING only) on `app.offers` lets the deleted-record purge (D38) erase rows.
- **Derived status (O10):** paused when `is_active` is false, else scheduled before `starts_on`, ended after `ends_on`, live in between — on the organization's today; never stored. The list's default order is Live → Scheduled → Paused → Ended, newest first inside each.
- **Value by kind (O11):** `percent` a whole 1–100, `amount` / `fixed` rupees above 0, `extra` whole sessions 1–99; `ends_on` on or after `starts_on` — 400s naming the field; the CHECKs hold the same.
- **Code (O11):** A–Z and 0–9, up to 16, stored uppercase; unique among live offers — a 409 with reason `offer_code_in_use` (D81), and a restore over a reused code is `record_restore_conflict`.
- **Active offerings only (O12):** every `offering_ids` entry must be a live, active offering of the organization — a 400 naming it.
- **No branches = every branch (O5):** the list's `branch_id` keeps the offers that run there and those with no branches.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 (`record_changed`) naming who changed it and when.
