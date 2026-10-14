import { findMembershipIdOfUser, resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { MedicinesRepository } from '@/domains/app/sub-domains/medical/medicines/medicines.repository.js';
import { moveMedicineBatch } from '@/domains/app/sub-domains/medical/medicines/medicines.stock.js';
import { roundToPaise, toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { applySupplierCredits, reapplySupplierCredits } from './supplier-credits.ledger.js';
import type { SupplierCreditsRepository } from './supplier-credits.repository.js';
import { supplier_credits } from './supplier-credits.schema.js';

const medicinesRepository = new MedicinesRepository();

/** Moves a credit's packs in or out of its batch (MD4) — named by its medicine for the 409. */
async function moveCreditPacks(options: {
  context: BaseRecordWriteContext;
  batchId: number;
  change: number;
}): Promise<void> {
  const batch = await medicinesRepository.findBatch(options.batchId);
  const medicine =
    batch === null
      ? null
      : (await medicinesRepository.findLive([batch.medicine_id])).get(batch.medicine_id);
  await moveMedicineBatch({
    context: options.context,
    batchId: options.batchId,
    change: options.change,
    ...(medicine ? { name: String(medicine.name) } : {}),
  });
}

/**
 * The supplier credit rules (launch ROUTE #153, routes-final 11.C, MD11; rev 2 MD32, MD34): "Return
 * expiring stock" takes the packs out of the batch at its purchase rate, and the credit is applied
 * to the supplier's dues at once; a void puts the packs back and takes the credit off the dues, its
 * undo takes the packs again and applies it again.
 *
 * @remarks
 * - **Algorithm:** a create reads the batch (its medicine and purchase rate — 0 for an opening
 *   batch without one), takes the quantity out of it (guarded, MD4), prices the credit
 *   (`amount` = quantity × rate) and names the caller's membership (K2); once written, the
 *   supplier's open credits are applied to their received orders still due, oldest first. A void
 *   puts the quantity back into the batch; an undo takes it again; after either, the supplier's
 *   live credits are applied again oldest first ({@link reapplySupplierCredits}). Every read adds
 *   the supplier, medicine and batch names.
 * - **Failure modes:** `ConflictError` `not_enough_stock` (more than the batch holds — on create or
 *   undo), `batch_full` (a void past 9999 packs), `record_changed` (a balance moved meanwhile).
 */
export function createSupplierCreditsRules(repository: SupplierCreditsRepository): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      const batch = await medicinesRepository.findBatch(values.medicine_batch_id as number);
      const quantity = values.quantity as number;
      const rate = toAmount(batch?.purchase_rate) ?? 0;
      values.medicine_id = batch?.medicine_id;
      values.rate = rate.toFixed(2);
      values.amount = roundToPaise(quantity * rate).toFixed(2);
      values.created_by_membership_id = await findMembershipIdOfUser({
        organizationId: context.organizationId,
        userId: context.userId,
      });
      await moveCreditPacks({
        context,
        batchId: values.medicine_batch_id as number,
        change: -quantity,
      });
    },
    prepareRemove: async (existing, context) => {
      await moveCreditPacks({
        context,
        batchId: existing.medicine_batch_id as number,
        change: existing.quantity as number,
      });
    },
    prepareRestore: async (deleted, context) => {
      await moveCreditPacks({
        context,
        batchId: deleted.medicine_batch_id as number,
        change: -(deleted.quantity as number),
      });
    },
    afterWrite: async (row, change, context) => {
      const supplierId = row.supplier_id as number;
      if (change.kind === 'create') await applySupplierCredits({ context, supplierId });
      if (change.kind === 'delete' || change.kind === 'restore') {
        await reapplySupplierCredits({ context, supplierId });
      }
    },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: supplier_credits,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const names = await repository.findNames([...idsByPublicId.values()]);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        const row = id === undefined ? undefined : names.get(id);
        if (!row) continue;
        output.supplier_name = row.supplier_name;
        output.medicine_name = row.medicine_name;
        output.batch_number = row.batch_number;
      }
    },
  };
}
