import {
  type BaseRecordRow,
  findMembershipIdOfUser,
  resolveRecordIds,
  resolveRecordPublicIds,
} from '@/domains/app/base-record.repository.js';
import { requireConfirmedUploads } from '@/domains/app/base-record.service.js';
import type {
  BaseRecordActionInput,
  BaseRecordRules,
  BaseRecordWriteContext,
} from '@/domains/app/base-record.types.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { attachBilledContacts } from '@/domains/app/sub-domains/billing/invoices/invoices.rules.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.schema.js';
import { medical_purchase_orders } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.schema.js';
import { InvoicesRepository } from '@/domains/app/sub-domains/billing/invoices/invoices.repository.js';
import { InvoiceCreditNotesRepository } from '@/domains/app/sub-domains/billing/invoice-credit-notes/invoice-credit-notes.repository.js';
import { DAY_CLOSE_STATUS } from '@/domains/app/sub-domains/billing/day-closes/day-closes.constants.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { toAmount, toInstant } from '@/shared/utils/validation/record-fields.util.js';
import {
  PAYMENT_CREATE_KIND_VALUES,
  PAYMENT_DIRECTION,
  PAYMENT_KIND,
  PAYMENT_PAYEE_KIND_VALUES,
  PAYMENT_RECEIVED_KIND_VALUES,
  SUPPLIER_BILL_PURCHASE_FIELDS,
} from './payments.constants.js';
import { ReversePaymentDto } from './payments.dto.js';
import {
  applyInvoicePaid,
  applyPaymentEffects,
  applyPurchasePaid,
  assertPaymentDayOpen,
  columnsToSplits,
  invoiceEffect,
  organizationDayOf,
  type PaymentSplit,
  purchaseEffect,
  recordPayment,
  splitsToColumns,
  writePaymentActivity,
} from './payments.ledger.js';
import { payments } from './payments.schema.js';
import type { PaymentsRepository } from './payments.repository.js';
import { serializePaymentEdit } from './payments.serializer.js';

const invoicesRepository = new InvoicesRepository();
const creditNotesRepository = new InvoiceCreditNotesRepository();

/** The fields a change records (B20), in the order the ledger shows them. */
const RECORDED_FIELDS = [
  'splits',
  'paid_at',
  'contact_id',
  'invoice_id',
  'stock_purchase_id',
  'medical_purchase_order_id',
  'payee_name',
  'expense_category',
  'reference',
  'note',
  'attachment_keys',
] as const;

/** A row's split columns as the ledger's money, in paise. */
function paiseOf(value: unknown): number {
  return Math.round((toAmount(value) ?? 0) * 100);
}

/** The direction a kind fixes (B17). */
function directionOf(kind: string): string {
  return (PAYMENT_RECEIVED_KIND_VALUES as readonly string[]).includes(kind)
    ? PAYMENT_DIRECTION.RECEIVED
    : PAYMENT_DIRECTION.PAID;
}

/** Whether the money and links of a payment are another write's (a refund, a reversal, a settlement). */
function isFixedMoney(row: Readonly<Record<string, unknown>>): boolean {
  return (
    row.kind === PAYMENT_KIND.REFUND ||
    row.kind === PAYMENT_KIND.REVERSAL ||
    typeof row.pending_credit_id === 'number'
  );
}

/**
 * B17, B19: the fields a kind needs — a receipt's contact (the invoice's, when it names one), an
 * invoice only on a receipt, the payee of an expense or a supplier bill, an expense's category.
 */
