import { and, eq, isNull, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  BaseRecordRepository,
  type BaseRecordRow,
  nullsLastSortKeys,
} from '@/domains/app/base-record.repository.js';
import { contactSearchSql } from '@/domains/app/sub-domains/billing/payments/payments.repository.js';
import { INVOICE_TYPE } from '@/domains/app/sub-domains/billing/invoices/invoices.constants.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { medical_sale_returns } from '@/domains/app/sub-domains/medical/medical-sales/medical-sales.schema.js';
import { PENDING_CREDIT_STATUS } from './pending-credits.constants.js';
import { pending_credits } from './pending-credits.schema.js';

/**
 * Persistence for `app.pending_credits` (launch ROUTE #136, routes-final 8.D) — the shared app
 * record reads and writes, plus the settled amount its settlements keep (B24).
 *
 * @remarks
 * - **Algorithm:** `q` on the typed party name, the contact (their names and numbers, D81) or the
 *   number (`CR-2`); sorts `created_at` (newest
 *   first) and `settle_by` (soonest first, none last); the settle-by range is a column range; the
 *   derived filter `is_medical_store` keeps the medical store's credits (D90 — naming a `medical`
 *   invoice, or left by a return kept as store credit, MD33). The settled amount moves in one
 *   guarded statement — never below 0 nor above the amount — and the status follows it: `open`
 *   while some is left, else how the last part was settled.
 */
export class PendingCreditsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: pending_credits,
      entity: 'pendingCredit',
      searchColumns: ['party_name'],
      searchExpressions: [contactSearchSql(pending_credits.contact_id)],
      numberColumn: 'pending_credit_number',
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        // A credit with no settle-by date comes last in either order
        settle_by: {
          keys: nullsLastSortKeys({
            value: () => sql`${pending_credits.settle_by}`,
            sqlType: 'date',
            empty: sql`'infinity'::date`,
            defaultOrder: 'asc',
          }),
          defaultOrder: 'asc',
        },
      },
      derivedFilters: {
        is_medical_store: () =>
          sql`(exists (select 1 from ${invoices} where ${invoices.id} = ${pending_credits.invoice_id} and ${invoices.type} = ${INVOICE_TYPE.MEDICAL}) or exists (select 1 from ${medical_sale_returns} where ${medical_sale_returns.pending_credit_id} = ${pending_credits.id}))`,
      },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }

  /**
   * B24: moves a live credit's settled amount by `delta` — `open` while some is left, else
   * `settledStatus`; null when the credit is gone or the move would leave 0–amount.
   */
  async adjustSettled(options: {
    id: number;
    delta: number;
    settledStatus: string;
    userId: number | null;
  }): Promise<BaseRecordRow | null> {
    const moved = sql`${pending_credits.settled_amount} + ${options.delta}`;
    const rows = (await getRequestDatabase()
      .update(pending_credits)
      .set({
        settled_amount: moved,
        status: sql`case when ${moved} < ${pending_credits.amount} then ${PENDING_CREDIT_STATUS.OPEN} else ${options.settledStatus} end`,
        updated_at: sql`greatest(${pending_credits.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(
        and(
          eq(pending_credits.id, options.id),
          isNull(pending_credits.deleted_at),
          sql`${moved} >= 0`,
          sql`${moved} <= ${pending_credits.amount}`,
        ),
      )
      .returning()) as BaseRecordRow[];
    return rows[0] ?? null;
  }
}
