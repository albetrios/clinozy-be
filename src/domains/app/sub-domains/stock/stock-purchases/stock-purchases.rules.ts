import { type BaseRecordRow, resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import {
  PAYMENT_DIRECTION,
  PAYMENT_KIND,
} from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import {
  recordPayment,
  requirePaymentBranchId,
  splitsToColumns,
} from '@/domains/app/sub-domains/billing/payments/payments.ledger.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import {
  STOCK_ITEM_MOVEMENT_REVERT_REASON,
  STOCK_ITEM_MOVEMENT_TYPE,
} from '@/domains/app/sub-domains/stock/stock-item-movements/stock-item-movements.constants.js';
import {
  quantityMilli,
  quantityText,
  writeStockMovement,
} from '@/domains/app/sub-domains/stock/stock-item-movements/stock-item-movements.ledger.js';
import { StockItemMovementsRepository } from '@/domains/app/sub-domains/stock/stock-item-movements/stock-item-movements.repository.js';
import { StockItemsRepository } from '@/domains/app/sub-domains/stock/stock-items/stock-items.repository.js';
import { stock_items } from '@/domains/app/sub-domains/stock/stock-items/stock-items.schema.js';
import { StockVendorsRepository } from '@/domains/app/sub-domains/stock/stock-vendors/stock-vendors.repository.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { toAmount, toText } from '@/shared/utils/validation/record-fields.util.js';
import type { StockPurchaseItemInput, StockPurchasePaymentInput } from './stock-purchases.dto.js';
import type { StockPurchasesRepository } from './stock-purchases.repository.js';
import { stock_purchases } from './stock-purchases.schema.js';

const itemsRepository = new StockItemsRepository();
const movementsRepository = new StockItemMovementsRepository();
const vendorsRepository = new StockVendorsRepository();

/** One line as the purchase writes it — thousandths and paise (S4, S10). */
interface PendingLine {
  stockItemId: number;
  quantityMilli: number;
  ratePaise: number;
  amountPaise: number;
}

/** What a new purchase writes after its row: its lines and its "Paid" (S10, S11). */
interface PendingPurchase {
  lines: PendingLine[];
  payment: (StockPurchasePaymentInput & { branchId: number }) | undefined;
}

/** The purchases in flight, by their write context — set by `prepareCreate`, read by `afterWrite`. */
const pendingPurchases = new WeakMap<BaseRecordWriteContext, PendingPurchase>();

/** Rupees as paise, for exact sums. */
function paiseOf(value: unknown): number {
  return Math.round((toAmount(value) ?? 0) * 100);
}

/**
 * S10: "Not in the list · add as typed" — the live item of that name (any case) when one exists,
 * else a new one with its unit and the purchase's vendor (D81), at 0 until the line receives it.
 */
async function quickItemId(options: {
  newItem: NonNullable<StockPurchaseItemInput['new_item']>;
  stockVendorId: unknown;
  context: BaseRecordWriteContext;
  repository: StockPurchasesRepository;
}): Promise<number> {
  const { newItem, context } = options;
  const existing = await options.repository.findLiveItemIdByName({
    organizationId: context.organizationId,
    name: newItem.name,
  });
  if (existing !== null) return existing;
  const created = await itemsRepository.insert({
    organization_id: context.organizationId,
    name: newItem.name,
    ...(newItem.unit === undefined ? {} : { unit: newItem.unit }),
    stock_vendor_id: options.stockVendorId,
    created_by_user_id: context.userId,
    updated_by_user_id: context.userId,
  });
  return created.id;
}

/** S10: the lines with their items (live here, or added as typed) and amounts (quantity × rate). */
async function resolveLines(options: {
  items: readonly StockPurchaseItemInput[];
  /** The purchase's vendor (its internal id) — an item added as typed takes it (D81). */
  stockVendorId: unknown;
  context: BaseRecordWriteContext;
  repository: StockPurchasesRepository;
}): Promise<PendingLine[]> {
  const { items, stockVendorId, context, repository } = options;
  const ids = await resolveRecordIds({
    table: stock_items,
    organizationId: context.organizationId,
    publicIds: items.flatMap((item) =>
      item.stock_item_id === undefined ? [] : [item.stock_item_id],
    ),
  });
  const lines: PendingLine[] = [];
  for (const item of items) {
    const stockItemId =
      item.stock_item_id === undefined
        ? await quickItemId({ newItem: item.new_item!, stockVendorId, context, repository })
        : ids.get(item.stock_item_id);
    if (stockItemId === undefined) {
      throw fieldValidationError({
        field: 'items',
        messageKey: 'errors:validation.stockPurchaseUnknownItem',
        messageParams: { id: String(item.stock_item_id) },
      });
    }
    const quantity = quantityMilli(item.quantity);
    const ratePaise = paiseOf(item.rate);
    lines.push({
      stockItemId,
      quantityMilli: quantity,
      ratePaise,
      amountPaise: Math.round((quantity * ratePaise) / 1000),
    });
  }
  return lines;
}

