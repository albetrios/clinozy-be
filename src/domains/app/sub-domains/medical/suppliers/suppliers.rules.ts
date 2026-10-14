import { resolveRecordIds, type BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type {
  BaseRecordActionInput,
  BaseRecordRules,
  BaseRecordWriteContext,
} from '@/domains/app/base-record.types.js';
import {
  PAYMENT_DIRECTION,
  PAYMENT_KIND,
} from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import {
  type PaymentSplit,
  recordPayment,
  requirePaymentBranchId,
  splitsToColumns,
} from '@/domains/app/sub-domains/billing/payments/payments.ledger.js';
import { MedicalPurchaseOrdersRepository } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.repository.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import { ConflictError } from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  calendarDateInTimeZone,
  daysBetweenCalendarDates,
  paiseOf,
} from '@/shared/utils/validation/record-fields.util.js';
import { applySupplierCredits } from './supplier-credits/supplier-credits.ledger.js';
import { PaySupplierDto } from './suppliers.dto.js';
import type { SuppliersRepository } from './suppliers.repository.js';
import { suppliers } from './suppliers.schema.js';

const ordersRepository = new MedicalPurchaseOrdersRepository();

/**
 * MD10: takes `paise` out of what is left of the splits, mode by mode in their order — the splits
 * of one order's payment.
 */
function takeFromSplits({
  left,
  paise,
}: {
  left: { mode: PaymentSplit['mode']; paise: number }[];
  paise: number;
}): PaymentSplit[] {
  const taken: PaymentSplit[] = [];
  let needed = paise;
  for (const split of left) {
    if (needed === 0) break;
    const take = Math.min(needed, split.paise);
    if (take === 0) continue;
    split.paise -= take;
    needed -= take;
    taken.push({ mode: split.mode, amount: take / 100 });
  }
  return taken;
}

/**
 * MD10, MD7: "Pay ₹827" — the splits pay the supplier's received orders still due, oldest first,
 * one `supplier_bill` payment per order (each pointing at it), from the branch on an open day;
 * the open credits are applied first. Answers with the supplier.
 */
async function paySupplier(input: BaseRecordActionInput): Promise<BaseRecordRow> {
  const { existing: supplier, context } = input;
  const body = parseWithSchema({ schema: PaySupplierDto, data: input.input });
  const branchId = await requirePaymentBranchId({
    branchPublicId: body.branch_id,
    field: 'branch_id',
    context,
  });
  await applySupplierCredits({ context, supplierId: supplier.id });
  const orders = await ordersRepository.lockDueOrders(supplier.id);
  const duePaise = orders.reduce((total, order) => total + paiseOf(order.due_amount), 0);
  const left = body.splits.map((split) => ({ mode: split.mode, paise: paiseOf(split.amount) }));
  const paying = left.reduce((total, split) => total + split.paise, 0);
  if (paying > duePaise) {
    throw new ConflictError('errors:paymentMoreThanDue').withReason('more_than_due');
  }
  const paidAt = body.paid_at === undefined ? new Date() : new Date(body.paid_at);
  let remaining = paying;
  for (const order of orders) {
    if (remaining === 0) break;
    const take = Math.min(remaining, paiseOf(order.due_amount));
    await recordPayment({
      context,
      values: {
        kind: PAYMENT_KIND.SUPPLIER_BILL,
        direction: PAYMENT_DIRECTION.PAID,
        branch_id: branchId,
        paid_at: paidAt,
        payee_name: String(supplier.name),
        medical_purchase_order_id: order.id,
        reference: body.reference ?? null,
        note: body.note ?? null,
        ...splitsToColumns(takeFromSplits({ left, paise: take })),
      },
    });
    remaining -= take;
  }
  return supplier;
}

/** MD10: a supplier with something payable, an open credit or an order waiting can't be deleted. */
async function assertNothingOwed({
  repository,
  supplier,
}: {
  repository: SuppliersRepository;
  supplier: BaseRecordRow;
}): Promise<void> {
  const account = (await repository.findAccounts([supplier.id])).get(supplier.id);
  if (
    (account?.payable ?? 0) > 0 ||
    (await repository.hasOpenCredit(supplier.id)) ||
    (await ordersRepository.hasOrderWaiting(supplier.id))
  ) {
    throw new ConflictError('errors:supplierHasDues').withReason('supplier_has_dues');
  }
}

/** MD10: a page's account fields — payable, ageing, live orders and their total — and the manufacturers. */
async function decorateSuppliers(options: {
  repository: SuppliersRepository;
  outputs: Record<string, unknown>[];
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { repository, outputs, context } = options;
  const idsByPublicId = await resolveRecordIds({
    table: suppliers,
    organizationId: context.organizationId,
    publicIds: outputs.map((output) => String(output.id)),
  });
  const ids = [...idsByPublicId.values()];
  const accounts = await repository.findAccounts(ids);
  const manufacturers = await repository.findManufacturers(ids);
  const { timezone } = await context.ports.organizationSettings(context.scope);
  const today = await organizationToday(context);
  for (const output of outputs) {
    const id = idsByPublicId.get(String(output.id));
    if (id === undefined) continue;
    const account = accounts.get(id);
    const oldest = account?.oldest_due_received_at ?? null;
    output.payable = account?.payable ?? 0;
    output.order_count = account?.order_count ?? 0;
    output.order_total = account?.order_total ?? 0;
    output.ageing_days =
      oldest === null
        ? null
        : daysBetweenCalendarDates({
            from: calendarDateInTimeZone({ timeZone: timezone, at: oldest }),
            to: today,
          });
    output.manufacturers = manufacturers.get(id) ?? [];
  }
}

/**
 * The supplier rules (launch ROUTE #153, routes-final 11.B, MD10): delete only with nothing owed,
 * paying what is due, and the account a page reads.
 *
 * @remarks
 * - **Algorithm:** a delete is refused while something is payable, a credit is open or an order
 *   waits to be received. The `payments` action pays the received orders still due, oldest first —
 *   one supplier bill each, the splits taken mode by mode — after applying the open credits
 *   (MD11). Every read adds `payable`, `ageing_days`, `order_count`, `order_total` and the manufacturers.
 * - **Failure modes:** `ValidationError` on `branch_id`, `splits`; `ConflictError`
 *   `supplier_has_dues`, `more_than_due`, `day_closed`.
 */
export function createSuppliersRules(repository: SuppliersRepository): BaseRecordRules {
  return {
    prepareRemove: (existing) => assertNothingOwed({ repository, supplier: existing }),
    actions: { payments: paySupplier },
    decorate: (outputs, context) => decorateSuppliers({ repository, outputs, context }),
  };
}
