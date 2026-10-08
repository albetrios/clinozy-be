import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import {
  medicine_batches,
  medicines,
} from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import { suppliers } from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';
import { SUPPLIER_CREDIT_STATUS } from './supplier-credits.constants.js';
import { supplier_credits } from './supplier-credits.schema.js';

/** MD11: a credit is open until it is fully applied. */
function statusSql(status: string): SQL {
  return status === SUPPLIER_CREDIT_STATUS.OPEN
    ? sql`${supplier_credits.applied_amount} < ${supplier_credits.amount}`
    : sql`${supplier_credits.applied_amount} >= ${supplier_credits.amount}`;
}

/** An open credit as the ledger reads it (MD11). */
export interface OpenSupplierCreditRow {
  id: number;
  amount: string;
  applied_amount: string;
}

/** What a page shows beside a credit — the names it points at (11.C.6). */
export interface SupplierCreditNamesRow {
  id: number;
  supplier_name: string;
  medicine_name: string;
  batch_number: string;
}

/**
 * Persistence for `app.supplier_credits` (launch ROUTE #153, routes-final 11.C) — the shared app
 * record reads and writes, plus the open credits the ledger applies.
 *
 * @remarks
 * - **Algorithm:** sorted newest first (`created_at`); the derived filter `status` (`open` until
 *   fully applied, then `adjusted`). The open credits of a supplier are read locked, oldest first;
 *   applying moves `applied_amount` in one guarded statement (never over the amount).
 */
export class SupplierCreditsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: supplier_credits,
      entity: 'supplierCredit',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      derivedFilters: { status: (value) => statusSql(String(value)) },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }

  /** MD11: a supplier's open credits, oldest first, locked. */
  async lockOpenCredits(supplierId: number): Promise<OpenSupplierCreditRow[]> {
    return getRequestDatabase()
      .select({
        id: supplier_credits.id,
        amount: supplier_credits.amount,
        applied_amount: supplier_credits.applied_amount,
      })
      .from(supplier_credits)
      .where(
        and(eq(supplier_credits.supplier_id, supplierId), statusSql(SUPPLIER_CREDIT_STATUS.OPEN)),
      )
      .orderBy(asc(supplier_credits.created_at), asc(supplier_credits.id))
      .for('update');
  }

  /** MD11: applies `delta` more of a credit (never over its amount); false when refused. */
  async applyCredit(options: {
    id: number;
    delta: number;
    userId: number | null;
  }): Promise<boolean> {
    const applied = sql`${supplier_credits.applied_amount} + ${options.delta}`;
    const rows = await getRequestDatabase()
      .update(supplier_credits)
      .set({
        applied_amount: applied,
        updated_at: sql`greatest(${supplier_credits.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(
        and(eq(supplier_credits.id, options.id), sql`${applied} <= ${supplier_credits.amount}`),
      )
      .returning({ id: supplier_credits.id });
    return rows.length > 0;
  }

  /** The supplier, medicine and batch names of a page's credits (11.C.6). */
  async findNames(creditIds: readonly number[]): Promise<Map<number, SupplierCreditNamesRow>> {
    if (creditIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        id: supplier_credits.id,
        supplier_name: suppliers.name,
        medicine_name: medicines.name,
        batch_number: medicine_batches.batch_number,
      })
      .from(supplier_credits)
      .innerJoin(suppliers, eq(suppliers.id, supplier_credits.supplier_id))
      .innerJoin(medicines, eq(medicines.id, supplier_credits.medicine_id))
      .innerJoin(medicine_batches, eq(medicine_batches.id, supplier_credits.medicine_batch_id))
      .where(inArray(supplier_credits.id, [...creditIds]));
    return new Map(rows.map((row) => [row.id, row]));
  }
}
