`src/domains/app/sub-domains/medical-purchase-orders/`

# MedicalPurchaseOrder

Parent: [app](../../app.overview.md)

## Purpose

An order of medicines from a supplier — received into stock, then paid (launch ROUTE #49). Table `app.medical_purchase_orders`.

## Layout

| File | Role |
| --- | --- |
| `medical-purchase-orders.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `medical-purchase-orders.constants.ts` | value lists the CHECKs and validators share |
| `medical-purchase-orders.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `medical-purchase-orders.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `medical-purchase-orders.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medical-purchase-orders` | `medical_purchase_order:read` |
| `GET /app/medical-purchase-orders/exports` | `list:export` |
| `POST /app/medical-purchase-orders` | `medical_purchase_order:create` |
| `GET /app/medical-purchase-orders/{medical_purchase_order_id}` | `medical_purchase_order:read` |
| `PATCH /app/medical-purchase-orders/{medical_purchase_order_id}` | `medical_purchase_order:update` |
| `POST /app/medical-purchase-orders/{medical_purchase_order_id}/receive` | `medical_purchase_order:update` |
| `POST /app/medical-purchase-orders/{medical_purchase_order_id}/cancel` | `medical_purchase_order:update` |
| `DELETE /app/medical-purchase-orders/{medical_purchase_order_id}` | `medical_purchase_order:delete` |
| `POST /app/medical-purchase-orders/{medical_purchase_order_id}/restore` | `medical_purchase_order:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
