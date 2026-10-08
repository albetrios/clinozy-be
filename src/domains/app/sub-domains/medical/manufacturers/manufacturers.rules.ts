import { resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { ConflictError } from '@/shared/errors/index.js';
import { MANUFACTURER_TONE_VALUES } from './manufacturers.constants.js';
import type { ManufacturersRepository } from './manufacturers.repository.js';
import { manufacturers } from './manufacturers.schema.js';

/** MD9: the tone after `last` in the swatch row's order (the first when there is none). */
export function nextManufacturerTone(last: string | null): string {
  const index = (MANUFACTURER_TONE_VALUES as readonly string[]).indexOf(last ?? '');
  return MANUFACTURER_TONE_VALUES[(index + 1) % MANUFACTURER_TONE_VALUES.length]!;
}

/**
 * The manufacturer rules (launch ROUTE #153, routes-final 11.A, MD9): the upper-case name, a quick
 * one's tone, delete only without medicines, and what a page reads.
 *
 * @remarks
 * - **Algorithm:** a save stores the name upper case ("ALVI"); a quick create without a tone takes
 *   the one after the latest manufacturer's. A delete is refused while a live medicine names it.
 *   Every read adds `medicine_count` and the linked live suppliers and MRs (`id`, `name`).
 * - **Failure modes:** `ConflictError` `manufacturer_has_medicines`.
 */
export function createManufacturersRules(repository: ManufacturersRepository): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      values.name = String(values.name).toUpperCase();
      if (values.is_quick === true && values.tone === undefined) {
        values.tone = nextManufacturerTone(await repository.findLastTone(context.organizationId));
      }
    },
    prepareUpdate: (values) => {
      if (typeof values.name === 'string') values.name = values.name.toUpperCase();
    },
    prepareRemove: async (existing) => {
      if (((await repository.countMedicines([existing.id])).get(existing.id) ?? 0) > 0) {
        throw new ConflictError('errors:manufacturerHasMedicines').withReason(
          'manufacturer_has_medicines',
        );
      }
    },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: manufacturers,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const ids = [...idsByPublicId.values()];
      const medicineCounts = await repository.countMedicines(ids);
      const suppliers = await repository.findSuppliers(ids);
      const medicalReps = await repository.findMedicalReps(ids);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        if (id === undefined) continue;
        output.medicine_count = medicineCounts.get(id) ?? 0;
        output.suppliers = suppliers.get(id) ?? [];
        output.medical_reps = medicalReps.get(id) ?? [];
      }
    },
  };
}
