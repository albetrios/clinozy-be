`src/domains/app/sub-domains/offerings/`

# Offerings

Parent: [app](../../app.overview.md)

## Purpose

What the clinic sells (launch ROUTE #11, rebuilt at #128 — routes-final §3): one offering per
service, package or product, with its price, offer price and lowest price, sorted into groups,
and the time-boxed offers on them. Bookings, the patient's plan and bills pick from here. The
offering is at the folder root (`app.offerings`, with `app.offering_branches`); what the
sub-domain owns are its nested sub-domains (D54): the groups and the offers.

## Layout

| File / folder | Role |
| --- | --- |
| `offerings.schema.ts` | `app.offerings` (CHECKs incl. `min_price` ≤ `offer_price` ≤ `price`, indexes, RLS) and the `app.offering_branches` link |
| `offerings.constants.ts` | the category and specialty value lists the CHECKs and validators share |
| `offerings.{dto,validator,serializer,types}.ts` | request shapes, parsing (`offering_group_id`, `branch_id` filters), the response |
| `offerings.rules.ts` | the GST default by category and the price order (O4) |
| `offerings.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table; `q` also searches `search_terms` (O9); `min_price` hidden without `offering:lower_price:read` (O15) |
| `offerings.routes.ts` | the routes below |
| [`offering-groups/`](offering-groups/offering-groups.overview.md) | `app.offering_groups` + `/app/offering-groups…` |
| [`offers/`](offers/offers.overview.md) | `app.offers` (+ `offer_offerings`, `offer_branches`) + `/app/offers…` |

## Routes

One code set for the whole sub-domain (O2): `offering:create` · `offering:update` ·
`offering:delete` cover groups, offerings — prices included — and offers; reads are every member's.

| Route | Gate |
| --- | --- |
| `GET /app/offerings` | `organization:read` (every member) |
| `GET /app/offerings/exports` | `offering:export` (O14) |
| `POST /app/offerings` | `offering:create` |
| `GET /app/offerings/{offering_id}` | `organization:read` (every member) |
| `PATCH /app/offerings/{offering_id}` | `offering:update` |
| `DELETE /app/offerings/{offering_id}` | `offering:delete` |
| `POST /app/offerings/{offering_id}/restore` | `offering:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Prices in order (O4):** `min_price` ≤ `offer_price` ≤ `price` — a 400 naming the field, on a create and on the row a `PATCH` would leave; the CHECKs hold the same.
- **No branches = every branch (O5):** the list's `branch_id` keeps the offerings offered there and those with no branches.
- **The lowest price is hidden (O15):** `min_price` is `null` in every response without `offering:lower_price:read`.
- **References are public ids:** a group or branch that is no live record of the organization is a 400 naming the field.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`. Past appointments, treatments and patient offerings keep a deleted offering.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 (`record_changed`) naming who changed it and when.
- **Saved views read its query:** `listOfferingsQueryDto` is the `offerings` entry of the saved-view registry (`memberships/membership-saved-views/membership-saved-views.lists.ts`).
