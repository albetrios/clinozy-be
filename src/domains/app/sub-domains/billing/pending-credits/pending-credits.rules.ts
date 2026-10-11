import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { type BaseRecordRow, resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type {
  BaseRecordActionInput,
  BaseRecordRules,
  BaseRecordWriteContext,
} from '@/domains/app/base-record.types.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { attachBilledContacts } from '@/domains/app/sub-domains/billing/invoices/invoices.rules.js';
import { InvoicesRepository } from '@/domains/app/sub-domains/billing/invoices/invoices.repository.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { InvoiceCreditNotesRepository } from '@/domains/app/sub-domains/billing/invoice-credit-notes/invoice-credit-notes.repository.js';
import {
  PAYMENT_DIRECTION,
  PAYMENT_KIND,
} from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import {
  recordPayment,
  splitsToColumns,
} from '@/domains/app/sub-domains/billing/payments/payments.ledger.js';
import {
  findRecordedByMemberships,
  PaymentsRepository,
} from '@/domains/app/sub-domains/billing/payments/payments.repository.js';
import {
  ConflictError,
  ForbiddenError,
  fieldValidationError,
  MISSING_PERMISSION_REASON,
} from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import {
  PENDING_CREDIT_DIRECTION,
  PENDING_CREDIT_SETTLE_METHOD,
  PENDING_CREDIT_STATUS,
} from './pending-credits.constants.js';
import { SettlePendingCreditDto, type SettlePendingCreditInput } from './pending-credits.dto.js';
import { pending_credits } from './pending-credits.schema.js';

const invoicesRepository = new InvoicesRepository();
const creditNotesRepository = new InvoiceCreditNotesRepository();
const paymentsRepository = new PaymentsRepository();

/** Paise for exact comparisons. */
function paiseOf(value: unknown): number {
  return Math.round((toAmount(value) ?? 0) * 100);
}

/**
 * B23: a contact or a typed name — and an invoice it names is that contact's.
 */
async function assertParty(values: Readonly<Record<string, unknown>>): Promise<void> {
  if (typeof values.contact_id !== 'number' && typeof values.party_name !== 'string') {
    throw fieldValidationError({
      field: 'party_name',
      messageKey: 'errors:validation.pendingCreditPartyRequired',
    });
  }
  if (typeof values.invoice_id === 'number' && typeof values.contact_id === 'number') {
    const invoice = await invoicesRepository.findById(values.invoice_id);
    if (invoice?.contact_id !== values.contact_id) {
      throw fieldValidationError({
        field: 'invoice_id',
        messageKey: 'errors:validation.pendingCreditInvoiceOtherContact',
      });
    }
  }
}

/** B24: change and delete only while nothing is settled. */
function assertNothingSettled(existing: BaseRecordRow): void {
  if (paiseOf(existing.settled_amount) > 0) {
    throw new ConflictError('errors:pendingCreditSettled').withReason('credit_settled');
  }
}

/** The branch a money settlement is paid at — one of the organization's (a 400 otherwise). */
async function resolveBranchId({
  context,
  publicId,
}: {
  context: BaseRecordWriteContext;
  publicId: string;
}): Promise<number> {
  const ids = await resolveRecordIds({
    table: branches,
    organizationId: context.organizationId,
    publicIds: [publicId],
  });
  const id = ids.get(publicId);
  if (id === undefined) {
    throw fieldValidationError({
      field: 'branch_id',
      messageKey: 'errors:validation.recordReferenceNotFound',
      messageParams: { id: publicId, label: 'branch' },
    });
  }
  return id;
}

/** `give` + money: a refund — with a credit note when the credit names a live invoice (B24, B16). */
async function settleByRefund(options: {
  credit: BaseRecordRow;
  body: SettlePendingCreditInput;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { credit, body, context } = options;
  const branchId = await resolveBranchId({ context, publicId: body.branch_id as string });
  const invoice =
    typeof credit.invoice_id === 'number'
      ? await invoicesRepository.findById(credit.invoice_id)
      : null;
  let creditNoteId: number | null = null;
  if (invoice) {
    if (Math.round(body.amount * 100) > paiseOf(invoice.paid_amount)) {
      throw new ConflictError('errors:paymentMoreThanPaid').withReason('more_than_paid');
    }
    const creditNote = await creditNotesRepository.insert({
      organization_id: context.organizationId,
      invoice_id: invoice.id,
      amount: body.amount,
      reason: credit.reason,
      created_by_user_id: context.userId,
      updated_by_user_id: context.userId,
    });
    creditNoteId = creditNote.id;
  }
  await recordPayment({
    context,
    values: {
      kind: PAYMENT_KIND.REFUND,
      direction: PAYMENT_DIRECTION.PAID,
      branch_id: branchId,
      contact_id: credit.contact_id,
      invoice_id: invoice?.id ?? null,
      invoice_credit_note_id: creditNoteId,
      pending_credit_id: credit.id,
      paid_at: body.paid_at === undefined ? new Date() : new Date(body.paid_at),
      ...splitsToColumns(body.splits ?? []),
    },
  });
}

/** `take` + money: money coming back to the clinic (B24). */
async function settleByMoneyBack(options: {
  credit: BaseRecordRow;
  body: SettlePendingCreditInput;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { credit, body, context } = options;
  await recordPayment({
    context,
    values: {
      kind: PAYMENT_KIND.MONEY_BACK,
      direction: PAYMENT_DIRECTION.RECEIVED,
      branch_id: await resolveBranchId({ context, publicId: body.branch_id as string }),
      contact_id: credit.contact_id,
      pending_credit_id: credit.id,
      paid_at: body.paid_at === undefined ? new Date() : new Date(body.paid_at),
      ...splitsToColumns(body.splits ?? []),
    },
  });
}

/**
 * `give` + `use_on_bill`: a receipt on one of the party's invoices with a due, paid by the credit
 * (`credit_amount` — no cash moves, B24). Not the party's, or nothing due, is a 409 `nothing_due`.
 */
async function settleOnBill(options: {
  credit: BaseRecordRow;
  body: SettlePendingCreditInput;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { credit, body, context } = options;
  const publicId = body.invoice_id as string;
  const ids = await resolveRecordIds({
    table: invoices,
    organizationId: context.organizationId,
    publicIds: [publicId],
  });
  const invoiceId = ids.get(publicId);
  const invoice = invoiceId === undefined ? null : await invoicesRepository.findById(invoiceId);
  if (
    !invoice ||
    typeof credit.contact_id !== 'number' ||
    invoice.contact_id !== credit.contact_id ||
    paiseOf(invoice.due_amount) <= 0
  ) {
    throw new ConflictError('errors:pendingCreditNothingDue').withReason('nothing_due');
  }
  await recordPayment({
    context,
    values: {
      kind: PAYMENT_KIND.RECEIPT,
      direction: PAYMENT_DIRECTION.RECEIVED,
      branch_id: invoice.branch_id as number,
      contact_id: credit.contact_id,
      invoice_id: invoice.id,
      pending_credit_id: credit.id,
      paid_at: new Date(),
      ...splitsToColumns([{ mode: 'credit', amount: body.amount }]),
    },
  });
}

/**
 * D83 (1), D25: settling a `give` credit gives money back — a refund, or the credit used on a bill —
 * so it needs `payment:delete` (Owner, Admin, Accountant), else a 403 `missing_permission`; taking
 * money back (`take`) stays with `payment:create`.
 */
async function assertCanGiveBack(context: BaseRecordWriteContext): Promise<void> {
  if (await context.can(APP_PERMISSIONS.PAYMENT_DELETE)) return;
  throw new ForbiddenError('errors:refundNeedsPermission', {
    permission: APP_PERMISSIONS.PAYMENT_DELETE,
  }).withReason(MISSING_PERMISSION_REASON);
}

/**
 * B24: settles a part of a pending credit — up to what is left — as a payment pointing at it;
 * its settled amount and status follow in the same transaction. A `give` credit's settlement is a
 * refund's — `payment:delete` (D83 (1)).
 */
async function settlePendingCredit(input: BaseRecordActionInput): Promise<BaseRecordRow> {
  const { existing, context } = input;
  const body = parseWithSchema({ schema: SettlePendingCreditDto, data: input.input });
  const give = existing.direction === PENDING_CREDIT_DIRECTION.GIVE;
  if (give) await assertCanGiveBack(context);
  if (existing.status !== PENDING_CREDIT_STATUS.OPEN) {
    throw new ConflictError('errors:pendingCreditClosed').withReason('credit_closed');
  }
  if (Math.round(body.amount * 100) > paiseOf(existing.amount) - paiseOf(existing.settled_amount)) {
    throw fieldValidationError({
      field: 'amount',
      messageKey: 'errors:validation.pendingCreditAmountMoreThanLeft',
    });
  }
  if (body.method === PENDING_CREDIT_SETTLE_METHOD.USE_ON_BILL) {
    if (!give) {
      throw fieldValidationError({
        field: 'method',
        messageKey: 'errors:validation.pendingCreditUseOnBillGiveOnly',
      });
    }
    await settleOnBill({ credit: existing, body, context });
  } else if (give) {
    await settleByRefund({ credit: existing, body, context });
  } else {
    await settleByMoneyBack({ credit: existing, body, context });
  }
  return (await input.repository.findById(existing.id)) ?? existing;
}

/**
 * The pending-credit rules (launch ROUTE #136, routes-final 8.D): who it is with, what a change or
 * a delete may do, the settlement, and what a page reads.
 *
 * @remarks
 * - **Algorithm:** a contact or a typed name (B23); a change or a delete only while nothing is
 *   settled. The settle action writes one payment pointing at the credit — a refund (with a credit
 *   note on the credit's invoice), a `money_back` receipt, or a receipt paid by `credit_amount` on
 *   one of the party's invoices — and the payment's write moves the settled amount and the status
 *   ({@link recordPayment}, B24). A page reads the contact's summary, the settlements and who
 *   recorded each credit (D81).
 * - **Failure modes:** `ValidationError` on `party_name`, `invoice_id`, `amount`, `method`,
 *   `branch_id`; `ForbiddenError` `missing_permission` (settling a `give` credit without
 *   `payment:delete`, D83 (1)); `ConflictError` `credit_settled`, `credit_closed`, `nothing_due`,
 *   `more_than_paid`, `more_than_due`, `day_closed`.
 */
export function createPendingCreditsRules(): BaseRecordRules {
  return {
    prepareCreate: async (values) => {
      values.status = PENDING_CREDIT_STATUS.OPEN;
      await assertParty(values);
    },
    prepareUpdate: async (values, existing) => {
      assertNothingSettled(existing);
      await assertParty({ ...existing, ...values });
    },
    prepareRemove: (existing) => {
      assertNothingSettled(existing);
    },
    actions: { settle: settlePendingCredit },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: pending_credits,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const ids = [...idsByPublicId.values()];
      const settlements = await paymentsRepository.findSettlements(ids);
      const recordedBy = await findRecordedByMemberships({
        table: pending_credits,
        ids,
        organizationId: context.organizationId,
      });
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        output.payment_ids = id === undefined ? [] : (settlements.get(id) ?? []);
        output.created_by_membership_id = id === undefined ? null : (recordedBy.get(id) ?? null);
      }
      await attachBilledContacts(outputs);
    },
  };
}
