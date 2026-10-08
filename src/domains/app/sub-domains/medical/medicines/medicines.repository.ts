import { and, asc, eq, gt, gte, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  BaseRecordRepository,
  type BaseRecordRow,
  nullsLastSortKeys,
  organizationTodaySql,
} from '@/domains/app/base-record.repository.js';
import { manufacturers } from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.schema.js';
import { suppliers } from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';
import { MEDICINE_QUANTITY_MAX, MEDICINE_STOCK_LEVEL } from './medicines.constants.js';
import { medicine_batches, medicine_supplier_prices, medicines } from './medicines.schema.js';

/** The first day of the organization's current month — a batch from an earlier month is expired (MD5). */
function thisMonthSql(organizationId: number): SQL {
  return sql`date_trunc('month', ${organizationTodaySql(organizationId)})::date`;
}

/** MD12: a medicine's nearest expiry — its earliest unexpired batch with stock (null when none). */
function nearestExpirySql(organizationId: number): SQL {
  return sql`(select min(${medicine_batches.expiry_month}) from ${medicine_batches} where ${medicine_batches.medicine_id} = ${medicines.id} and ${medicine_batches.quantity} > 0 and ${medicine_batches.expiry_month} >= ${thisMonthSql(organizationId)})`;
}

/** MD12, MD14: a live batch with stock whose month ends within `days` of today (and has not ended). */
function expiringWithinSql(organizationId: number, days: number): SQL {
  return sql`exists (select 1 from ${medicine_batches} where ${medicine_batches.medicine_id} = ${medicines.id} and ${medicine_batches.quantity} > 0 and ${medicine_batches.expiry_month} >= ${thisMonthSql(organizationId)} and (${medicine_batches.expiry_month} + interval '1 month' - interval '1 day')::date <= ${organizationTodaySql(organizationId)} + ${days}::int)`;
}

/** MD12: each stock level as a condition — out at 0, low at or under the reorder level, else ok. */
function stockLevelSql(level: string): SQL {
  if (level === MEDICINE_STOCK_LEVEL.OUT) return sql`${medicines.quantity} = 0`;
  if (level === MEDICINE_STOCK_LEVEL.LOW) {
    return sql`(${medicines.quantity} > 0 and ${medicines.quantity} <= ${medicines.min_stock})`;
  }
  return sql`${medicines.quantity} > ${medicines.min_stock}`;
}

/** A batch as a write reads it. */
export interface MedicineBatchRow {
  id: number;
  public_id: string;
  medicine_id: number;
  batch_number: string;
  expiry_month: string;
  quantity: number;
  purchase_rate: string | null;
  supplier_id: number | null;
}

/** A batch as a page reads it — public ids (11.D.6). */
export interface MedicineBatchReadRow {
  medicine_id: number;
  id: string;
  batch_number: string;
  expiry_month: string;
  quantity: number;
  purchase_rate: string | null;
  supplier_id: string | null;
  is_expired: boolean;
}

/** A supplier's price as a page reads it (11.D.6). */
export interface MedicineSupplierPriceReadRow {
  medicine_id: number;
  supplier_id: string;
  supplier_name: string;
  rate: string;
  free_quantity: number;
  lead_days: number;
}

/** A batch's columns as a write sets them. */
export type MedicineBatchValues = Partial<{
  batch_number: string;
  expiry_month: string;
  quantity: number;
  purchase_rate: string | null;
  supplier_id: number | null;
  medical_purchase_order_id: number | null;
}>;

/** The columns a batch read selects. */
const BATCH_COLUMNS = {
  id: medicine_batches.id,
  public_id: medicine_batches.public_id,
  medicine_id: medicine_batches.medicine_id,
  batch_number: medicine_batches.batch_number,
  expiry_month: medicine_batches.expiry_month,
  quantity: medicine_batches.quantity,
  purchase_rate: medicine_batches.purchase_rate,
  supplier_id: medicine_batches.supplier_id,
};

