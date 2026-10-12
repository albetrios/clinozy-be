import { and, count, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { manufacturers } from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.schema.js';
import { MEDICAL_PURCHASE_ORDER_STAGE } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.constants.js';
import { medical_purchase_orders } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.schema.js';
import { supplier_credits } from './supplier-credits/supplier-credits.schema.js';
import { supplier_manufacturers, suppliers } from './suppliers.schema.js';

/** A supplier's `manufacturer_ids` ("Distributes" — `app.supplier_manufacturers`, MD10). */
export const SUPPLIER_MANUFACTURERS_LINK: BaseRecordLinkTable = {
  table: supplier_manufacturers,
  ownerColumn: 'supplier_id',
  targetColumn: 'manufacturer_id',
  targetTable: manufacturers,
};

/**
 * MD10: what the store owes a supplier — their live received orders' dues less their open
 * credits, never below 0.
 */
const PAYABLE = sql`greatest(0, coalesce((select sum(${medical_purchase_orders.due_amount}) from ${medical_purchase_orders} where ${medical_purchase_orders.supplier_id} = ${suppliers.id} and ${medical_purchase_orders.deleted_at} is null and ${medical_purchase_orders.stage} = ${MEDICAL_PURCHASE_ORDER_STAGE.RECEIVED}), 0) - coalesce((select sum(${supplier_credits.amount} - ${supplier_credits.applied_amount}) from ${supplier_credits} where ${supplier_credits.supplier_id} = ${suppliers.id}), 0))`;

/** A supplier's account as a page reads it (MD10). */
export interface SupplierAccountRow {
  payable: number;
  /** When the oldest received order still due arrived — null when nothing is due. */
  oldest_due_received_at: Date | null;
  order_count: number;
}

/**
 * Persistence for `app.suppliers` (launch ROUTE #153, routes-final 11.B) — the shared app record
 * reads and writes, plus each supplier's account.
 *
 * @remarks
 * - **Algorithm:** `q` on the name and phone; sorts `name` (A–Z, the default), `payable` (most
 *   owed first) and `created_at`; the derived filter `has_payable`. The payable is the live
 *   received orders' dues less the open credits (MD10), one correlated sum each.
 */
export class SuppliersRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: suppliers,
      entity: 'supplier',
      searchColumns: ['name', 'phone'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      sortKeys: {
        payable: { keys: [{ value: () => PAYABLE, sqlType: 'numeric' }], defaultOrder: 'desc' },
      },
      derivedFilters: {
        has_payable: (value): SQL => (value === true ? sql`${PAYABLE} > 0` : sql`${PAYABLE} = 0`),
      },
      defaultSort: 'name',
      defaultOrder: 'asc',
    });
  }

  /** MD10: each supplier's payable, oldest due order and live order count. */
  async findAccounts(supplierIds: readonly number[]): Promise<Map<number, SupplierAccountRow>> {
    if (supplierIds.length === 0) return new Map();
    const database = getRequestDatabase();
    const payables = await database
      .select({ id: suppliers.id, payable: sql<string>`${PAYABLE}` })
      .from(suppliers)
      .where(inArray(suppliers.id, [...supplierIds]));
    const orders = await database
      .select({
        supplier_id: medical_purchase_orders.supplier_id,
        order_count: count(),
        oldest_due_received_at: sql<Date | null>`min(${medical_purchase_orders.received_at}) filter (where ${medical_purchase_orders.due_amount} > 0)`,
      })
      .from(medical_purchase_orders)
      .where(
        and(
          inArray(medical_purchase_orders.supplier_id, [...supplierIds]),
          isNull(medical_purchase_orders.deleted_at),
        ),
      )
      .groupBy(medical_purchase_orders.supplier_id);
    const ordersBySupplier = new Map(orders.map((row) => [row.supplier_id, row]));
    return new Map(
      payables.map((row) => {
        const order = ordersBySupplier.get(row.id);
        const oldest = order?.oldest_due_received_at ?? null;
        return [
          row.id,
          {
            payable: Number(row.payable),
            oldest_due_received_at: oldest === null ? null : new Date(oldest),
            order_count: Number(order?.order_count ?? 0),
          },
        ];
      }),
    );
  }

  /** MD15: the first live manufacturer a supplier distributes (the oldest link), or null. */
  async findFirstManufacturerId(supplierId: number): Promise<number | null> {
    const rows = await getRequestDatabase()
      .select({ id: manufacturers.id })
      .from(supplier_manufacturers)
      .innerJoin(manufacturers, eq(manufacturers.id, supplier_manufacturers.manufacturer_id))
      .where(
        and(eq(supplier_manufacturers.supplier_id, supplierId), isNull(manufacturers.deleted_at)),
      )
      .orderBy(supplier_manufacturers.created_at, manufacturers.id)
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /** Suppliers' names by public id (deleted ones too — an order keeps naming its supplier). */
  async findNamesByPublicId(publicIds: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(publicIds)];
    if (unique.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ public_id: suppliers.public_id, name: suppliers.name })
      .from(suppliers)
      .where(inArray(suppliers.public_id, unique));
    return new Map(rows.map((row) => [row.public_id, row.name]));
  }

  /** MD10: whether a supplier holds an open credit. */
  async hasOpenCredit(supplierId: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: supplier_credits.id })
      .from(supplier_credits)
      .where(
        and(
          eq(supplier_credits.supplier_id, supplierId),
          sql`${supplier_credits.applied_amount} < ${supplier_credits.amount}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** Each supplier's live manufacturers — `id`, `name`, `tone`, A–Z (11.B.6). */
  async findManufacturers(
    supplierIds: readonly number[],
  ): Promise<Map<number, { id: string; name: string; tone: string }[]>> {
    if (supplierIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        owner: supplier_manufacturers.supplier_id,
        id: manufacturers.public_id,
        name: manufacturers.name,
        tone: manufacturers.tone,
      })
      .from(supplier_manufacturers)
      .innerJoin(manufacturers, eq(manufacturers.id, supplier_manufacturers.manufacturer_id))
      .where(
        and(
          inArray(supplier_manufacturers.supplier_id, [...supplierIds]),
          isNull(manufacturers.deleted_at),
        ),
      )
      .orderBy(manufacturers.name, manufacturers.id);
    const bySupplier = new Map<number, { id: string; name: string; tone: string }[]>();
    for (const { owner, ...manufacturer } of rows) {
      const list = bySupplier.get(owner) ?? [];
      list.push(manufacturer);
      bySupplier.set(owner, list);
    }
    return bySupplier;
  }
}
