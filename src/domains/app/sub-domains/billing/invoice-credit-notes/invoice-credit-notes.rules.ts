import { type BaseRecordRow, resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { InvoicesRepository } from '@/domains/app/sub-domains/billing/invoices/invoices.repository.js';
import {
  PAYMENT_DIRECTION,
  PAYMENT_KIND,
} from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import {
  type PaymentSplit,
  recordPayment,
  splitsToColumns,
} from '@/domains/app/sub-domains/billing/payments/payments.ledger.js';
import { PaymentsRepository } from '@/domains/app/sub-domains/billing/payments/payments.repository.js';
import { ConflictError } from '@/shared/errors/index.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { InvoiceCreditNotesRepository } from './invoice-credit-notes.repository.js';
import { invoice_credit_notes } from './invoice-credit-notes.schema.js';

const invoicesRepository = new InvoicesRepository();
const paymentsRepository = new PaymentsRepository();
const creditNotesRepository = new InvoiceCreditNotesRepository();

/** The refund a credit note writes after its row (B16) — how the money goes back, and when. */
interface PendingRefund {
  splits: PaymentSplit[];
  paidAt: Date;
  reference: string | null;
  note: string | null;
  branchId: number;
  contactId: number | null;
}

/** The refund in flight, by its write context — set by `prepareCreate`, read by `afterWrite`. */
const pendingRefunds = new WeakMap<BaseRecordWriteContext, PendingRefund>();

/**
 * Writes a credit note another write makes in its transaction — a medical sale's return (MD21):
 * the note, then its refund payment on the invoice's branch and contact, as
 * `POST …/credit-notes` does; at most what the invoice has paid.
 *
 * @remarks
 * - **Failure modes:** `ConflictError` `more_than_paid`, `day_closed`.
 */
export async function recordCreditNote(options: {
  context: BaseRecordWriteContext;
  invoice: BaseRecordRow;
  amount: number;
  reason: string;
  splits: PaymentSplit[];
  note: string | null;
}): Promise<BaseRecordRow> {
  const { context, invoice } = options;
  if (Math.round(options.amount * 100) > Math.round((toAmount(invoice.paid_amount) ?? 0) * 100)) {
    throw new ConflictError('errors:paymentMoreThanPaid').withReason('more_than_paid');
  }
  const creditNote = await creditNotesRepository.insert({
    organization_id: context.organizationId,
    invoice_id: invoice.id,
    amount: options.amount.toFixed(2),
    reason: options.reason,
    created_by_user_id: context.userId,
    updated_by_user_id: context.userId,
  });
  await recordPayment({
    context,
    values: {
      kind: PAYMENT_KIND.REFUND,
      direction: PAYMENT_DIRECTION.PAID,
      branch_id: invoice.branch_id as number,
      contact_id: (invoice.contact_id as number | null) ?? null,
      invoice_id: invoice.id,
      invoice_credit_note_id: creditNote.id,
      paid_at: new Date(),
      reference: null,
      note: options.note,
      ...splitsToColumns(options.splits),
    },
  });
  return creditNote;
}

/**
 * The credit-note rules (launch ROUTE #136, routes-final 8.B, B16): a credit note is an invoice's
 * refund — written with its refund payment, never edited.
 *
 * @remarks
 * - **Algorithm:** the create reads the invoice, refuses more than it has paid, keeps the refund's
 *   splits and day aside and, once the credit note's row is written, records the `refund` payment
 *   on the invoice's branch and contact ({@link recordPayment} — the day lock, the invoice's paid
 *   amount, the activity entry) in the same transaction. A page reads each note's refund payment.
 * - **Failure modes:** `ConflictError` `more_than_paid` (here, or the paid amount's guard when a
 *   refund raced it), `day_closed`.
 */
export function createInvoiceCreditNotesRules(): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      const invoice = await invoicesRepository.findById(values.invoice_id as number);
      const paid = toAmount(invoice?.paid_amount) ?? 0;
      if (!invoice || Math.round(Number(values.amount) * 100) > Math.round(paid * 100)) {
        throw new ConflictError('errors:paymentMoreThanPaid').withReason('more_than_paid');
      }
      pendingRefunds.set(context, {
        splits: values.splits as PaymentSplit[],
        paidAt: values.paid_at === undefined ? new Date() : new Date(String(values.paid_at)),
        reference: (values.reference as string | null | undefined) ?? null,
        note: (values.note as string | null | undefined) ?? null,
        branchId: invoice.branch_id as number,
        contactId: (invoice.contact_id as number | null) ?? null,
      });
      delete values.splits;
      delete values.paid_at;
      delete values.reference;
      delete values.note;
    },
    afterWrite: async (row, change, context) => {
      if (change.kind !== 'create') return;
      const refund = pendingRefunds.get(context);
      pendingRefunds.delete(context);
      if (!refund) return;
      await recordPayment({
        context,
        values: {
          kind: PAYMENT_KIND.REFUND,
          direction: PAYMENT_DIRECTION.PAID,
          branch_id: refund.branchId,
          contact_id: refund.contactId,
          invoice_id: row.invoice_id,
          invoice_credit_note_id: row.id,
          paid_at: refund.paidAt,
          reference: refund.reference,
          note: refund.note,
          ...splitsToColumns(refund.splits),
        },
      });
    },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: invoice_credit_notes,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const refunds = await paymentsRepository.findRefundsOfCreditNotes([
        ...idsByPublicId.values(),
      ]);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        output.payment_id = id === undefined ? null : (refunds.get(id) ?? null);
      }
    },
  };
}
