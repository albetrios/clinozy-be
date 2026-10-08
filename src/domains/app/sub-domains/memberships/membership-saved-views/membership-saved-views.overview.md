`src/domains/app/sub-domains/memberships/membership-saved-views/`

# Membership saved views

Parent: [memberships](../memberships.overview.md)

## Purpose

A member's own saved views (launch §2.G, U1/U5/U6): a list's filters under a label — the chips of a
list's "Save as view" — with the columns it hides. Table `app.membership_saved_views` (renamed from
`saved_views` at ROUTE #127).

## Layout

| File | Role |
| --- | --- |
| `membership-saved-views.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `membership-saved-views.lists.ts` | the lists that take views and the filters each takes |
| `membership-saved-views.constants.ts` | the caps |
| `membership-saved-views.{dto,validator,serializer,types}.ts` | request shapes, the filters check, the response |
| `membership-saved-views.repository.ts` / `.service.ts` / `.controller.ts` | the caller's own rows |
| `membership-saved-views.routes.ts` | the routes below |

## Routes

| Route | Gate | Note |
| --- | --- | --- |
| `GET /app/memberships/me/saved-views` | `organization:read` (every member) | `list_key`, `q` (label), sort `created_at` (default, oldest first) or `label`; paged |
| `POST /app/memberships/me/saved-views` | `organization:read` | `X-Idempotency-Key`; `list_key`, `label`, `filters`, optional `hidden_columns` |
| `GET /app/memberships/me/saved-views/{membership_saved_view_id}` | `organization:read` | |
| `PATCH /app/memberships/me/saved-views/{membership_saved_view_id}` | `organization:read` | `label`, `filters`, `hidden_columns`; `list_key` never changes; `expected_updated_at` |
| `DELETE /app/memberships/me/saved-views/{membership_saved_view_id}` | `organization:read` | for good — no restore (U6) |

## Key invariants

- **Own rows only (U1/U2):** every read and write names the caller's own live membership; another
  member's view is a `404`, an API key a `403`.
- **Filters only (U5):** `filters` must pass the list's own query schema without paging and sort
  (`MEMBERSHIP_SAVED_VIEW_LIST_FILTERS`) — `400 filters` otherwise; the sort stays in the URL. A list
  rebuilt later keeps its `list…QueryDto`, so its views follow it; the medical and stock lists join
  when they are built.
- **A label once per member and list**, case-insensitive (`409 view_exists`); **at most 20 views per
  list** (`409 view_limit`), counted under a per-(membership, list) advisory lock.
- **No soft delete (U6):** a delete is final; the leave step deletes a member's views (K4).
- **Member pointer is composite** `(organization_id, membership_id)` (K8); RLS (organization
  policy, ENABLE + FORCE).