/** A purchase date is not after the organization's today — else a 400 `purchase_date`. */
async function assertPurchaseDate(date: unknown, context: BaseRecordWriteContext): Promise<void> {
  if (typeof date === 'string' && date > (await organizationToday(context))) {
    throw fieldValidationError({
      field: 'purchase_date',
      messageKey: 'errors:validation.stockPurchaseDateInFuture',
    });
  }
}

/**
 * S10, S11: a new purchase's lines, its bill (the lines' total unless sent), its date (today
 * unless sent, never in the future) and its "Paid" (never above the bill).
 */
async function preparePurchase(options: {
  values: Record<string, unknown>;
  context: BaseRecordWriteContext;
  repository: StockPurchasesRepository;
}): Promise<void> {
  const { values, context, repository } = options;
  const items = values.items as StockPurchaseItemInput[];
  const payment = values.payment as StockPurchasePaymentInput | undefined;
  delete values.items;
  delete values.payment;
  const lines = await resolveLines({
    items,
    stockVendorId: values.stock_vendor_id,
    context,
    repository,
  });
  values.bill_amount ??= lines.reduce((total, line) => total + line.amountPaise, 0) / 100;
  values.purchase_date ??= await organizationToday(context);
  await assertPurchaseDate(values.purchase_date, context);
  let pendingPayment: PendingPurchase['payment'];
  if (payment) {
    const paid = payment.splits.reduce((total, split) => total + paiseOf(split.amount), 0);
    if (paid > paiseOf(values.bill_amount)) {
      throw new ConflictError('errors:paymentMoreThanDue').withReason('more_than_due');
    }
    pendingPayment = {
      ...payment,
      branchId: await requirePaymentBranchId({
        branchPublicId: payment.branch_id,
        field: 'payment.branch_id',
        context,
      }),
    };
  }
  pendingPurchases.set(context, { lines, payment: pendingPayment });
}

/** S10: receives each line — a `received` movement and the item's latest rate. */
async function receiveLines(options: {
  purchase: BaseRecordRow;
  lines: readonly PendingLine[];
  context: BaseRecordWriteContext;
}): Promise<void> {
  for (const line of options.lines) {
    await writeStockMovement({
      context: options.context,
      stockItemId: line.stockItemId,
      type: STOCK_ITEM_MOVEMENT_TYPE.RECEIVED,
      changeMilli: line.quantityMilli,
      links: { stock_purchase_id: options.purchase.id },
    });
  }
}