/**
 * Persistence for `app.medicines` with its batches (`app.medicine_batches`) and supplier prices
 * (`app.medicine_supplier_prices`) — launch ROUTE #153, routes-final 11.D.
 *
 * @remarks
 * - **Algorithm:** `q` on the name and composition, or the number (`#458`); sorts `name` (A–Z,
 *   the default), `medicine_number`, `quantity`, `mrp`, `nearest_expiry` (none last) and
 *   `created_at`; derived filters `manufacturer_ids`, `stock_level`, `expiring_within_days` and
 *   `supplier_id` (a price from them). Stock moves in one guarded statement per batch and its
 *   medicine, never below 0 (MD4); a sale reads the unexpired batches locked, earliest expiry
 *   first (MD5).
 */
export class MedicinesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: medicines,
      entity: 'medicine',
      searchColumns: ['name', 'composition'],
      numberColumn: 'medicine_number',
      sortColumns: { created_at: 'created_at', name: 'text' },
      sortKeys: {
        medicine_number: { keys: [{ value: 'medicine_number' }], defaultOrder: 'desc' },
        quantity: { keys: [{ value: 'quantity' }], defaultOrder: 'asc' },
        mrp: { keys: [{ value: 'mrp' }], defaultOrder: 'desc' },
        nearest_expiry: {
          keys: nullsLastSortKeys({
            value: (organizationId) => nearestExpirySql(organizationId),
            sqlType: 'date',
            empty: sql`'2000-01-01'::date`,
            defaultOrder: 'asc',
          }),
          defaultOrder: 'asc',
        },
      },
      derivedFilters: {
        manufacturer_ids: (value) =>
          sql`${medicines.manufacturer_id} in (select ${manufacturers.id} from ${manufacturers} where ${inArray(manufacturers.public_id, value as string[])})`,
        stock_level: (value) =>
          sql`(${sql.join(
            (value as string[]).map((level) => stockLevelSql(level)),
            sql` or `,
          )})`,
        expiring_within_days: (value, organizationId) =>
          expiringWithinSql(organizationId, Number(value)),
        supplier_id: (value) =>
          sql`exists (select 1 from ${medicine_supplier_prices} join ${suppliers} on ${suppliers.id} = ${medicine_supplier_prices.supplier_id} where ${medicine_supplier_prices.medicine_id} = ${medicines.id} and ${suppliers.public_id} = ${String(value)})`,
      },
      defaultSort: 'name',
      defaultOrder: 'asc',
    });
  }

  /** A medicine's batches, locked for a write, oldest first. */
  async lockBatches(medicineId: number): Promise<MedicineBatchRow[]> {
    return getRequestDatabase()
      .select(BATCH_COLUMNS)
      .from(medicine_batches)
      .where(eq(medicine_batches.medicine_id, medicineId))
      .orderBy(asc(medicine_batches.id))
      .for('update');
  }

  /** One batch (any medicine of the organization), or null. */
  async findBatch(batchId: number): Promise<MedicineBatchRow | null> {
    const rows = await getRequestDatabase()
      .select(BATCH_COLUMNS)
      .from(medicine_batches)
      .where(eq(medicine_batches.id, batchId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** A medicine's batch by its number, in any case (MD5), or null. */
  async findBatchByNumber(options: {
    medicineId: number;
    batchNumber: string;
  }): Promise<MedicineBatchRow | null> {
    const rows = await getRequestDatabase()
      .select(BATCH_COLUMNS)
      .from(medicine_batches)
      .where(
        and(
          eq(medicine_batches.medicine_id, options.medicineId),
          sql`lower(${medicine_batches.batch_number}) = lower(${options.batchNumber})`,
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * MD5: a medicine's batches a sale may draw from — stock left, its month not before
   * `monthStart` — earliest expiry first, then the oldest; locked for the write.
   */
  async lockSellableBatches(options: {
    medicineId: number;
    monthStart: string;
  }): Promise<MedicineBatchRow[]> {
    return getRequestDatabase()
      .select(BATCH_COLUMNS)
      .from(medicine_batches)
      .where(
        and(
          eq(medicine_batches.medicine_id, options.medicineId),
          gt(medicine_batches.quantity, 0),
          gte(medicine_batches.expiry_month, options.monthStart),
        ),
      )
      .orderBy(asc(medicine_batches.expiry_month), asc(medicine_batches.id))
      .for('update');
  }

  /** Adds a batch at 0 — its stock arrives through {@link moveBatchStock} (MD4). */
  async insertBatch(
    values: MedicineBatchValues & {
      medicine_id: number;
      organization_id: number;
      batch_number: string;
      expiry_month: string;
      created_by_user_id: number | null;
    },
  ): Promise<MedicineBatchRow> {
    const rows = await getRequestDatabase()
      .insert(medicine_batches)
      .values({
        ...values,
        quantity: 0,
        updated_by_user_id: values.created_by_user_id,
        public_id: generatePublicId('medicineBatch'),
      } as never)
      .returning(BATCH_COLUMNS);
    return rows[0]!;
  }

  /** Changes a batch's details (never its quantity — {@link moveBatchStock}). */
  async updateBatch(options: {
    id: number;
    values: Omit<MedicineBatchValues, 'quantity'>;
    userId: number | null;
  }): Promise<void> {
    if (Object.keys(options.values).length === 0) return;
    await getRequestDatabase()
      .update(medicine_batches)
      .set({
        ...options.values,
        updated_at: sql`greatest(${medicine_batches.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(eq(medicine_batches.id, options.id));
  }

  /**
   * MD4: moves a batch by `change` and its medicine with it, in one guarded statement each — the
   * batch stays within 0–9999 and the medicine at or above 0. Returns the batch's medicine id, or
   * null when a guard refuses (nothing moved).
   */
  async moveBatchStock(options: {
    batchId: number;
    change: number;
    userId: number | null;
  }): Promise<number | null> {
    const moved = sql`${medicine_batches.quantity} + ${options.change}`;
    const batches = await getRequestDatabase()
      .update(medicine_batches)
      .set({
        quantity: moved,
        updated_at: sql`greatest(${medicine_batches.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(
        and(
          eq(medicine_batches.id, options.batchId),
          sql`${moved} >= 0`,
          sql`${moved} <= ${MEDICINE_QUANTITY_MAX}`,
        ),
      )
      .returning({ medicine_id: medicine_batches.medicine_id });
    const medicineId = batches[0]?.medicine_id;
    if (medicineId === undefined) return null;
    const total = sql`${medicines.quantity} + ${options.change}`;
    const rows = await getRequestDatabase()
      .update(medicines)
      .set({
        quantity: total,
        updated_at: sql`greatest(${medicines.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(and(eq(medicines.id, medicineId), sql`${total} >= 0`))
      .returning({ id: medicines.id });
    return rows.length > 0 ? medicineId : null;
  }

  /** The batches of a page's medicines with stock, earliest expiry first (11.D.6). */
  async findStockedBatches(options: {
    medicineIds: readonly number[];
    organizationId: number;
  }): Promise<MedicineBatchReadRow[]> {
    if (options.medicineIds.length === 0) return [];
    return getRequestDatabase()
      .select({
        medicine_id: medicine_batches.medicine_id,
        id: medicine_batches.public_id,
        batch_number: medicine_batches.batch_number,
        expiry_month: medicine_batches.expiry_month,
        quantity: medicine_batches.quantity,
        purchase_rate: medicine_batches.purchase_rate,
        supplier_id: suppliers.public_id,
        is_expired: sql<boolean>`${medicine_batches.expiry_month} < ${thisMonthSql(options.organizationId)}`,
      })
      .from(medicine_batches)
      .leftJoin(suppliers, eq(suppliers.id, medicine_batches.supplier_id))
      .where(
        and(
          inArray(medicine_batches.medicine_id, [...options.medicineIds]),
          gt(medicine_batches.quantity, 0),
        ),
      )
      .orderBy(asc(medicine_batches.expiry_month), asc(medicine_batches.id));
  }

  /** The supplier prices of a page's medicines, lowest rate first (11.D.6). */
  async findPrices(medicineIds: readonly number[]): Promise<MedicineSupplierPriceReadRow[]> {
    if (medicineIds.length === 0) return [];
    return getRequestDatabase()
      .select({
        medicine_id: medicine_supplier_prices.medicine_id,
        supplier_id: suppliers.public_id,
        supplier_name: suppliers.name,
        rate: medicine_supplier_prices.rate,
        free_quantity: medicine_supplier_prices.free_quantity,
        lead_days: medicine_supplier_prices.lead_days,
      })
      .from(medicine_supplier_prices)
      .innerJoin(suppliers, eq(suppliers.id, medicine_supplier_prices.supplier_id))
      .where(
        and(
          inArray(medicine_supplier_prices.medicine_id, [...medicineIds]),
          isNull(suppliers.deleted_at),
        ),
      )
      .orderBy(asc(medicine_supplier_prices.rate), asc(suppliers.name));
  }

  /** MD13: replaces a medicine's supplier prices. */
  async replacePrices(options: {
    medicineId: number;
    organizationId: number;
    prices: readonly {
      supplier_id: number;
      rate: string;
      free_quantity: number;
      lead_days: number;
    }[];
  }): Promise<void> {
    const database = getRequestDatabase();
    await database
      .delete(medicine_supplier_prices)
      .where(eq(medicine_supplier_prices.medicine_id, options.medicineId));
    if (options.prices.length === 0) return;
    await database.insert(medicine_supplier_prices).values(
      options.prices.map((price) => ({
        ...price,
        medicine_id: options.medicineId,
        organization_id: options.organizationId,
      })),
    );
  }

  /** MD16: a received line refreshes what its supplier charges for the medicine. */
  async upsertPrice(options: {
    medicineId: number;
    supplierId: number;
    organizationId: number;
    rate: string;
  }): Promise<void> {
    await getRequestDatabase()
      .insert(medicine_supplier_prices)
      .values({
        medicine_id: options.medicineId,
        supplier_id: options.supplierId,
        organization_id: options.organizationId,
        rate: options.rate,
      })
      .onConflictDoUpdate({
        target: [medicine_supplier_prices.medicine_id, medicine_supplier_prices.supplier_id],
        set: {
          rate: options.rate,
          updated_at: sql`greatest(${medicine_supplier_prices.created_at}, now())`,
        },
      });
  }

  /** Each page medicine's manufacturer — `id`, `name`, `tone` (11.D.6). */
  async findManufacturers(
    manufacturerIds: readonly number[],
  ): Promise<Map<number, { id: string; name: string; tone: string }>> {
    if (manufacturerIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        key: manufacturers.id,
        id: manufacturers.public_id,
        name: manufacturers.name,
        tone: manufacturers.tone,
      })
      .from(manufacturers)
      .where(inArray(manufacturers.id, [...manufacturerIds]));
    return new Map(rows.map(({ key, ...manufacturer }) => [key, manufacturer]));
  }

  /**
   * MD14: sets (or clears, `percent` null) the near-expiry discount on every live medicine with a
   * batch whose month ends within `withinDays`; returns how many changed.
   */
  async setNearExpiryDiscount(options: {
    organizationId: number;
    withinDays: number;
    percent: number | null;
    userId: number | null;
  }): Promise<number> {
    const rows = await getRequestDatabase()
      .update(medicines)
      .set({
        near_expiry_discount_percent: options.percent === null ? null : String(options.percent),
        updated_at: sql`greatest(${medicines.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(
        and(
          eq(medicines.organization_id, options.organizationId),
          isNull(medicines.deleted_at),
          expiringWithinSql(options.organizationId, options.withinDays),
          sql`${medicines.near_expiry_discount_percent} is distinct from ${options.percent === null ? null : String(options.percent)}::numeric`,
        ),
      )
      .returning({ id: medicines.id });
    return rows.length;
  }

  /** MD15: the live medicine of that name (any case), or null — an order line's "add as typed". */
  async findLiveIdByName(options: {
    organizationId: number;
    name: string;
  }): Promise<number | null> {
    const rows = await getRequestDatabase()
      .select({ id: medicines.id })
      .from(medicines)
      .where(
        and(
          eq(medicines.organization_id, options.organizationId),
          isNull(medicines.deleted_at),
          sql`lower(${medicines.name}) = lower(${options.name})`,
        ),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /** Live medicines by id, for a sale or an order line (deleted ones absent). */
  async findLive(ids: readonly number[]): Promise<Map<number, BaseRecordRow>> {
    if (ids.length === 0) return new Map();
    const rows = (await getRequestDatabase()
      .select()
      .from(medicines)
      .where(
        and(inArray(medicines.id, [...ids]), isNull(medicines.deleted_at)),
      )) as BaseRecordRow[];
    return new Map(rows.map((row) => [row.id, row]));
  }
}
