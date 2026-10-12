import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { BaseRecordRepository, type BaseRecordRow } from '@/domains/app/base-record.repository.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { invoice_credit_notes } from '@/domains/app/sub-domains/billing/invoice-credit-notes/invoice-credit-notes.schema.js';
import {
  invoice_items,
  invoice_members,
  invoices,
} from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import {
  medicine_batches,
  medicines,
} from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import { MEDICAL_SALE_STATUS } from './medical-sales.constants.js';
import {
  medical_sale_return_items,
  medical_sale_returns,
  medical_sales,
} from './medical-sales.schema.js';

/** Whether a sale has a return. */
const HAS_RETURN = sql`exists (select 1 from ${medical_sale_returns} where ${medical_sale_returns.medical_sale_id} = ${medical_sales.id})`;

/** What is still due on a sale's invoice. */
const INVOICE_DUE = sql`(select ${invoices.due_amount} from ${invoices} where ${invoices.id} = ${medical_sales.invoice_id})`;

/** MD21: each status as a condition — voided (deleted), returned, then paid or unpaid. */
function statusSql(status: string): SQL {
  if (status === MEDICAL_SALE_STATUS.VOIDED) return sql`${medical_sales.deleted_at} is not null`;
  const live = sql`${medical_sales.deleted_at} is null`;
  if (status === MEDICAL_SALE_STATUS.RETURNED) return sql`(${live} and ${HAS_RETURN})`;
  const paid = sql`${INVOICE_DUE} <= 0`;
  return status === MEDICAL_SALE_STATUS.PAID
    ? sql`(${live} and not ${HAS_RETURN} and ${paid})`
    : sql`(${live} and not ${HAS_RETURN} and not ${paid})`;
}

/** One line of a sale's invoice as a page or a write reads it (11.H.6). */
export interface MedicalSaleLineRow {
  invoice_id: number;
  id: number;
  public_id: string;
  medicine_id: string | null;
  name: string;
  batch_number: string | null;
  medicine_batch_id: number | null;
  expiry_month: string | null;
  purchase_rate: string | null;
  quantity: number;
  rate: string;
  discount_percent: string;
  amount: string;
  returned_quantity: number;
}

/** A sale's invoice summary (11.H.6). */
export interface MedicalSaleInvoiceRow {
  key: number;
  id: string;
  invoice_number: string;
  total: string;
  paid_amount: string;
  due_amount: string;
  payment_status: string;
  remark: string | null;
}

/** A return as a page reads it (11.H.6). */
export interface MedicalSaleReturnRow {
  medical_sale_id: number;
  key: number;
  id: string;
  reason: string;
  refund_mode: string;
  note: string | null;
  amount: string;
  invoice_credit_note_id: string;
  returned_by_membership_id: string | null;
  created_at: Date;
}

/** A returned line as a page reads it (11.H.6). */
export interface MedicalSaleReturnItemRow {
  medical_sale_return_id: number;
  invoice_item_id: string;
  quantity: number;
  amount: string;
  is_restocked: boolean;
}

/**
 * Persistence for `app.medical_sales` and their returns (`app.medical_sale_returns`,
 * `app.medical_sale_return_items`) — launch ROUTE #153, routes-final 11.H.
 *
 * @remarks
 * - **Algorithm:** `q` on the number (`S-983`), the buyer's names and numbers and the medicines'
 *   names; sorts `sold_at` (newest first, the default), `sale_number` and `total`; derived filters
 *   `status` (several — voided, returned, paid, unpaid) and `medicine_id`. A page reads each
 *   sale's invoice, its lines (with each batch's expiry and purchase rate and what came back), its
 *   team and its returns in one query each.
 */
