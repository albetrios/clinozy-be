`src/domains/app/sub-domains/medical/manufacturers/`

# Manufacturer

Parent: [medical](../medical.overview.md)

## Purpose

The brands on the store's packs (launch ROUTE #153 — routes-final 11.A, MD9). Table
`app.manufacturers`; the links to suppliers and MRs are the supplier's and the MR's link tables.

## Layout

| File | Role |
| --- | --- |
| `manufacturers.schema.ts` | the table: upper-case name unique in any case, the six tones, RLS |
| `manufacturers.rules.ts` | the upper-case name, a quick one's next tone, delete only without medicines, the medicine count and links |
| `manufacturers.repository.ts` | the shared reads and writes, the link tables, counts and linked names |
| `manufacturers.{dto,validator,serializer,types}.ts` | request shapes, the response |
| `manufacturers.service.ts` / `.controller.ts` / `.routes.ts` | routes 1–6 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/manufacturers` | `medicine:read` |
| `POST /app/manufacturers` | `medicine:create` |
| `GET /app/manufacturers/{manufacturer_id}` | `medicine:read` |
| `PATCH /app/manufacturers/{manufacturer_id}` | `medicine:update` |
| `DELETE /app/manufacturers/{manufacturer_id}` | `medicine:delete` |
| `POST /app/manufacturers/{manufacturer_id}/restore` | `medicine:delete` |

## Key invariants

- **`supplier_ids` / `medical_rep_ids`** replace the same link rows the supplier's and the MR's
  `manufacturer_ids` write — the links show on both sides.
- **Delete only without live medicines** (`409 manufacturer_has_medicines`).
