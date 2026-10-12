import { resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import { fieldValidationError } from '@/shared/errors/index.js';
import { addDaysToCalendarDate } from '@/shared/utils/validation/record-fields.util.js';
import { MEDICAL_REP_NEXT_VISIT_DAYS_MAX } from './medical-reps.constants.js';
import type { MedicalRepsRepository } from './medical-reps.repository.js';
import { medical_reps } from './medical-reps.schema.js';

/** MD17: a next visit set by hand falls today to 120 days on — else a 400 `next_visit_on`. */
async function assertNextVisitWindow({
  value,
  context,
}: {
  value: unknown;
  context: BaseRecordWriteContext;
}): Promise<void> {
  if (typeof value !== 'string') return;
  const today = await organizationToday(context);
  const last = addDaysToCalendarDate({ date: today, days: MEDICAL_REP_NEXT_VISIT_DAYS_MAX });
  if (value < today || value > last) {
    throw fieldValidationError({
      field: 'next_visit_on',
      messageKey: 'errors:validation.medicalRepNextVisitWindow',
      messageParams: { max: MEDICAL_REP_NEXT_VISIT_DAYS_MAX },
    });
  }
}

/**
 * The MR rules (launch ROUTE #153, routes-final 11.F, MD17): the next visit's window and what a
 * page reads.
 *
 * @remarks
 * - **Algorithm:** a save's `next_visit_on` falls today to 120 days on (the organization's
 *   today). Every read adds the latest live visit (`last_visit_on`, `last_samples`),
 *   `is_visit_overdue` (the next visit before today) and the manufacturers. The `medical_rep_visit`
 *   task opens on the next visit (10.A.10, MD8).
 * - **Failure modes:** `ValidationError` on `next_visit_on`.
 */
export function createMedicalRepsRules(repository: MedicalRepsRepository): BaseRecordRules {
  return {
    prepareCreate: (values, context) =>
      assertNextVisitWindow({ value: values.next_visit_on, context }),
    prepareUpdate: (values, _existing, context) =>
      assertNextVisitWindow({ value: values.next_visit_on, context }),
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: medical_reps,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const ids = [...idsByPublicId.values()];
      const visits = await repository.findLastVisits(ids);
      const manufacturers = await repository.findManufacturers(ids);
      const today = await organizationToday(context);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        if (id === undefined) continue;
        const visit = visits.get(id);
        const nextVisitOn = output.next_visit_on as string | null;
        output.last_visit_on = visit?.visit_date ?? null;
        output.last_samples = visit?.samples ?? null;
        output.is_visit_overdue = nextVisitOn !== null && nextVisitOn < today;
        output.manufacturers = manufacturers.get(id) ?? [];
      }
    },
  };
}