export class MedicalSalesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: medical_sales,
      entity: 'medicalSale',
      searchColumns: [],
      searchExpressions: [
        sql`(select ${contacts.search_text} from ${contacts} where ${contacts.id} = ${medical_sales.contact_id})`,
        sql`(select string_agg(${invoice_items.name}, ' ') from ${invoice_items} where ${invoice_items.invoice_id} = ${medical_sales.invoice_id})`,
      ],
      numberColumn: 'sale_number',
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        sold_at: { keys: [{ value: 'sold_at' }], defaultOrder: 'desc' },
        sale_number: { keys: [{ value: 'sale_number' }], defaultOrder: 'desc' },
        total: {
          keys: [
            {
              value: () =>
                sql`(select ${invoices.total} from ${invoices} where ${invoices.id} = ${medical_sales.invoice_id})`,
              sqlType: 'numeric',
            },
          ],
          defaultOrder: 'desc',
        },
      },
      derivedFilters: {
        status: (value) =>
          sql`(${sql.join(
            (value as string[]).map((status) => statusSql(status)),
            sql` or `,
          )})`,
        medicine_id: (value) =>
          sql`exists (select 1 from ${invoice_items} join ${medicines} on ${medicines.id} = ${invoice_items.medicine_id} where ${invoice_items.invoice_id} = ${medical_sales.invoice_id} and ${medicines.public_id} = ${String(value)})`,
      },
      defaultSort: 'sold_at',
      defaultOrder: 'desc',
    });
  }

  /** The lines of the invoices of a page's sales (or one sale's, for a write), in line order. */
  async findLines(invoiceIds: readonly number[]): Promise<MedicalSaleLineRow[]> {
    if (invoiceIds.length === 0) return [];
    return getRequestDatabase()
      .select({
        invoice_id: invoice_items.invoice_id,
        id: invoice_items.id,
        public_id: invoice_items.public_id,
        medicine_id: medicines.public_id,
        name: invoice_items.name,
        batch_number: invoice_items.batch_number,
        medicine_batch_id: invoice_items.medicine_batch_id,
        expiry_month: medicine_batches.expiry_month,
        purchase_rate: medicine_batches.purchase_rate,
        quantity: invoice_items.quantity,
        rate: invoice_items.rate,
        discount_percent: invoice_items.discount_percent,
        amount: invoice_items.amount,
        returned_quantity: sql<number>`coalesce((select sum(${medical_sale_return_items.quantity}) from ${medical_sale_return_items} where ${medical_sale_return_items.invoice_item_id} = ${invoice_items.id}), 0)::int`,
      })
      .from(invoice_items)
      .leftJoin(medicines, eq(medicines.id, invoice_items.medicine_id))
      .leftJoin(medicine_batches, eq(medicine_batches.id, invoice_items.medicine_batch_id))
      .where(inArray(invoice_items.invoice_id, [...invoiceIds]))
      .orderBy(asc(invoice_items.invoice_id), asc(invoice_items.line_number));
  }

  /** The invoices of a page's sales, by invoice id (11.H.6). */
  async findInvoices(invoiceIds: readonly number[]): Promise<Map<number, MedicalSaleInvoiceRow>> {
    if (invoiceIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        key: invoices.id,
        id: invoices.public_id,
        invoice_number: invoices.invoice_number,
        total: invoices.total,
        paid_amount: invoices.paid_amount,
        due_amount: sql<string>`${invoices.due_amount}`,
        payment_status: sql<string>`${invoices.payment_status}`,
        remark: invoices.remark,
      })
      .from(invoices)
      .where(inArray(invoices.id, [...invoiceIds]));
    return new Map(rows.map((row) => [row.key, row]));
  }

  /** The team members each sale's invoice credits ("Prescribed by"), by invoice id. */
  async findMemberIds(invoiceIds: readonly number[]): Promise<Map<number, string[]>> {
    if (invoiceIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ invoice_id: invoice_members.invoice_id, id: memberships.public_id })
      .from(invoice_members)
      .innerJoin(memberships, eq(memberships.id, invoice_members.membership_id))
      .where(inArray(invoice_members.invoice_id, [...invoiceIds]));
    const byInvoice = new Map<number, string[]>();
    for (const row of rows) {
      const list = byInvoice.get(row.invoice_id) ?? [];
      list.push(row.id);
      byInvoice.set(row.invoice_id, list);
    }
    return byInvoice;
  }

  /** The returns of a page's sales, oldest first, with their lines (11.H.6). */
  async findReturns(saleIds: readonly number[]): Promise<{
    returns: MedicalSaleReturnRow[];
    items: MedicalSaleReturnItemRow[];
  }> {
    if (saleIds.length === 0) return { returns: [], items: [] };
    const database = getRequestDatabase();
    const returns = await database
      .select({
        medical_sale_id: medical_sale_returns.medical_sale_id,
        key: medical_sale_returns.id,
        id: medical_sale_returns.public_id,
        reason: medical_sale_returns.reason,
        refund_mode: medical_sale_returns.refund_mode,
        note: medical_sale_returns.note,
        amount: medical_sale_returns.amount,
        invoice_credit_note_id: invoice_credit_notes.public_id,
        returned_by_membership_id: memberships.public_id,
        created_at: medical_sale_returns.created_at,
      })
      .from(medical_sale_returns)
      .innerJoin(
        invoice_credit_notes,
        eq(invoice_credit_notes.id, medical_sale_returns.invoice_credit_note_id),
      )
      .leftJoin(memberships, eq(memberships.id, medical_sale_returns.returned_by_membership_id))
      .where(inArray(medical_sale_returns.medical_sale_id, [...saleIds]))
      .orderBy(asc(medical_sale_returns.created_at), asc(medical_sale_returns.id));
    if (returns.length === 0) return { returns, items: [] };
    const items = await database
      .select({
        medical_sale_return_id: medical_sale_return_items.medical_sale_return_id,
        invoice_item_id: invoice_items.public_id,
        quantity: medical_sale_return_items.quantity,
        amount: medical_sale_return_items.amount,
        is_restocked: medical_sale_return_items.is_restocked,
      })
      .from(medical_sale_return_items)
      .innerJoin(invoice_items, eq(invoice_items.id, medical_sale_return_items.invoice_item_id))
      .where(
        inArray(
          medical_sale_return_items.medical_sale_return_id,
          returns.map((row) => row.key),
        ),
      );
    return { returns, items };
  }

  /** A page's sales by public id — voided ones too (a void's undo answers with them). */
  async findByPublicIds(options: {
    organizationId: number;
    publicIds: readonly string[];
  }): Promise<BaseRecordRow[]> {
    if (options.publicIds.length === 0) return [];
    return (await getRequestDatabase()
      .select()
      .from(medical_sales)
      .where(
        and(
          eq(medical_sales.organization_id, options.organizationId),
          inArray(medical_sales.public_id, [...options.publicIds]),
        ),
      )) as BaseRecordRow[];
  }

  /** MD20: whether a sale has a return. */
  async hasReturns(saleId: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: medical_sale_returns.id })
      .from(medical_sale_returns)
      .where(eq(medical_sale_returns.medical_sale_id, saleId))
      .limit(1);
    return rows.length > 0;
  }

  /** MD21: what live credit notes have given back on an invoice, rupees. */
  async findCreditedAmount(invoiceId: number): Promise<number> {
    const rows = await getRequestDatabase()
      .select({ total: sql<string>`coalesce(sum(${invoice_credit_notes.amount}), 0)` })
      .from(invoice_credit_notes)
      .where(
        and(
          eq(invoice_credit_notes.invoice_id, invoiceId),
          sql`${invoice_credit_notes.deleted_at} is null`,
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }

  /** MD21: writes a return and its lines. */
  async insertReturn(options: {
    values: {
      organization_id: number;
      medical_sale_id: number;
      reason: string;
      refund_mode: string;
      note: string | null;
      amount: string;
      invoice_credit_note_id: number;
      returned_by_membership_id: number | null;
      created_by_user_id: number | null;
    };
    items: readonly {
      invoice_item_id: number;
      quantity: number;
      amount: string;
      is_restocked: boolean;
    }[];
  }): Promise<void> {
    const database = getRequestDatabase();
    const rows = await database
      .insert(medical_sale_returns)
      .values({
        ...options.values,
        public_id: generatePublicId('medicalSaleReturn'),
      })
      .returning({ id: medical_sale_returns.id });
    const returnId = rows[0]!.id;
    await database.insert(medical_sale_return_items).values(
      options.items.map((item) => ({
        ...item,
        medical_sale_return_id: returnId,
        organization_id: options.values.organization_id,
      })),
    );
  }
}
