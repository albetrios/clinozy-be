import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { CONTACT_ACTIVITY_TYPE } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import { ContactActivitiesRepository } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.repository.js';
import { DAY_CLOSE_STATUS } from '@/domains/app/sub-domains/billing/day-closes/day-closes.constants.js';
import { ConflictError } from '@/shared/errors/index.js';
import { calendarDateInTimeZone, toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { PENDING_CREDIT_STATUS } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.constants.js';
import { PendingCreditsRepository } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.repository.js';
import { PAYMENT_KIND, PAYMENT_MODE_VALUES } from './payments.constants.js';
import { PAYMENT_MODE_COLUMNS, PaymentsRepository } from './payments.repository.js';

const contactActivitiesRepository = new ContactActivitiesRepository();
const paymentsRepository = new PaymentsRepository();
const pendingCreditsRepository = new PendingCreditsRepository();

/** A split mode. */
export type PaymentMode = (typeof PAYMENT_MODE_VALUES)[number];

/** One split as the API reads and writes it (B18). */
export interface PaymentSplit {
  mode: PaymentMode;
  amount: number;
}

/** The split columns and the amount they add up to (B18). */
export interface PaymentSplitColumns {
  amount: number;
  cash_amount: number;
  upi_amount: number;
  card_amount: number;
  credit_amount: number;
}

/** Paise for exact sums. */
function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** B18: the splits as columns, and `amount` their total. */
export function splitsToColumns(splits: readonly PaymentSplit[]): PaymentSplitColumns {
  const paise = { cash: 0, upi: 0, card: 0, credit: 0 };
  for (const split of splits) paise[split.mode] += toPaise(split.amount);
  return {
    amount: (paise.cash + paise.upi + paise.card + paise.credit) / 100,
    cash_amount: paise.cash / 100,
    upi_amount: paise.upi / 100,
    card_amount: paise.card / 100,
    credit_amount: paise.credit / 100,
  };
}

/** B18: a row's non-zero split columns as `[{ mode, amount }]`, in the modes' order. */
export function columnsToSplits(row: Readonly<Record<string, unknown>>): PaymentSplit[] {
  return PAYMENT_MODE_VALUES.flatMap((mode) => {
    const amount = toAmount(row[PAYMENT_MODE_COLUMNS[mode]]) ?? 0;
    return amount > 0 ? [{ mode, amount }] : [];
  });
}

/** `₹1,500.00` — an amount as an activity entry shows it. */
export function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The organization's calendar day a moment falls on (its time zone) — a payment's day (B6). */
export async function organizationDayOf(
  context: BaseRecordWriteContext,
  at: Date,
): Promise<string> {
  const { timezone } = await context.ports.organizationSettings(context.scope);
  return calendarDateInTimeZone(timezone, at);
}

/**
 * B6: the payment's day — its branch and the organization date of `paid_at` — must be open; the
 * day close is read `FOR SHARE`, so a close and the write never interleave.
 */
export async function assertPaymentDayOpen(options: {
  context: BaseRecordWriteContext;
  branchId: number;
  paidAt: Date;
}): Promise<void> {
  const date = await organizationDayOf(options.context, options.paidAt);
  const day = await paymentsRepository.lockDay({ branchId: options.branchId, date });
  if (day?.status === DAY_CLOSE_STATUS.CLOSED) {
    throw new ConflictError('errors:paymentDayClosed', { date }).withReason('day_closed');
  }
}

/**
 * What a payment does to its invoice's paid amount (8.10): a receipt adds, a refund takes away, a
 * reversal undoes what it reverses; nothing else touches it.
 */
export function invoiceEffect(
  row: Readonly<Record<string, unknown>>,
  reversed?: BaseRecordRow,
): number {
  const amount = toAmount(row.amount) ?? 0;
  if (row.kind === PAYMENT_KIND.RECEIPT) return amount;
  if (row.kind === PAYMENT_KIND.REFUND) return -amount;
  if (row.kind === PAYMENT_KIND.REVERSAL && reversed) return -invoiceEffect(reversed);
  return 0;
}

/**
 * B5, B21: moves an invoice's paid amount by `delta` in one guarded statement — over its total is
 * a 409 `more_than_due`, under nothing a 409 `more_than_paid`.
 */
export async function applyInvoicePaid(options: {
  context: BaseRecordWriteContext;
  invoiceId: unknown;
  delta: number;
}): Promise<void> {
  if (typeof options.invoiceId !== 'number' || options.delta === 0) return;
  const moved = await paymentsRepository.adjustInvoicePaid({
    invoiceId: options.invoiceId,
    delta: options.delta,
    userId: options.context.userId,
  });
  if (moved) return;
  throw options.delta > 0
    ? new ConflictError('errors:paymentMoreThanDue').withReason('more_than_due')
    : new ConflictError('errors:paymentMoreThanPaid').withReason('more_than_paid');
}

/**
 * What a payment does to its stock purchase's paid amount (S11): a supplier bill adds, its
 * reversal takes it away; nothing else touches it.
 */
export function stockPurchaseEffect(
  row: Readonly<Record<string, unknown>>,
  reversed?: BaseRecordRow,
): number {
  if (typeof row.stock_purchase_id !== 'number') return 0;
  if (row.kind === PAYMENT_KIND.SUPPLIER_BILL) return toAmount(row.amount) ?? 0;
  if (row.kind === PAYMENT_KIND.REVERSAL && reversed) return -stockPurchaseEffect(reversed);
  return 0;
}

/**
 * S11: moves a stock purchase's paid amount by `delta` in one guarded statement — over its bill
 * is a 409 `more_than_due`, under nothing a 409 `more_than_paid`.
 */
export async function applyStockPurchasePaid(options: {
  context: BaseRecordWriteContext;
  stockPurchaseId: unknown;
  delta: number;
}): Promise<void> {
  if (typeof options.stockPurchaseId !== 'number' || options.delta === 0) return;
  const moved = await paymentsRepository.adjustStockPurchasePaid({
    stockPurchaseId: options.stockPurchaseId,
    delta: options.delta,
    userId: options.context.userId,
  });
  if (moved) return;
  throw options.delta > 0
    ? new ConflictError('errors:paymentMoreThanDue').withReason('more_than_due')
    : new ConflictError('errors:paymentMoreThanPaid').withReason('more_than_paid');
}

/** B7: a billing event in the contact's activity — a `system` entry linked to the invoice or payment. */
export async function writeBillingActivity(options: {
  context: BaseRecordWriteContext;
  contactId: unknown;
  body: string;
  link: { invoice_id: number } | { payment_id: number };
}): Promise<void> {
  if (typeof options.contactId !== 'number') return;
  await contactActivitiesRepository.insert({
    organization_id: options.context.organizationId,
    contact_id: options.contactId,
    type: CONTACT_ACTIVITY_TYPE.SYSTEM,
    body: options.body,
    ...options.link,
    created_by_user_id: options.context.userId,
    updated_by_user_id: options.context.userId,
  });
}

/** The activity line of a payment that moves a contact's money (B7). */
export function paymentActivityBody(row: Readonly<Record<string, unknown>>): string | null {
  const amount = rupees(toAmount(row.amount) ?? 0);
  if (row.kind === PAYMENT_KIND.RECEIPT) return `Payment received: ${amount}`;
  if (row.kind === PAYMENT_KIND.REFUND) return `Refund given: ${amount}`;
  if (row.kind === PAYMENT_KIND.MONEY_BACK) return `Money back: ${amount}`;
  if (row.kind === PAYMENT_KIND.REVERSAL) return `Payment reversed: ${amount}`;
  return null;
}

/**
 * What a payment does to its pending credit's settled amount (B24): a settlement adds, a reversal
 * of one takes it away; nothing else touches it.
 */
export function pendingCreditEffect(row: Readonly<Record<string, unknown>>): number {
  if (typeof row.pending_credit_id !== 'number') return 0;
  const amount = toAmount(row.amount) ?? 0;
  return row.kind === PAYMENT_KIND.REVERSAL ? -amount : amount;
}

/** The status a settlement leaves its credit in once nothing is left (B23). */
function settledStatusOf(row: Readonly<Record<string, unknown>>): string {
  if (row.kind === PAYMENT_KIND.MONEY_BACK) return PENDING_CREDIT_STATUS.GOT_BACK;
  if (row.kind === PAYMENT_KIND.RECEIPT) return PENDING_CREDIT_STATUS.USED;
  return PENDING_CREDIT_STATUS.GIVEN_BACK;
}

/**
 * B24: moves a pending credit's settled amount by `delta` in one guarded statement — over what is
 * left, or a credit that is gone, is a 409 `credit_closed`.
 */
async function applyPendingCreditSettled(options: {
  context: BaseRecordWriteContext;
  row: Readonly<Record<string, unknown>>;
  delta: number;
}): Promise<void> {
  const { row } = options;
  if (typeof row.pending_credit_id !== 'number' || options.delta === 0) return;
  const moved = await pendingCreditsRepository.adjustSettled({
    id: row.pending_credit_id,
    delta: options.delta,
    settledStatus: settledStatusOf(row),
    userId: options.context.userId,
  });
  if (!moved) throw new ConflictError('errors:pendingCreditClosed').withReason('credit_closed');
}

/**
 * Applies a payment's money to what it points at — the invoice's paid amount (B5, B21), the
 * pending credit's settled amount (B24) and the stock purchase's paid amount (S11) — `sign` 1 when
 * it is written or restored, −1 when deleted.
 *
 * @remarks
 * - **Failure modes:** `ConflictError` `more_than_due`, `more_than_paid`, `credit_closed`.
 */
export async function applyPaymentEffects(options: {
  context: BaseRecordWriteContext;
  row: Readonly<Record<string, unknown>>;
  reversed?: BaseRecordRow | undefined;
  sign: 1 | -1;
}): Promise<void> {
  const { context, row, sign } = options;
  await applyInvoicePaid({
    context,
    invoiceId: row.invoice_id,
    delta: sign * invoiceEffect(row, options.reversed),
  });
  await applyPendingCreditSettled({ context, row, delta: sign * pendingCreditEffect(row) });
  await applyStockPurchasePaid({
    context,
    stockPurchaseId: row.stock_purchase_id,
    delta: sign * stockPurchaseEffect(row, options.reversed),
  });
}

/** B7: the contact's `system` entry for a payment that moves their money. */
export async function writePaymentActivity(options: {
  context: BaseRecordWriteContext;
  row: BaseRecordRow;
}): Promise<void> {
  const body = paymentActivityBody(options.row);
  if (body === null) return;
  await writeBillingActivity({
    context: options.context,
    contactId: options.row.contact_id,
    body,
    link: { payment_id: options.row.id },
  });
}

/**
 * Writes a payment another write makes in its transaction — the invoice's "Paid now" receipt
 * (B13), a credit note's refund (B16), a pending credit's settlement (B24), a reversal (B21), a
 * stock purchase's "Paid" (S11): the day lock, the row, what it points at, the activity entry.
 *
 * @remarks
 * - **Failure modes:** `ConflictError` `day_closed`, `more_than_due`, `more_than_paid`,
 *   `credit_closed`.
 */
export async function recordPayment(options: {
  context: BaseRecordWriteContext;
  values: Record<string, unknown> & { branch_id: number; paid_at: Date; kind: string };
  reversed?: BaseRecordRow;
}): Promise<BaseRecordRow> {
  const { context, values } = options;
  await assertPaymentDayOpen({ context, branchId: values.branch_id, paidAt: values.paid_at });
  const row = await paymentsRepository.insert({
    ...values,
    organization_id: context.organizationId,
    created_by_user_id: context.userId,
    updated_by_user_id: context.userId,
  });
  await applyPaymentEffects({ context, row, reversed: options.reversed, sign: 1 });
  await writePaymentActivity({ context, row });
  return row;
}
