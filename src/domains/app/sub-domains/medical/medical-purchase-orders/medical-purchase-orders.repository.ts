import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { medicines } from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import { suppliers } from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';
import { MEDICAL_PURCHASE_ORDER_STAGE } from './medical-purchase-orders.constants.js';
import {
  medical_purchase_order_items,
  medical_purchase_orders,
} from './medical-purchase-orders.schema.js';

/** An order line as a page reads it — public ids (11.E.6). */
export interface MedicalPurchaseOrderItemReadRow {
  medical_purchase_order_id: number;
  id: string;
  line_number: number;
  medicine_id: string;
  medicine_name: string;
  quantity: number;
  free_quantity: number;
  rate: string;
  amount: string;
  is_received: boolean | null;
  batch_number: string | null;
  expiry_month: string | null;
}

/** An order line as a write reads it. */
export interface MedicalPurchaseOrderItemRow {
  id: number;
  public_id: string;
  line_number: number;
  medicine_id: number;
  quantity: number;
  free_quantity: number;
  rate: string;
  amount: string;
}

/** An order line as a write adds it. */
export interface MedicalPurchaseOrderItemValues {
  line_number: number;
  medicine_id: number;
  quantity: number;
  free_quantity: number;
  rate: string;
  amount: string;
}

/** A received order still owed, as the supplier's dues read it (MD10, MD11). */
export interface MedicalPurchaseOrderDueRow {
  id: number;
  purchase_order_number: number;
  due_amount: string;
}

/**
 * Persistence for `app.medical_purchase_orders` and their lines
 * (`app.medical_purchase_order_items`) — launch ROUTE #153, routes-final 11.E.
 *
 * @remarks
 * - **Algorithm:** `q` on the bill number and the supplier's name, or the number (`#431`); sorts
 *   `order_date` (newest first, the default), `purchase_order_number`, `total` and `created_at`.
 *   A supplier's dues are its live received orders with something due, oldest received first,
 *   read locked; a credit or a payment moves an order in one guarded statement (paid + credited
 *   never over the total).
 */
export class MedicalPurchaseOrdersRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: medical_purchase_orders,
      entity: 'medicalPurchaseOrder',
      searchColumns: ['supplier_bill_number'],
      searchExpressions: [
        sql`(select ${suppliers.name} from ${suppliers} where ${suppliers.id} = ${medical_purchase_orders.supplier_id})`,
      ],
      numberColumn: 'purchase_order_number',
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        order_date: { keys: [{ value: 'order_date' }], defaultOrder: 'desc' },
        purchase_order_number: {
          keys: [{ value: 'purchase_order_number' }],
          defaultOrder: 'desc',
        },
        total: { keys: [{ value: 'total' }], defaultOrder: 'desc' },
      },
      defaultSort: 'order_date',
      defaultOrder: 'desc',
    });
  }

  /** The lines of a page's orders, in line order (11.E.6). */
  async findItems(orderIds: readonly number[]): Promise<MedicalPurchaseOrderItemReadRow[]> {
    if (orderIds.length === 0) return [];
    return getRequestDatabase()
      .select({
        medical_purchase_order_id: medical_purchase_order_items.medical_purchase_order_id,
        id: medical_purchase_order_items.public_id,
        line_number: medical_purchase_order_items.line_number,
        medicine_id: medicines.public_id,
        medicine_name: medicines.name,
        quantity: medical_purchase_order_items.quantity,
        free_quantity: medical_purchase_order_items.free_quantity,
        rate: medical_purchase_order_items.rate,
        amount: medical_purchase_order_items.amount,
        is_received: medical_purchase_order_items.is_received,
        batch_number: medical_purchase_order_items.batch_number,
        expiry_month: medical_purchase_order_items.expiry_month,
      })
      .from(medical_purchase_order_items)
      .innerJoin(medicines, eq(medicines.id, medical_purchase_order_items.medicine_id))
      .where(inArray(medical_purchase_order_items.medical_purchase_order_id, [...orderIds]))
      .orderBy(
        asc(medical_purchase_order_items.medical_purchase_order_id),
        asc(medical_purchase_order_items.line_number),
      );
  }

  /** An order's lines for a write, locked, in line order. */
  async lockItems(orderId: number): Promise<MedicalPurchaseOrderItemRow[]> {
    return getRequestDatabase()
      .select({
        id: medical_purchase_order_items.id,
        public_id: medical_purchase_order_items.public_id,
        line_number: medical_purchase_order_items.line_number,
        medicine_id: medical_purchase_order_items.medicine_id,
        quantity: medical_purchase_order_items.quantity,
        free_quantity: medical_purchase_order_items.free_quantity,
        rate: medical_purchase_order_items.rate,
        amount: medical_purchase_order_items.amount,
      })
      .from(medical_purchase_order_items)
      .where(eq(medical_purchase_order_items.medical_purchase_order_id, orderId))
      .orderBy(asc(medical_purchase_order_items.line_number))
      .for('update');
  }

  /** MD15: replaces an order's lines (an order not yet received). */
  async replaceItems(options: {
    orderId: number;
    organizationId: number;
    lines: readonly MedicalPurchaseOrderItemValues[];
  }): Promise<void> {
    await getRequestDatabase()
      .delete(medical_purchase_order_items)
      .where(eq(medical_purchase_order_items.medical_purchase_order_id, options.orderId));
    await this.insertItems(options);
  }

  /**
   * Adds lines to an order — a save's whole list, or receive's goods not ordered (MD26) — and
   * answers them as a receive reads its lines.
   */
  async insertItems(options: {
    orderId: number;
    organizationId: number;
    lines: readonly MedicalPurchaseOrderItemValues[];
  }): Promise<MedicalPurchaseOrderItemRow[]> {
    if (options.lines.length === 0) return [];
    return getRequestDatabase()
      .insert(medical_purchase_order_items)
      .values(
        options.lines.map((line) => ({
          ...line,
          medical_purchase_order_id: options.orderId,
          organization_id: options.organizationId,
          public_id: generatePublicId('medicalPurchaseOrderItem'),
        })),
      )
      .returning({
        id: medical_purchase_order_items.id,
        public_id: medical_purchase_order_items.public_id,
        line_number: medical_purchase_order_items.line_number,
        medicine_id: medical_purchase_order_items.medicine_id,
        quantity: medical_purchase_order_items.quantity,
        free_quantity: medical_purchase_order_items.free_quantity,
        rate: medical_purchase_order_items.rate,
        amount: medical_purchase_order_items.amount,
      });
  }

  /** MD16: what receiving did to one line — ticked or not, and the batch it went into. */
  async markItemReceived(options: {
    id: number;
    isReceived: boolean;
    batchNumber: string | null;
    expiryMonth: string | null;
    medicineBatchId: number | null;
  }): Promise<void> {
    await getRequestDatabase()
      .update(medical_purchase_order_items)
      .set({
        is_received: options.isReceived,
        batch_number: options.batchNumber,
        expiry_month: options.expiryMonth,
        medicine_batch_id: options.medicineBatchId,
        updated_at: sql`greatest(${medical_purchase_order_items.created_at}, now())`,
      })
      .where(eq(medical_purchase_order_items.id, options.id));
  }

  /**
   * MD10, MD11: a supplier's live received orders with something due — oldest received first,
   * locked for the write that pays or credits them.
   */
  async lockDueOrders(supplierId: number): Promise<MedicalPurchaseOrderDueRow[]> {
    return getRequestDatabase()
      .select({
        id: medical_purchase_orders.id,
        purchase_order_number: medical_purchase_orders.purchase_order_number,
        due_amount: sql<string>`${medical_purchase_orders.due_amount}`,
      })
      .from(medical_purchase_orders)
      .where(
        and(
          eq(medical_purchase_orders.supplier_id, supplierId),
          isNull(medical_purchase_orders.deleted_at),
          eq(medical_purchase_orders.stage, MEDICAL_PURCHASE_ORDER_STAGE.RECEIVED),
          gt(medical_purchase_orders.due_amount, '0'),
        ),
      )
      .orderBy(asc(medical_purchase_orders.received_at), asc(medical_purchase_orders.id))
      .for('update');
  }

  /**
   * MD11: sets `delta` of a supplier credit against a received order — paid and credited never
   * over its total; false when the guard refuses.
   */
  async creditOrder(options: {
    orderId: number;
    delta: number;
    userId: number | null;
  }): Promise<boolean> {
    const credited = sql`${medical_purchase_orders.credited_amount} + ${options.delta}`;
    const rows = await getRequestDatabase()
      .update(medical_purchase_orders)
      .set({
        credited_amount: credited,
        updated_at: sql`greatest(${medical_purchase_orders.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(
        and(
          eq(medical_purchase_orders.id, options.orderId),
          sql`${credited} >= 0`,
          sql`${credited} + ${medical_purchase_orders.paid_amount} <= ${medical_purchase_orders.total}`,
        ),
      )
      .returning({ id: medical_purchase_orders.id });
    return rows.length > 0;
  }

  /** MD15: whether a supplier has a live order still waiting to be received. */
  async hasOrderWaiting(supplierId: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: medical_purchase_orders.id })
      .from(medical_purchase_orders)
      .where(
        and(
          eq(medical_purchase_orders.supplier_id, supplierId),
          isNull(medical_purchase_orders.deleted_at),
          eq(medical_purchase_orders.stage, MEDICAL_PURCHASE_ORDER_STAGE.ORDERED),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
