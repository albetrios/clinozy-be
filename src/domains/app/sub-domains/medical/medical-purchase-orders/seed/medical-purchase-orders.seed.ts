import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  medical_purchase_order_items,
  medical_purchase_orders,
} from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.schema.js';

/** A row of `app.medical_purchase_orders` to seed: every column but the public id. */
export type SeedMedicalPurchaseOrderValues = Omit<
  typeof medical_purchase_orders.$inferInsert,
  'public_id'
>;

/**
 * Inserts an order to an agency (the database numbers it); returns its id. Its `total` is its
 * lines' amounts, and `paid_amount` / `credited_amount` what its supplier bills and the agency's
 * credits set against it — the caller sends them as they reconcile.
 */
export async function seedMedicalPurchaseOrder(
  values: SeedMedicalPurchaseOrderValues,
): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(medical_purchase_orders)
    .values({ public_id: generatePublicId('medicalPurchaseOrder'), ...values })
    .returning({ id: medical_purchase_orders.id });
  return row!.id;
}

/** A row of `app.medical_purchase_order_items` to seed: every column but the public id. */
export type SeedMedicalPurchaseOrderItemValues = Omit<
  typeof medical_purchase_order_items.$inferInsert,
  'public_id'
>;

/** Inserts one line of an order (`amount` = quantity × rate; a received one names its batch). */
export async function seedMedicalPurchaseOrderItem(
  values: SeedMedicalPurchaseOrderItemValues,
): Promise<void> {
  await getRequestDatabase()
    .insert(medical_purchase_order_items)
    .values({ public_id: generatePublicId('medicalPurchaseOrderItem'), ...values });
}