async function assertKindFields(values: Readonly<Record<string, unknown>>): Promise<void> {
  const kind = String(values.kind);
  if (!(PAYMENT_CREATE_KIND_VALUES as readonly string[]).includes(kind)) return;
  if (kind === PAYMENT_KIND.RECEIPT && typeof values.contact_id !== 'number') {
    throw fieldValidationError({
      field: 'contact_id',
      messageKey: 'errors:validation.paymentContactRequired',
    });
  }
  if (typeof values.invoice_id === 'number') {
    if (kind !== PAYMENT_KIND.RECEIPT) {
      throw fieldValidationError({
        field: 'invoice_id',
        messageKey: 'errors:validation.paymentInvoiceOnlyReceipt',
      });
    }
    const invoice = await invoicesRepository.findById(values.invoice_id);
    if (invoice?.contact_id !== values.contact_id) {
      throw fieldValidationError({
        field: 'contact_id',
        messageKey: 'errors:validation.paymentContactNotInvoices',
      });
    }
  }
  for (const field of SUPPLIER_BILL_PURCHASE_FIELDS) {
    if (typeof values[field] === 'number' && kind !== PAYMENT_KIND.SUPPLIER_BILL) {
      throw fieldValidationError({
        field,
        messageKey: 'errors:validation.paymentPurchaseOnlySupplierBill',
      });
    }
  }
  if (SUPPLIER_BILL_PURCHASE_FIELDS.every((field) => typeof values[field] === 'number')) {
    throw fieldValidationError({
      field: 'medical_purchase_order_id',
      messageKey: 'errors:validation.paymentOnePurchase',
    });
  }
  if (
    (PAYMENT_PAYEE_KIND_VALUES as readonly string[]).includes(kind) &&
    typeof values.payee_name !== 'string'
  ) {
    throw fieldValidationError({
      field: 'payee_name',
      messageKey: 'errors:validation.paymentPayeeRequired',
    });
  }
  if ((kind === PAYMENT_KIND.EXPENSE) !== (typeof values.expense_category === 'string')) {
    throw fieldValidationError({
      field: 'expense_category',
      messageKey:
        kind === PAYMENT_KIND.EXPENSE
          ? 'errors:validation.paymentExpenseCategoryRequired'
          : 'errors:validation.paymentExpenseCategoryOnlyExpense',
    });
  }
}

/**
 * B18 on a change: the splits as columns — `credit` only on a pending credit's payment, and the
 * money of a refund, a reversal or a settlement kept (only its modes may move).
 */
function applySplits(values: Record<string, unknown>, existing: BaseRecordRow): void {
  if (!('splits' in values)) return;
  const columns = splitsToColumns(values.splits as PaymentSplit[]);
  delete values.splits;
  if (columns.credit_amount > 0 && typeof existing.pending_credit_id !== 'number') {
    throw fieldValidationError({
      field: 'splits',
      messageKey: 'errors:validation.paymentCreditOutsidePendingCredit',
    });
  }
  if (
    isFixedMoney(existing) &&
    (paiseOf(columns.amount) !== paiseOf(existing.amount) ||
      paiseOf(columns.credit_amount) !== paiseOf(existing.credit_amount))
  ) {
    throw fieldValidationError({
      field: 'splits',
      messageKey: 'errors:validation.paymentAmountFixed',
    });
  }
  Object.assign(values, columns);
}

/** A refund's, reversal's or settlement's contact, invoice and purchase stay as their write set them. */
function assertLinksKept(values: Readonly<Record<string, unknown>>, existing: BaseRecordRow): void {
  if (!isFixedMoney(existing)) return;
  for (const field of ['contact_id', 'invoice_id', ...SUPPLIER_BILL_PURCHASE_FIELDS] as const) {
    if (field in values && values[field] !== existing[field]) {
      throw fieldValidationError({
        field,
        messageKey: 'errors:validation.paymentLinkFixed',
      });
    }
  }
}

/** The payment a reversal undoes (none for any other payment). */
async function reversedOf(
  repository: PaymentsRepository,
  row: Readonly<Record<string, unknown>>,
): Promise<BaseRecordRow | undefined> {
  if (typeof row.reverses_payment_id !== 'number') return undefined;
  return (await repository.findById(row.reverses_payment_id)) ?? undefined;
}

/** The referenced fields a change records as public ids, with the table each names. */
const RECORDED_REFERENCES = {
  contact_id: contacts,
  invoice_id: invoices,
  stock_purchase_id: stock_purchases,
  medical_purchase_order_id: medical_purchase_orders,
} as const;

/** A referenced field a change records. */
type RecordedReference = keyof typeof RECORDED_REFERENCES;

/** The recorded value of one field — splits as `[{ mode, amount }]`, references as public ids. */
function recordedValue(
  row: BaseRecordRow,
  field: (typeof RECORDED_FIELDS)[number],
  publicIds: ReadonlyMap<RecordedReference, Map<number, string>>,
): unknown {
  if (field === 'splits') return columnsToSplits(row);
  if (field === 'paid_at') return toInstant(row.paid_at);
  if (field in RECORDED_REFERENCES) {
    const id = row[field];
    return typeof id === 'number'
      ? (publicIds.get(field as RecordedReference)?.get(id) ?? null)
      : null;
  }
  return row[field] ?? null;
}

