`src/domains/app/sub-domains/offerings/offering-groups/`

# Offering groups

Parent: [offerings](../offerings.overview.md) — a nested sub-domain: the menu's sections the
offerings are sorted into (O1).

## Purpose

A group for browsing offerings — Facial, Hair, Peel, Laser (D29; launch ROUTE #10, rebuilt at
ROUTE #128 — routes-final 3.A). Table `app.offering_groups`; an offering points at its group
with `offering_group_id`.

## Layout

| File | Role |
| --- | --- |
| `offering-groups.schema.ts` | the table, its CHECKs, indexes (incl. the menu order `sort_order`, `name`) and RLS policy |
| `offering-groups.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `offering-groups.rules.ts` | the delete guard: a group live offerings use cannot be deleted (O7) |
| `offering-groups.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table; default list order `sort_order`, then name (O8) |
| `offering-groups.routes.ts` | the routes below |

## Routes

The offerings sub-domain's one code set (O2); reads are every member's.

| Route | Gate |
| --- | --- |
| `GET /app/offering-groups` | `organization:read` (every member) |
| `POST /app/offering-groups` | `offering:create` |
| `GET /app/offering-groups/{offering_group_id}` | `organization:read` (every member) |
| `PATCH /app/offering-groups/{offering_group_id}` | `offering:update` |
| `DELETE /app/offering-groups/{offering_group_id}` | `offering:delete` |
| `POST /app/offering-groups/{offering_group_id}/restore` | `offering:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Name unique in any case:** among live groups of the organization — a 409 on create, rename and restore.
- **Only an empty group is deleted (O7):** live offerings in it → 409 (`offeringGroupHasOfferings`).
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 (`record_changed`) naming who changed it and when.
