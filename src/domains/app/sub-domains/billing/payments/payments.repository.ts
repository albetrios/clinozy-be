import { and, desc, eq, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { BaseRecordRepository, type BaseRecordRow } from '@/domains/app/base-record.repository.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { day_closes } from '@/domains/app/sub-domains/billing/day-closes/day-closes.schema.js';
import { DAY_CLOSE_STATUS } from '@/domains/app/sub-domains/billing/day-closes/day-closes.constants.js';
import { PAYMENT_MODE } from './payments.constants.js';
import { payment_edits, payments } from './payments.schema.js';

/** The organization's calendar day of a payment (its time zone) — the day it belongs to (B6). */
export function paymentDay(organizationId: number): SQL {
  const timezone = sql`(select ${organizations.timezone} from ${organizations} where ${organizations.id} = ${organizationId})`;
  return sql`(${payments.paid_at} at time zone ${timezone})::date`;
}

/** Whether a payment's day is closed — its branch's day close for that day (B6). */
function daySettled(organizationId: number): SQL {
  return sql`exists (select 1 from ${day_closes} where ${day_closes.organization_id} = ${payments.organization_id} and ${day_closes.branch_id} = ${payments.branch_id} and ${day_closes.close_date} = ${paymentDay(organizationId)} and ${day_closes.status} = ${DAY_CLOSE_STATUS.CLOSED})`;
}

/** The split column of each mode (B18). */
export const PAYMENT_MODE_COLUMNS = {
  [PAYMENT_MODE.CASH]: 'cash_amount',
  [PAYMENT_MODE.UPI]: 'upi_amount',
  [PAYMENT_MODE.CARD]: 'card_amount',
  [PAYMENT_MODE.CREDIT]: 'credit_amount',
} as const;

/** A payment edit as the ledger reads it (B20). */
export interface PaymentEditRow {
  id: string;
  payment_id: number;
  changes: unknown;
  author_membership_id: string | null;
  created_at: Date;
}

/**
 * Persistence for `app.payments` and `app.payment_edits` (launch ROUTE #136, routes-final 8.C) —
 * the shared app record reads and writes, plus the ledger's money helpers: the day lock, the
 * invoice's paid amount, the edits, the reversals.
 *
 * @remarks
 * - **Algorithm:** `q` on the payee or the number (`PAY-12`); sorts `paid_at` (newest first),
 *   `created_at`, `amount`; derived filters `mode` (has that split), the paid days (the
 *   organization's, inclusive), `patient_id` (the patient file's contact, B3) and `is_settled` (its
 *   day is closed). The day lock reads the day close `FOR SHARE` (closing takes it `FOR UPDATE`,
 *   B6); the paid amount moves in one guarded statement, never below 0 or above the total.
 */
export class PaymentsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: payments,
      entity: 'payment',
      searchColumns: ['payee_name'],
      numberColumn: 'payment_number',
      sortColumns: { created_at: 'created_at', paid_at: 'created_at' },
      sortKeys: {
        amount: { keys: [{ value: 'amount', sqlType: 'numeric' }], defaultOrder: 'desc' },
      },
      derivedFilters: {
        mode: (value) =>
          sql`(${sql.join(
            (value as (keyof typeof PAYMENT_MODE_COLUMNS)[]).map(
              (mode) => sql`${sql.identifier(PAYMENT_MODE_COLUMNS[mode])} > 0`,
            ),
            sql` or `,
          )})`,
        paid_date_from: (value, organizationId) =>
          sql`${paymentDay(organizationId)} >= ${String(value)}::date`,
        paid_date_to: (value, organizationId) =>
          sql`${paymentDay(organizationId)} <= ${String(value)}::date`,
        patient_id: (value) =>
          sql`${payments.contact_id} = (select ${patients.contact_id} from ${patients} where ${patients.public_id} = ${String(value)})`,
        is_settled: (value, organizationId) =>
          value === true ? daySettled(organizationId) : sql`not ${daySettled(organizationId)}`,
      },
      defaultSort: 'paid_at',
      defaultOrder: 'desc',
    });
  }

  /**
   * B6: the branch's day close for a calendar day, read `FOR SHARE` — a close (which takes it
   * `FOR UPDATE`) waits for the payment write, and a payment for the close. None = an open day.
   */
  async lockDay(options: { branchId: number; date: string }): Promise<{ status: string } | null> {
    const rows = await getRequestDatabase()
      .select({ status: day_closes.status })
      .from(day_closes)
      .where(
        and(eq(day_closes.branch_id, options.branchId), eq(day_closes.close_date, options.date)),
      )
      .for('share');
    return rows[0] ?? null;
  }

  /** Each payment's day status — closed or not — for a page's `is_settled` (B6). */
  async findSettled(paymentIds: readonly number[], organizationId: number): Promise<Set<number>> {
    if (paymentIds.length === 0) return new Set();
    const rows = await getRequestDatabase()
      .select({ id: payments.id })
      .from(payments)
      .where(and(inArray(payments.id, [...paymentIds]), daySettled(organizationId)));
    return new Set(rows.map((row) => row.id));
  }

  /**
   * Moves an invoice's paid amount by `delta` in one guarded statement (B5, B21) — never below 0
   * nor above its total; null when the guard refuses.
   */
  async adjustInvoicePaid(options: {
    invoiceId: number;
    delta: number;
    userId: number | null;
  }): Promise<BaseRecordRow | null> {
    const moved = sql`${invoices.paid_amount} + ${options.delta}`;
    const rows = (await getRequestDatabase()
      .update(invoices)
      .set({
        paid_amount: moved,
        updated_at: sql`greatest(${invoices.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(
        and(
          eq(invoices.id, options.invoiceId),
          sql`${moved} >= 0`,
          sql`${moved} <= ${invoices.total}`,
        ),
      )
      .returning()) as BaseRecordRow[];
    return rows[0] ?? null;
  }

  /** B20: records what a change to a payment changed. */
  async insertEdit(options: {
    organizationId: number;
    paymentId: number;
    changes: Record<string, { from: unknown; to: unknown }>;
    authorMembershipId: number | null;
    userId: number | null;
  }): Promise<void> {
    await getRequestDatabase()
      .insert(payment_edits)
      .values({
        public_id: generatePublicId('paymentEdit'),
        organization_id: options.organizationId,
        payment_id: options.paymentId,
        changes: options.changes,
        author_membership_id: options.authorMembershipId,
        created_by_user_id: options.userId,
      });
  }

  /** A payment's edits, newest first — one page (`after` = the last id read). */
  async listEdits(options: {
    paymentId: number;
    limit: number;
    after?: number | undefined;
  }): Promise<PaymentEditRow[]> {
    return getRequestDatabase()
      .select({
        id: payment_edits.public_id,
        payment_id: payment_edits.payment_id,
        changes: payment_edits.changes,
        author_membership_id: memberships.public_id,
        created_at: payment_edits.created_at,
      })
      .from(payment_edits)
      .leftJoin(memberships, eq(memberships.id, payment_edits.author_membership_id))
      .where(
        and(
          eq(payment_edits.payment_id, options.paymentId),
          options.after === undefined ? undefined : lt(payment_edits.id, options.after),
        ),
      )
      .orderBy(desc(payment_edits.id))
      .limit(options.limit);
  }

  /** The internal id of an edit by its public id (the edits page's cursor). */
  async findEditId(publicId: string): Promise<number | undefined> {
    const rows = await getRequestDatabase()
      .select({ id: payment_edits.id })
      .from(payment_edits)
      .where(eq(payment_edits.public_id, publicId))
      .limit(1);
    return rows[0]?.id;
  }

  /** Each payment's edit count and its latest edit (the ledger's "Edited 1×", B20). */
  async findEditSummaries(
    paymentIds: readonly number[],
  ): Promise<Map<number, { count: number; last: PaymentEditRow }>> {
    if (paymentIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        id: payment_edits.public_id,
        payment_id: payment_edits.payment_id,
        changes: payment_edits.changes,
        author_membership_id: memberships.public_id,
        created_at: payment_edits.created_at,
        count: sql<number>`count(*) over (partition by ${payment_edits.payment_id})::int`,
      })
      .from(payment_edits)
      .leftJoin(memberships, eq(memberships.id, payment_edits.author_membership_id))
      .where(inArray(payment_edits.payment_id, [...paymentIds]))
      .orderBy(desc(payment_edits.id));
    const summaries = new Map<number, { count: number; last: PaymentEditRow }>();
    for (const { count, ...edit } of rows) {
      if (!summaries.has(edit.payment_id)) summaries.set(edit.payment_id, { count, last: edit });
    }
    return summaries;
  }

  /** The live reversal of each payment (B21), by the reversed payment's id. */
  async findReversals(paymentIds: readonly number[]): Promise<Map<number, string>> {
    if (paymentIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ reverses: payments.reverses_payment_id, id: payments.public_id })
      .from(payments)
      .where(
        and(inArray(payments.reverses_payment_id, [...paymentIds]), isNull(payments.deleted_at)),
      );
    return new Map(rows.map((row) => [row.reverses as number, row.id]));
  }

  /** Whether a payment was reversed (live or not — a reversal is once, B21). */
  async hasReversal(paymentId: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.reverses_payment_id, paymentId))
      .limit(1);
    return rows.length > 0;
  }

  /** The live payments that point at a pending credit (its settlements, B24). */
  async findSettlements(pendingCreditIds: readonly number[]): Promise<Map<number, string[]>> {
    if (pendingCreditIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ credit: payments.pending_credit_id, id: payments.public_id })
      .from(payments)
      .where(
        and(
          inArray(payments.pending_credit_id, [...pendingCreditIds]),
          isNull(payments.deleted_at),
        ),
      )
      .orderBy(payments.id);
    const settlements = new Map<number, string[]>();
    for (const row of rows) {
      const creditId = row.credit as number;
      settlements.set(creditId, [...(settlements.get(creditId) ?? []), row.id]);
    }
    return settlements;
  }

  /** The live refund payment of each credit note (B16). */
  async findRefundsOfCreditNotes(creditNoteIds: readonly number[]): Promise<Map<number, string>> {
    if (creditNoteIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ creditNote: payments.invoice_credit_note_id, id: payments.public_id })
      .from(payments)
      .where(inArray(payments.invoice_credit_note_id, [...creditNoteIds]));
    return new Map(rows.map((row) => [row.creditNote as number, row.id]));
  }

  /** Whether an invoice has a live payment on a closed day — then it is settled (B12). */
  async invoiceHasSettledPayment(invoiceId: number, organizationId: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.invoice_id, invoiceId),
          isNull(payments.deleted_at),
          daySettled(organizationId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** The invoices of a page that have a live payment on a closed day (`is_settled`, B12). */
  async findSettledInvoices(
    invoiceIds: readonly number[],
    organizationId: number,
  ): Promise<Set<number>> {
    if (invoiceIds.length === 0) return new Set();
    const rows = await getRequestDatabase()
      .selectDistinct({ invoice_id: payments.invoice_id })
      .from(payments)
      .where(
        and(
          inArray(payments.invoice_id, [...invoiceIds]),
          isNull(payments.deleted_at),
          daySettled(organizationId),
        ),
      );
    return new Set(rows.map((row) => row.invoice_id as number));
  }
}
