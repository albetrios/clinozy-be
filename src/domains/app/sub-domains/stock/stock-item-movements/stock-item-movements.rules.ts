import {
  type BaseRecordRow,
  findMembershipIdOfUser,
  resolveRecordIds,
} from '@/domains/app/base-record.repository.js';
import type { BaseRecordActionInput, BaseRecordRules } from '@/domains/app/base-record.types.js';
import { PATIENT_TREATMENT_STATUS } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.constants.js';
import { PatientTreatmentsRepository } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.repository.js';
import { StockItemsRepository } from '@/domains/app/sub-domains/stock/stock-items/stock-items.repository.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { isPostgresUniqueViolation } from '@/shared/utils/infrastructure/postgres-error.util.js';
import {
  STOCK_ITEM_MOVEMENT_TAKING_TYPE_VALUES,
  STOCK_ITEM_MOVEMENT_TYPE,
} from './stock-item-movements.constants.js';
import { RevertStockItemMovementDto } from './stock-item-movements.dto.js';
import {
  moveStock,
  quantityMilli,
  quantityText,
  writeStockMovement,
} from './stock-item-movements.ledger.js';
import type { StockItemMovementsRepository } from './stock-item-movements.repository.js';
import { stock_item_movements } from './stock-item-movements.schema.js';

const itemsRepository = new StockItemsRepository();
const treatmentsRepository = new PatientTreatmentsRepository();

/** A movement's own errors — the revert and the treatment check. */
function alreadyReverted(): ConflictError {
  return new ConflictError('errors:stockMovementAlreadyReverted').withReason('already_reverted');
}

/** S14: a use names a treatment session that was not reversed. */
async function assertTreatmentDone(treatmentId: unknown): Promise<void> {
  if (typeof treatmentId !== 'number') return;
  const treatment = await treatmentsRepository.findById(treatmentId);
  if (treatment?.status === PATIENT_TREATMENT_STATUS.DONE) return;
  throw fieldValidationError({
    field: 'patient_treatment_id',
    messageKey: 'errors:validation.stockMovementTreatmentReversed',
  });
}

/**
 * S7: the signed change a movement by hand makes — `adjust` from the counted quantity against the
 * balance (taken `FOR UPDATE`; equal is a 400 `quantity`), the others by their type's sign.
 */
async function changeOf(values: Record<string, unknown>): Promise<number> {
  const quantity = quantityMilli(values.quantity);
  if (values.type !== STOCK_ITEM_MOVEMENT_TYPE.ADJUST) {
    const taking = (STOCK_ITEM_MOVEMENT_TAKING_TYPE_VALUES as readonly unknown[]).includes(
      values.type,
    );
    return taking ? -quantity : quantity;
  }
  const current = quantityMilli(await itemsRepository.lockQuantity(values.stock_item_id as number));
  if (quantity === current) {
    throw fieldValidationError({
      field: 'quantity',
      messageKey: 'errors:validation.stockMovementAdjustUnchanged',
    });
  }
  return quantity - current;
}

/**
 * S8: reverts a movement with a reason — a `reverted` row of the opposite change, pointing at it
 * (once), on a movement that is not itself a revert; the item's balance moves back (S5).
 */
async function revertMovement(input: BaseRecordActionInput): Promise<BaseRecordRow> {
  const { existing, context } = input;
  const body = parseWithSchema({ schema: RevertStockItemMovementDto, data: input.input });
  const repository = input.repository as StockItemMovementsRepository;
  if (
    existing.type === STOCK_ITEM_MOVEMENT_TYPE.REVERTED ||
    (await repository.hasRevert(existing.id))
  ) {
    throw alreadyReverted();
  }
  try {
    return await writeStockMovement({
      context,
      stockItemId: existing.stock_item_id as number,
      type: STOCK_ITEM_MOVEMENT_TYPE.REVERTED,
      changeMilli: -quantityMilli(existing.quantity_change),
      links: {
        note: body.note ?? null,
        stock_purchase_id: (existing.stock_purchase_id as number | null) ?? null,
        reverts_stock_item_movement_id: existing.id,
        revert_reason: body.reason,
      },
    });
  } catch (error) {
    if (isPostgresUniqueViolation(error)) throw alreadyReverted();
    throw error;
  }
}

/**
 * The movement rules (launch ROUTE #137, routes-final 9.B): a movement by hand with its server
 * sign, the revert, and what reverted each one.
 *
 * @remarks
 * - **Algorithm:** a movement by hand signs `quantity` by its type — an `adjust` writes the
 *   difference from the counted quantity (S7) — checks a use's treatment session (S14), moves the
 *   item's balance in one guarded statement and keeps the balance it left (S5); the caller is its
 *   author (K2). The revert action writes the opposite movement (S8). Every read adds
 *   `reverted_by_stock_item_movement_id`, and the row's text from what it points at — the
 *   purchase's `stock_purchase_number` and `bill_number`, a revert's `reverts_type` and
 *   `reverts_created_at` (D81) — two reads for the whole page.
 * - **Failure modes:** `ValidationError` on `quantity`, `patient_treatment_id`; `ConflictError`
 *   `not_enough_stock`, `already_reverted`.
 */
export function createStockItemMovementsRules(
  repository: StockItemMovementsRepository,
): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      await assertTreatmentDone(values.patient_treatment_id);
      const change = await changeOf(values);
      delete values.quantity;
      const after = await moveStock({
        stockItemId: values.stock_item_id as number,
        changeMilli: change,
      });
      values.quantity_change = quantityText(change);
      values.quantity_after = quantityText(after);
      values.author_membership_id = await findMembershipIdOfUser({
        organizationId: context.organizationId,
        userId: context.userId,
      });
    },
    actions: { revert: revertMovement },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: stock_item_movements,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const ids = [...idsByPublicId.values()];
      const reverts = await repository.findReverts(ids);
      const texts = await repository.findLinkedTexts(ids);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        output.reverted_by_stock_item_movement_id =
          id === undefined ? null : (reverts.get(id) ?? null);
        const text = id === undefined ? undefined : texts.get(id);
        output.stock_purchase_number = text?.stock_purchase_number ?? null;
        output.bill_number = text?.bill_number ?? null;
        output.reverts_type = text?.reverts_type ?? null;
        output.reverts_created_at = text?.reverts_created_at?.toISOString() ?? null;
      }
    },
  };
}