/** B20: records what a change changed — the changed fields only, before → after. */
async function recordEdit(options: {
  repository: PaymentsRepository;
  before: BaseRecordRow;
  after: BaseRecordRow;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { before, after, context } = options;
  const publicIds = new Map<RecordedReference, Map<number, string>>();
  for (const [field, table] of Object.entries(RECORDED_REFERENCES)) {
    const ids = [before[field], after[field]].filter(
      (value): value is number => typeof value === 'number',
    );
    publicIds.set(field as RecordedReference, await resolveRecordPublicIds({ table, ids }));
  }
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of RECORDED_FIELDS) {
    const from = recordedValue(before, field, publicIds);
    const to = recordedValue(after, field, publicIds);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[field] = { from, to };
  }
  if (Object.keys(changes).length === 0) return;
  await options.repository.insertEdit({
    organizationId: context.organizationId,
    paymentId: after.id,
    changes,
    authorMembershipId: await findMembershipIdOfUser({
      organizationId: context.organizationId,
      userId: context.userId,
    }),
    userId: context.userId,
  });
}

/**
 * B20, B21, S11, MD7: a change moves the invoice's and the purchase's paid amount by the
 * difference — one delta on the same record, or out of the old one and into the new one.
 */
async function moveLinkedPaid(options: {
  before: BaseRecordRow;
  after: BaseRecordRow;
  reversed: BaseRecordRow | undefined;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { before, after, reversed, context } = options;
  const links = [
    {
      field: 'invoice_id',
      effect: invoiceEffect,
      apply: (id: unknown, delta: number) => applyInvoicePaid({ context, invoiceId: id, delta }),
    },
    ...SUPPLIER_BILL_PURCHASE_FIELDS.map((field) => ({
      field,
      effect: (row: Readonly<Record<string, unknown>>, reversedRow?: BaseRecordRow) =>
        purchaseEffect(row, field, reversedRow),
      apply: (id: unknown, delta: number) =>
        applyPurchasePaid({ context, field, purchaseId: id, delta }),
    })),
  ];
  for (const link of links) {
    const was = link.effect(before, reversed);
    const now = link.effect(after, reversed);
    if (before[link.field] === after[link.field]) {
      await link.apply(after[link.field], now - was);
      continue;
    }
    await link.apply(before[link.field], -was);
    await link.apply(after[link.field], now);
  }
}

/**
 * B21: undoes a settled payment — a `reversal` entry on an open day, opposite to it, pointing at
 * it (once), with the same splits and links; the reason is its note.
 */
async function reversePayment(input: BaseRecordActionInput): Promise<BaseRecordRow> {
  const { existing, context } = input;
  const body = parseWithSchema(ReversePaymentDto, input.input);
  const repository = input.repository as PaymentsRepository;
  if (existing.kind === PAYMENT_KIND.REVERSAL || (await repository.hasReversal(existing.id))) {
    throw new ConflictError('errors:paymentAlreadyReversed').withReason('already_reversed');
  }
  const day = await repository.lockDay({
    branchId: existing.branch_id as number,
    date: await organizationDayOf(context, existing.paid_at as Date),
  });
  if (day?.status !== DAY_CLOSE_STATUS.CLOSED) {
    throw new ConflictError('errors:paymentDayOpen').withReason('day_open');
  }
  return recordPayment({
    context,
    values: {
      kind: PAYMENT_KIND.REVERSAL,
      direction:
        existing.direction === PAYMENT_DIRECTION.RECEIVED
          ? PAYMENT_DIRECTION.PAID
          : PAYMENT_DIRECTION.RECEIVED,
      branch_id: existing.branch_id as number,
      paid_at: body.paid_at === undefined ? new Date() : new Date(body.paid_at),
      amount: existing.amount,
      cash_amount: existing.cash_amount,
      upi_amount: existing.upi_amount,
      card_amount: existing.card_amount,
      credit_amount: existing.credit_amount,
      contact_id: existing.contact_id,
      invoice_id: existing.invoice_id,
      pending_credit_id: existing.pending_credit_id,
      stock_purchase_id: existing.stock_purchase_id,
      medical_purchase_order_id: existing.medical_purchase_order_id,
      reverses_payment_id: existing.id,
      note: body.reason,
    },
    reversed: existing,
  });
}

/**
 * The payment rules (launch ROUTE #136, routes-final 8.C): what each kind needs, the day lock,
 * the money a payment moves on its invoice and pending credit, the recorded changes, the
 * reversal, and what a page reads.
 *
 * @remarks
 * - **Algorithm:** a create fixes the direction from the kind (B17), stores the splits as columns
 *   (B18), checks the kind's fields (B19) and its day (B6); once written, its money moves the
 *   invoice's paid amount and the pending credit's settled amount, and a `system` entry joins the
 *   contact's activity (B7); a supplier bill may pay a stock purchase (S11) or a received
 *   medical order (MD7). A change (open day —
 *   its old and new `paid_at`) keeps a refund's, reversal's or settlement's money and links, moves
 *   the invoice's and the purchase's paid amount by the difference and records the changed fields
 *   (B20). A delete or restore (open day) takes the money out or
 *   puts it back — a refund's credit note goes and comes back with it (B16). The reverse action
 *   undoes a settled payment (B21).
 * - **Failure modes:** `ValidationError` on `splits`, `contact_id`, `invoice_id`, `payee_name`,
 *   `expense_category`, `attachment_keys`; `ConflictError` `day_closed`, `more_than_due`,
 *   `more_than_paid`, `credit_closed`, `day_open`, `already_reversed`.
 */
export function createPaymentsRules(repository: PaymentsRepository): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      values.direction = directionOf(String(values.kind));
      Object.assign(values, splitsToColumns(values.splits as PaymentSplit[]));
      delete values.splits;
      values.paid_at ??= new Date();
      await assertKindFields(values);
      await requireConfirmedUploads({
        fileKeys: values.attachment_keys as string[] | undefined,
        field: 'attachment_keys',
        context,
      });
      await assertPaymentDayOpen({
        context,
        branchId: values.branch_id as number,
        paidAt: values.paid_at as Date,
      });
    },
    prepareUpdate: async (values, existing, context) => {
      await assertPaymentDayOpen({
        context,
        branchId: existing.branch_id as number,
        paidAt: existing.paid_at as Date,
      });
      if (values.paid_at instanceof Date) {
        await assertPaymentDayOpen({
          context,
          branchId: existing.branch_id as number,
          paidAt: values.paid_at,
        });
      }
      applySplits(values, existing);
      assertLinksKept(values, existing);
      await assertKindFields({ ...existing, ...values });
      if ('attachment_keys' in values) {
        await requireConfirmedUploads({
          fileKeys: values.attachment_keys as string[],
          field: 'attachment_keys',
          context,
        });
      }
    },
    prepareRemove: async (existing, context) => {
      await assertPaymentDayOpen({
        context,
        branchId: existing.branch_id as number,
        paidAt: existing.paid_at as Date,
      });
    },
    prepareRestore: async (deleted, context) => {
      await assertPaymentDayOpen({
        context,
        branchId: deleted.branch_id as number,
        paidAt: deleted.paid_at as Date,
      });
    },
    afterWrite: async (row, change, context) => {
      if (change.kind === 'transition') return;
      const reversed = await reversedOf(repository, row);
      if (change.kind === 'create') {
        await applyPaymentEffects({ context, row, reversed, sign: 1 });
        await writePaymentActivity({ context, row });
        return;
      }
      if (change.kind === 'update' && change.before) {
        await moveLinkedPaid({ before: change.before, after: row, reversed, context });
        await recordEdit({ repository, before: change.before, after: row, context });
        return;
      }
      const restored = change.kind === 'restore';
      await applyPaymentEffects({ context, row, reversed, sign: restored ? 1 : -1 });
      if (typeof row.invoice_credit_note_id !== 'number') return;
      if (restored) {
        await creditNotesRepository.restore(row.invoice_credit_note_id, context.userId);
        return;
      }
      await creditNotesRepository.softDelete(
        row.invoice_credit_note_id,
        {
          delete_reason: String(row.delete_reason),
          delete_note: (row.delete_note as string | null) ?? null,
        },
        context.userId,
      );
    },
    actions: { reverse: reversePayment },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: payments,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const ids = [...idsByPublicId.values()];
      const settled = await repository.findSettled(ids, context.organizationId);
      const reversals = await repository.findReversals(ids);
      const edits = await repository.findEditSummaries(ids);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        if (id === undefined) continue;
        const summary = edits.get(id);
        output.is_settled = settled.has(id);
        output.reversed_by_payment_id = reversals.get(id) ?? null;
        output.edit_count = summary?.count ?? 0;
        output.last_edit = summary ? serializePaymentEdit(summary.last) : null;
      }
      await attachBilledContacts(outputs);
    },
  };
}
