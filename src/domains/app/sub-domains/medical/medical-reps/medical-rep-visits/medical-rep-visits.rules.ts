import { findMembershipIdOfUser } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { MEDICAL_REP_NEXT_VISIT_DAYS_MAX } from '@/domains/app/sub-domains/medical/medical-reps/medical-reps.constants.js';
import { MedicalRepsRepository } from '@/domains/app/sub-domains/medical/medical-reps/medical-reps.repository.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import { fieldValidationError } from '@/shared/errors/index.js';
import { addDaysToCalendarDate } from '@/shared/utils/validation/record-fields.util.js';

const repsRepository = new MedicalRepsRepository();

/** MD18: the visit on or before today; the next one after it and at most 120 days on. */
async function assertVisitDates({
  values,
  context,
}: {
  values: Record<string, unknown>;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const today = await organizationToday(context);
  values.visit_date ??= today;
  const visitDate = String(values.visit_date);
  if (visitDate > today) {
    throw fieldValidationError({
      field: 'visit_date',
      messageKey: 'errors:validation.medicalRepVisitInFuture',
    });
  }
  const next = values.next_visit_on;
  if (typeof next !== 'string') return;
  const last = addDaysToCalendarDate({ date: visitDate, days: MEDICAL_REP_NEXT_VISIT_DAYS_MAX });
  if (next <= visitDate || next > last) {
    throw fieldValidationError({
      field: 'next_visit_on',
      messageKey: 'errors:validation.medicalRepVisitNextWindow',
      messageParams: { max: MEDICAL_REP_NEXT_VISIT_DAYS_MAX },
    });
  }
}

/**
 * The MR visit rules (launch ROUTE #153, routes-final 11.G, MD18): the dates, the author, and the
 * MR's next visit.
 *
 * @remarks
 * - **Algorithm:** a visit is today unless sent (never later); its `next_visit_on` falls after it,
 *   at most 120 days on; `logged_by_membership_id` is the caller's (K2). Once written it sets the
 *   MR's next visit — or clears it when none is sent and the MR's was on or before the visit — so
 *   the reminder task closes (MD8).
 * - **Failure modes:** `ValidationError` on `visit_date`, `next_visit_on`.
 */
export const medicalRepVisitsRules: BaseRecordRules = {
  prepareCreate: async (values, context) => {
    await assertVisitDates({ values, context });
    values.logged_by_membership_id = await findMembershipIdOfUser({
      organizationId: context.organizationId,
      userId: context.userId,
    });
  },
  afterWrite: async (row, change, context) => {
    if (change.kind !== 'create') return;
    const repId = row.medical_rep_id as number;
    const next = (row.next_visit_on as string | null) ?? null;
    if (next !== null) {
      await repsRepository.setNextVisit({ id: repId, nextVisitOn: next, userId: context.userId });
      return;
    }
    const rep = await repsRepository.findById(repId);
    const current = (rep?.next_visit_on as string | null) ?? null;
    if (current !== null && current <= String(row.visit_date)) {
      await repsRepository.setNextVisit({ id: repId, nextVisitOn: null, userId: context.userId });
    }
  },
};
