import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { payments } from '@/domains/app/sub-domains/billing/payments/payments.schema.js';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { invoice_credit_notes } from './invoice-credit-notes.schema.js';

/** The credit notes whose invoice matches a condition on `app.invoices`. */
function invoiceWhere(condition: ReturnType<typeof sql>) {
  return sql`${invoice_credit_notes.invoice_id} in (select ${invoices.id} from ${invoices} where ${condition})`;
}

/**
 * Persistence for `app.invoice_credit_notes` (launch ROUTE #136, routes-final 8.B) — the shared app
 * record reads and writes on its table.
 *
 * @remarks
 * - **Algorithm:** `q` on the number (`CN-12`); sort `created_at` (newest first); derived filters
 *   through the invoice — its contact, its branches, and the caller's branches (B4).
 */
export class InvoiceCreditNotesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: invoice_credit_notes,
      entity: 'invoiceCreditNote',
      searchColumns: [],
      numberColumn: 'credit_note_number',
      sortColumns: { created_at: 'created_at' },
      derivedFilters: {
        contact_id: (value) =>
          invoiceWhere(
            sql`${invoices.contact_id} = (select ${contacts.id} from ${contacts} where ${contacts.public_id} = ${String(value)})`,
          ),
        branch_ids: (value) =>
          invoiceWhere(
            sql`${invoices.branch_id} in (select ${branches.id} from ${branches} where ${inArray(branches.public_id, value as string[])})`,
          ),
        visible_branch_ids: (value) =>
          (value as number[]).length === 0
            ? sql`false`
            : invoiceWhere(sql`${inArray(invoices.branch_id, value as number[])}`),
      },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }

  /**
   * MD33: what an invoice's live store-credit notes hold — the credit notes no refund payment
   * carries, whose money stays with the customer as a credit — rupees.
   */
  async findStoreCreditedAmount(invoiceId: number): Promise<number> {
    const rows = await getRequestDatabase()
      .select({ total: sql<string>`coalesce(sum(${invoice_credit_notes.amount}), 0)` })
      .from(invoice_credit_notes)
      .where(
        and(
          eq(invoice_credit_notes.invoice_id, invoiceId),
          isNull(invoice_credit_notes.deleted_at),
          sql`not exists (select 1 from ${payments} where ${payments.invoice_credit_note_id} = ${invoice_credit_notes.id})`,
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }
}
