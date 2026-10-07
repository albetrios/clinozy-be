import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { PatientPackagesRepository } from '@/domains/app/sub-domains/patient-packages/patient-packages.repository.js';
import { ConflictError, ValidationError } from '@/shared/errors/index.js';
import { calendarDateInTimeZone } from '@/shared/utils/validation/record-fields.util.js';

const patientPackagesRepository = new PatientPackagesRepository();

/**
 * The treatments rules (launch ROUTE #67, patient-file.3, P89): a session done on a package
 * takes one of its sessions (numbering it); reversing gives it back; a reversed session is final.
 *
 * @remarks
 * - **Algorithm:** the package must be the patient's and unexpired (organization's today); the
 *   session is taken with one guarded `sessions_used + 1` (never past `sessions_total`), so two
 *   sessions at once cannot both take the last one. `session_number` is the package's count.
 * - **Failure modes:** `ConflictError` `package_used_up`, `package_expired`,
 *   `treatment_reversed`; a 400 for another patient's package.
 */
export const treatmentsRules: BaseRecordRules = {
  prepareCreate: async (values, context) => {
    if (typeof values.patient_package_id !== 'number') return;
    const patientPackage = await patientPackagesRepository.findById(values.patient_package_id);
    if (!patientPackage || patientPackage.patient_id !== values.patient_id) {
      throw new ValidationError(
        'errors:validation.recordFieldRule',
        { field: 'patient_package_id' },
        { patient_package_id: ['Pick a package of this patient'] },
      );
    }
    const { timezone } = await context.ports.organizationSettings(context.scope);
    if (
      patientPackage.valid_until &&
      String(patientPackage.valid_until) < calendarDateInTimeZone(timezone)
    ) {
      throw new ConflictError('errors:packageExpired').withReason('package_expired');
    }
    const taken = await patientPackagesRepository.adjust({
      id: patientPackage.id,
      column: 'sessions_used',
      delta: 1,
      ceilingColumn: 'sessions_total',
      userId: context.userId,
    });
    if (!taken) throw new ConflictError('errors:packageUsedUp').withReason('package_used_up');
    values.session_number = taken.sessions_used;
  },
  prepareUpdate: (_values, existing) => {
    if (existing.status === 'reversed') {
      throw new ConflictError('errors:treatmentReversed').withReason('treatment_reversed');
    }
  },
  afterWrite: async (row, change, context) => {
    const reversed = change.kind === 'transition' && change.action === 'reverse';
    if (reversed && typeof row.patient_package_id === 'number') {
      await patientPackagesRepository.adjust({
        id: row.patient_package_id,
        column: 'sessions_used',
        delta: -1,
        userId: context.userId,
      });
    }
  },
};
