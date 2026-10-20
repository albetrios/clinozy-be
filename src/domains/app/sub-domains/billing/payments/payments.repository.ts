import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  buildDescendingCreatedAtIdCursorCondition,
  cursorTimestampSelection,
  type ParsedListCursor,
} from '@/shared/utils/http/pagination.util.js';
import {
  BaseRecordRepository,
  type BaseRecordRow,
  columnOf,
} from '@/domains/app/base-record.repository.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { invoice_credit_notes } from '@/domains/app/sub-domains/billing/invoice-credit-notes/invoice-credit-notes.schema.js';
import { pending_credits } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.schema.js';
import { day_closes } from '@/domains/app/sub-domains/billing/day-closes/day-closes.schema.js';
import { DAY_CLOSE_STATUS } from '@/domains/app/sub-domains/billing/day-closes/day-closes.constants.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.schema.js';
import { MEDICAL_PURCHASE_ORDER_STAGE } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.constants.js';
import { medical_purchase_orders } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.schema.js';
import { medical_sale_returns } from '@/domains/app/sub-domains/medical/medical-sales/medical-sales.schema.js';
import { INVOICE_TYPE } from '@/domains/app/sub-domains/billing/invoices/invoices.constants.js';
import {
  PAYMENT_EXPENSE_CATEGORY,
  PAYMENT_MODE,
  type SupplierBillPurchaseField,
} from './payments.constants.js';
import { payment_edits, payments } from './payments.schema.js';

/**
 * The membership (public id) a user holds in the organization, as SQL — the live one, else the one
 * they left last: who recorded a row (a day's per-member totals, a ledger row's "By").
 */
export function membershipOfUserSql(options: {
  organizationId: number;
  userColumn: AnyPgColumn;
}): SQL<string | null> {
  return sql<
    string | null
  >`(select ${memberships.public_id} from ${memberships} where ${memberships.organization_id} = ${options.organizationId} and ${memberships.user_id} = ${options.userColumn} order by ${memberships.deleted_at} desc nulls first limit 1)`;
}

/**
 * Who recorded each row of a billing table (`created_by_user_id`) as their membership's public id,
 * by row id — `created_by_membership_id` on a page (the "By" column, D81); null for an API key.
 *
 * @remarks
 * - **Algorithm:** one read of the page's rows joined to the organization's memberships of their
 *   creators — the live membership first, else the one left last (as {@link membershipOfUserSql}).
 * - **Failure modes:** none; a row RLS hides is absent from the map.
 */
export async function findRecordedByMemberships(options: {
  table: PgTable;
  ids: readonly number[];
  organizationId: number;
}): Promise<Map<number, string | null>> {
  if (options.ids.length === 0) return new Map();
  const idColumn = columnOf(options.table, 'id');
  const rows = (await getRequestDatabase()
    .select({ id: idColumn, membership_id: memberships.public_id })
    .from(options.table)
    .leftJoin(
      memberships,
      and(
        eq(memberships.organization_id, options.organizationId),
        eq(memberships.user_id, columnOf(options.table, 'created_by_user_id')),
      ),
    )
    .where(inArray(idColumn, [...options.ids]))
    .orderBy(sql`${memberships.deleted_at} desc nulls first`)) as {
    id: number;
    membership_id: string | null;
  }[];
  const recordedBy = new Map<number, string | null>();
  for (const row of rows) if (!recordedBy.has(row.id)) recordedBy.set(row.id, row.membership_id);
  return recordedBy;
}

/** `q` on the billed contact — their names, email, Instagram, number and phones (the contact's `search_text`). */
export function contactSearchSql(contactColumn: AnyPgColumn): SQL {
  return sql`(select ${contacts.search_text} from ${contacts} where ${contacts.id} = ${contactColumn})`;
}

/** The invoice a ledger row points at, as the ledger's sub-line shows it (D81, G-P3). */
export interface PaymentInvoiceLink {
  invoice_sequence: number;
  invoice_number: string;
  type: string;
  due_amount: number;
}

/** The stock purchase a supplier bill pays, as the ledger shows it. */
export interface PaymentStockPurchaseLink {
  stock_purchase_number: number;
  bill_number: string | null;
}

/** The medical purchase order a supplier bill pays, as the ledger shows it. */
export interface PaymentMedicalPurchaseOrderLink {
  purchase_order_number: number;
  supplier_bill_number: string | null;
}

/** The numbers of what a page's ledger rows point at, by the linked record's public id. */
export interface PaymentLinkNumbers {
  invoices: Map<string, PaymentInvoiceLink>;
  creditNotes: Map<string, number>;
  pendingCredits: Map<string, number>;
  stockPurchases: Map<string, PaymentStockPurchaseLink>;
  medicalPurchaseOrders: Map<string, PaymentMedicalPurchaseOrderLink>;
}

