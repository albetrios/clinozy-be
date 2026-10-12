import { findMembershipIdOfUser, resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { MedicinesRepository } from '@/domains/app/sub-domains/medical/medicines/medicines.repository.js';
import { moveMedicineBatch } from '@/domains/app/sub-domains/medical/medicines/medicines.stock.js';
import { roundToPaise, toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { applySupplierCredits } from './supplier-credits.ledger.js';
import type { SupplierCreditsRepository } from './supplier-credits.repository.js';
import { supplier_credits } from './supplier-credits.schema.js';

const medicinesRepository = new MedicinesRepository();

/**
 * The supplier credit rules (launch ROUTE #153, routes-final 11.C, MD11): "Return expiring stock"
 * takes the packs out of the batch at its purchase rate, and the credit is applied to the
 * supplier's dues at once.
 *
 * @remarks
 * - **Algorithm:** a create reads the batch (its medicine and purchase rate — 0 for an opening
 *   batch without one), takes the quantity out of it (guarded, MD4), prices the credit
 *   (`amount` = quantity × rate) and names the caller's membership (K2); once written, the
 *   supplier's open credits are applied to their received orders still due, oldest first. Every
 *   read adds the supplier, medicine and batch names.
 * - **Failure modes:** `ConflictError` `not_enough_stock` (more than the batch holds),
 *   `record_changed` (a balance moved meanwhile).
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
      const medicine =
        batch === null
          ? null
          : (await medicinesRepository.findLive([batch.medicine_id])).get(batch.medicine_id);
      await moveMedicineBatch({
        context,
        batchId: values.medicine_batch_id as number,
        change: -quantity,
        ...(medicine ? { name: String(medicine.name) } : {}),
      });
    },
    afterWrite: async (row, change, context) => {
      if (change.kind !== 'create') return;
      await applySupplierCredits({ context, supplierId: row.supplier_id as number });
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
