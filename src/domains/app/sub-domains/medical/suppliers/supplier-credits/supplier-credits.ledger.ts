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
