import type { BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { MedicalPurchaseOrdersRepository } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.repository.js';
import { ConflictError } from '@/shared/errors/index.js';
import { paiseOf } from '@/shared/utils/validation/record-fields.util.js';
import { SupplierCreditsRepository } from './supplier-credits.repository.js';

const creditsRepository = new SupplierCreditsRepository();
const ordersRepository = new MedicalPurchaseOrdersRepository();

/**
 * MD11: applies a supplier's open credits to their received orders still due — the oldest credit
 * to the oldest order first — moving each order's `credited_amount` and each credit's
 * `applied_amount` by the same paise; what is left stays open for an order received later.
 *
 * @remarks
 * - **Algorithm:** both sides are read locked; one guarded statement per credit and order.
 * - **Failure modes:** `ConflictError` `record_changed` when a guard refuses (a concurrent write
 *   moved a balance — the transaction rolls back).
 */
export async function applySupplierCredits(options: {
  context: BaseRecordWriteContext;
  supplierId: number;
}): Promise<void> {
  const { context, supplierId } = options;
  const credits = await creditsRepository.lockOpenCredits(supplierId);
  if (credits.length === 0) return;
  const orders = (await ordersRepository.lockDueOrders(supplierId)).map((order) => ({
    id: order.id,
    duePaise: paiseOf(order.due_amount),
  }));
  let index = 0;
  for (const credit of credits) {
    let left = paiseOf(credit.amount) - paiseOf(credit.applied_amount);
    while (left > 0 && index < orders.length) {
      const order = orders[index]!;
      const take = Math.min(left, order.duePaise);
      const applied =
        (await ordersRepository.creditOrder({
          orderId: order.id,
          delta: take / 100,
          userId: context.userId,
        })) &&
        (await creditsRepository.applyCredit({
          id: credit.id,
          delta: take / 100,
          userId: context.userId,
        }));
      if (!applied)
        throw new ConflictError('errors:medicalBalanceChanged').withReason('record_changed');
      left -= take;
      order.duePaise -= take;
      if (order.duePaise === 0) index += 1;
    }
  }
}

/**
 * MD32: a credit voided or its void undone — takes back what every credit of the supplier applied
 * and applies its live credits again, the oldest to the oldest received order still due, as if the
 * voided credit had never been (or had never been voided).
 *
 * @remarks
 * - **Algorithm:** the credits' applied amounts, then the orders' credited amounts, go back to 0
 *   (credits before orders — the lock order {@link applySupplierCredits} takes); then
 *   {@link applySupplierCredits}. Where a credit went is not recorded, so the live credits are laid
 *   again on today's dues: what the supplier is owed moves by exactly the voided credit's amount.
 * - **Failure modes:** as {@link applySupplierCredits}.
 */
export async function reapplySupplierCredits(options: {
  context: BaseRecordWriteContext;
  supplierId: number;
}): Promise<void> {
  const { context, supplierId } = options;
  await creditsRepository.takeBackApplied({ supplierId, userId: context.userId });
  await ordersRepository.uncreditSupplierOrders({ supplierId, userId: context.userId });
  await applySupplierCredits({ context, supplierId });
}