/** The public ids of what a page's ledger rows point at, one list per kind of link. */
export interface PaymentLinkIds {
  invoiceIds: readonly string[];
  creditNoteIds: readonly string[];
  pendingCreditIds: readonly string[];
  stockPurchaseIds: readonly string[];
  medicalPurchaseOrderIds: readonly string[];
}

/** Rows of `table` among `publicIds` (deleted ones too — a ledger row keeps naming what it paid). */
async function selectByPublicIds<Row>(options: {
  table: PgTable;
  organizationId: number;
  publicIds: readonly string[];
  columns: Record<string, AnyPgColumn>;
}): Promise<(Row & { public_id: string })[]> {
  const unique = [...new Set(options.publicIds)];
  if (unique.length === 0) return [];
  const publicId = columnOf(options.table, 'public_id');
  return (await getRequestDatabase()
    .select({ public_id: publicId, ...options.columns })
    .from(options.table)
    .where(
      and(
        eq(columnOf(options.table, 'organization_id'), options.organizationId),
        inArray(publicId, unique),
      ),
    )) as (Row & { public_id: string })[];
}

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

/** A payment edit on the edits page: its internal id and microsecond time for the keyset cursor. */
export type PaymentEditPageRow = Omit<PaymentEditRow, 'id'> & {
  id: number;
  public_id: string;
  cursor_created_at: string;
};

/**
 * MD22, MD31: a payment of the medical store — money on a `medical` invoice (receipts, refunds and
 * their reversals), a supplier bill of a medical order, or a `medicines` expense — and the reversal
 * of a `medicines` expense, which carries the expense's links but not its category; and, MD33, the
 * money settling the store credit a return left (given back, or a reversal of that — a reversal
 * keeps the credit's link).
 */
function medicalStorePayment(): SQL {
  return sql`(${payments.medical_purchase_order_id} is not null or ${payments.expense_category} = ${PAYMENT_EXPENSE_CATEGORY.MEDICINES} or exists (select 1 from ${invoices} where ${invoices.id} = ${payments.invoice_id} and ${invoices.type} = ${INVOICE_TYPE.MEDICAL}) or exists (select 1 from ${payments} as reversed where reversed.id = ${payments.reverses_payment_id} and reversed.expense_category = ${PAYMENT_EXPENSE_CATEGORY.MEDICINES}) or exists (select 1 from ${medical_sale_returns} where ${medical_sale_returns.pending_credit_id} = ${payments.pending_credit_id}))`;
}

/**
 * Persistence for `app.payments` and `app.payment_edits` (launch ROUTE #136, routes-final 8.C) —
 * the shared app record reads and writes, plus the ledger's money helpers: the day lock, the
 * invoice's paid amount, the edits, the reversals.
 *
 * @remarks
 * - **Algorithm:** `q` on the payee, the billed contact (their names and numbers, D81) or the
 *   number (`PAY-12`); sorts `paid_at` (newest first),
 *   `created_at`, `amount`; derived filters `mode` (has that split), the paid days (the
 *   organization's, inclusive), `patient_id` (the patient file's contact, B3) and `is_settled` (its
 *   day is closed), `is_medical_store` (MD22). The day lock reads the day close `FOR SHARE` (closing takes it `FOR UPDATE`,
 *   B6); the paid amount moves in one guarded statement, never below 0 or above the total.
 */