/** S11: the drawer's "Paid" — a supplier bill from the branch, paying the vendor, pointing at the purchase. */
async function recordPurchasePaid(options: {
  purchase: BaseRecordRow;
  payment: NonNullable<PendingPurchase['payment']>;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { purchase, payment, context } = options;
  const vendor = await vendorsRepository.findById(purchase.stock_vendor_id as number);
  await recordPayment({
    context,
    values: {
      kind: PAYMENT_KIND.SUPPLIER_BILL,
      direction: PAYMENT_DIRECTION.PAID,
      branch_id: payment.branchId,
      paid_at: payment.paid_at === undefined ? new Date() : new Date(payment.paid_at),
      reference: payment.reference ?? null,
      payee_name: toText(vendor?.name),
      stock_purchase_id: purchase.id,
      ...splitsToColumns(payment.splits),
    },
  });
}

/** S10, S11: a new purchase's lines go in and are received; its "Paid" is recorded. */
async function writePurchase(options: {
  row: BaseRecordRow;
  context: BaseRecordWriteContext;
  repository: StockPurchasesRepository;
}): Promise<void> {
  const { row, context } = options;
  const pending = pendingPurchases.get(context);
  pendingPurchases.delete(context);
  if (!pending) return;
  await options.repository.insertItems(
    pending.lines.map((line, index) => ({
      stock_purchase_id: row.id,
      line_number: index + 1,
      stock_item_id: line.stockItemId,
      organization_id: context.organizationId,
      quantity: quantityText(line.quantityMilli),
      rate: (line.ratePaise / 100).toFixed(2),
      amount: (line.amountPaise / 100).toFixed(2),
    })),
  );
  await receiveLines({ purchase: row, lines: pending.lines, context });
  for (const line of pending.lines) {
    await itemsRepository.setLastRate({
      id: line.stockItemId,
      rate: (line.ratePaise / 100).toFixed(2),
    });
  }
  if (pending.payment) {
    await recordPurchasePaid({ purchase: row, payment: pending.payment, context });
  }
}

/**
 * S12: deleting takes back what arrived — a `reverted` movement for each `received` one not
 * reverted yet (409 `not_enough_stock` when some was used since).
 */
async function revertReceived(
  existing: BaseRecordRow,
  context: BaseRecordWriteContext,
): Promise<void> {
  const received = await movementsRepository.findUnrevertedOfPurchase(existing.id);
  for (const movement of received) {
    await writeStockMovement({
      context,
      stockItemId: movement.stock_item_id,
      type: STOCK_ITEM_MOVEMENT_TYPE.REVERTED,
      changeMilli: -quantityMilli(movement.quantity_change),
      links: {
        stock_purchase_id: existing.id,
        reverts_stock_item_movement_id: movement.id,
        revert_reason: STOCK_ITEM_MOVEMENT_REVERT_REASON.OTHER,
        note: `Purchase #${Number(existing.stock_purchase_number)} deleted`,
      },
    });
  }
}

/**
 * The stock purchase rules (launch ROUTE #137, routes-final 9.D, S10–S12): the lines and what they
 * receive, the bill, the "Paid", the fixed lines, delete only unpaid, and what a page reads.
 *
 * @remarks
 * - **Algorithm:** a create resolves its lines (a listed item, or one added as typed — a new
 *   item takes the purchase's vendor, D81), defaults the bill to their total and the date to
 *   today; once written, its lines go in, each receives its
 *   quantity with a `received` movement and sets the item's latest rate, and "Paid" records a
 *   supplier-bill payment pointing at it (its paid amount follows — S11). A change keeps the lines
 *   (409 `purchase_received`) and never puts the bill under what is paid. A delete wants nothing
 *   paid and takes back its received stock; a restore receives it again. Every read adds the
 *   lines and the payments.
 * - **Failure modes:** `ValidationError` on `items`, `purchase_date`, `bill_amount`,
 *   `payment.branch_id`; `ConflictError` `more_than_due`, `purchase_received`, `purchase_paid`,
 *   `not_enough_stock`.
 */
export function createStockPurchasesRules(repository: StockPurchasesRepository): BaseRecordRules {
  return {
    prepareCreate: (values, context) => preparePurchase({ values, context, repository }),
    prepareUpdate: async (values, existing, context) => {
      if ('items' in values) {
        throw new ConflictError('errors:stockPurchaseReceived').withReason('purchase_received');
      }
      await assertPurchaseDate(values.purchase_date, context);
      if (!('bill_amount' in values)) return;
      if (paiseOf(values.bill_amount) < paiseOf(await repository.lockPaidAmount(existing.id))) {
        throw fieldValidationError({
          field: 'bill_amount',
          messageKey: 'errors:validation.stockPurchaseBillBelowPaid',
        });
      }
    },
    prepareRemove: async (existing, context) => {
      if (paiseOf(await repository.lockPaidAmount(existing.id)) > 0) {
        throw new ConflictError('errors:stockPurchasePaid').withReason('purchase_paid');
      }
      await revertReceived(existing, context);
    },
    afterWrite: async (row, change, context) => {
      if (change.kind === 'create') {
        await writePurchase({ row, context, repository });
        return;
      }
      if (change.kind !== 'restore') return;
      const lines = await repository.findItemQuantities(row.id);
      await receiveLines({
        purchase: row,
        lines: lines.map((line) => ({
          stockItemId: line.stock_item_id,
          quantityMilli: quantityMilli(line.quantity),
          ratePaise: 0,
          amountPaise: 0,
        })),
        context,
      });
    },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: stock_purchases,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const ids = [...idsByPublicId.values()];
      const items = await repository.findItems(ids);
      const paymentIds = await repository.findPaymentIds(ids);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        output.items = items
          .filter((item) => item.stock_purchase_id === id)
          .map((item) => ({
            line_number: item.line_number,
            stock_item_id: item.stock_item_id,
            quantity: Number(item.quantity),
            rate: toAmount(item.rate) ?? 0,
            amount: toAmount(item.amount) ?? 0,
          }));
        output.payment_ids = id === undefined ? [] : (paymentIds.get(id) ?? []);
      }
    },
  };
}