export class PaymentsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: payments,
      entity: 'payment',
      searchColumns: ['payee_name'],
      searchExpressions: [contactSearchSql(payments.contact_id)],
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
        is_medical_store: () => medicalStorePayment(),
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
   * Moves an invoice's paid and refunded amounts in one guarded statement (B5, B16, B21) — neither
   * below 0, and together never above its total (a refund moves money from one to the other);
   * null when the guard refuses.
   */
  async adjustInvoicePaid(options: {
    invoiceId: number;
    paidDelta: number;
    refundedDelta: number;
    userId: number | null;
  }): Promise<BaseRecordRow | null> {
    const paid = sql`${invoices.paid_amount} + ${options.paidDelta}`;
    const refunded = sql`${invoices.refunded_amount} + ${options.refundedDelta}`;
    const rows = (await getRequestDatabase()
      .update(invoices)
      .set({
        paid_amount: paid,
        refunded_amount: refunded,
        updated_at: sql`greatest(${invoices.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(
        and(
          eq(invoices.id, options.invoiceId),
          sql`${paid} >= 0`,
          sql`${refunded} >= 0`,
          sql`${paid} + ${refunded} <= ${invoices.total}`,
        ),
      )
      .returning()) as BaseRecordRow[];
    return rows[0] ?? null;
  }

  /**
   * S11, MD7: moves a live purchase's paid amount by `delta` in one guarded statement — never
   * below 0 nor above what is owed (a stock purchase's bill; a received medical order's total less
   * its supplier credits); null when the guard refuses (or the purchase is gone).
   */
  async adjustPurchasePaid(options: {
    field: SupplierBillPurchaseField;
    purchaseId: number;
    delta: number;
    userId: number | null;
  }): Promise<BaseRecordRow | null> {
    if (options.field === 'medical_purchase_order_id') {
      const moved = sql`${medical_purchase_orders.paid_amount} + ${options.delta}`;
      const rows = (await getRequestDatabase()
        .update(medical_purchase_orders)
        .set({
          paid_amount: moved,
          updated_at: sql`greatest(${medical_purchase_orders.created_at}, now())`,
          updated_by_user_id: options.userId,
        } as never)
        .where(
          and(
            eq(medical_purchase_orders.id, options.purchaseId),
            isNull(medical_purchase_orders.deleted_at),
            eq(medical_purchase_orders.stage, MEDICAL_PURCHASE_ORDER_STAGE.RECEIVED),
            sql`${moved} >= 0`,
            sql`${moved} + ${medical_purchase_orders.credited_amount} <= ${medical_purchase_orders.total}`,
          ),
        )
        .returning()) as BaseRecordRow[];
      return rows[0] ?? null;
    }
    const moved = sql`${stock_purchases.paid_amount} + ${options.delta}`;
    const rows = (await getRequestDatabase()
      .update(stock_purchases)
      .set({
        paid_amount: moved,
        updated_at: sql`greatest(${stock_purchases.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(
        and(
          eq(stock_purchases.id, options.purchaseId),
          isNull(stock_purchases.deleted_at),
          sql`${moved} >= 0`,
          sql`${moved} <= ${stock_purchases.bill_amount}`,
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

  /** A payment's edits, newest first — one `limit + 1` keyset page after `cursor` (finishKeysetPage). */
  async listEdits(options: {
    paymentId: number;
    limit: number;
    cursor: ParsedListCursor | null;
  }): Promise<PaymentEditPageRow[]> {
    return getRequestDatabase()
      .select({
        id: payment_edits.id,
        public_id: payment_edits.public_id,
        cursor_created_at: cursorTimestampSelection(payment_edits.created_at),
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
          buildDescendingCreatedAtIdCursorCondition({
            createdAtColumn: payment_edits.created_at,
            idColumn: payment_edits.id,
            cursor: options.cursor,
          }),
        ),
      )
      .orderBy(desc(payment_edits.created_at), desc(payment_edits.id))
      .limit(options.limit + 1);
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

  /**
   * The numbers of what a page's ledger rows point at (D81, G-P3) — each invoice's sequence,
   * statutory number, type and due; each credit note's and pending credit's number; each stock
   * purchase's and medical order's number and bill number — one read per kind of link.
   */
  async findLinkNumbers(ids: PaymentLinkIds, organizationId: number): Promise<PaymentLinkNumbers> {
    const invoiceRows = await selectByPublicIds<{
      invoice_sequence: number;
      invoice_number: string;
      type: string;
      due_amount: string;
    }>({
      table: invoices,
      organizationId,
      publicIds: ids.invoiceIds,
      columns: {
        invoice_sequence: invoices.invoice_sequence,
        invoice_number: invoices.invoice_number,
        type: invoices.type,
        due_amount: invoices.due_amount,
      },
    });
    const creditNoteRows = await selectByPublicIds<{ number: number }>({
      table: invoice_credit_notes,
      organizationId,
      publicIds: ids.creditNoteIds,
      columns: { number: invoice_credit_notes.credit_note_number },
    });
    const pendingCreditRows = await selectByPublicIds<{ number: number }>({
      table: pending_credits,
      organizationId,
      publicIds: ids.pendingCreditIds,
      columns: { number: pending_credits.pending_credit_number },
    });
    const stockPurchaseRows = await selectByPublicIds<PaymentStockPurchaseLink>({
      table: stock_purchases,
      organizationId,
      publicIds: ids.stockPurchaseIds,
      columns: {
        stock_purchase_number: stock_purchases.stock_purchase_number,
        bill_number: stock_purchases.bill_number,
      },
    });
    const orderRows = await selectByPublicIds<PaymentMedicalPurchaseOrderLink>({
      table: medical_purchase_orders,
      organizationId,
      publicIds: ids.medicalPurchaseOrderIds,
      columns: {
        purchase_order_number: medical_purchase_orders.purchase_order_number,
        supplier_bill_number: medical_purchase_orders.supplier_bill_number,
      },
    });
    return {
      invoices: new Map(
        invoiceRows.map(({ public_id, due_amount, ...invoice }) => [
          public_id,
          { ...invoice, due_amount: Number(due_amount) },
        ]),
      ),
      creditNotes: new Map(creditNoteRows.map((row) => [row.public_id, row.number])),
      pendingCredits: new Map(pendingCreditRows.map((row) => [row.public_id, row.number])),
      stockPurchases: new Map(
        stockPurchaseRows.map(({ public_id, ...purchase }) => [public_id, purchase]),
      ),
      medicalPurchaseOrders: new Map(
        orderRows.map(({ public_id, ...order }) => [public_id, order]),
      ),
    };
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
