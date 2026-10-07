import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { ConflictError, ValidationError } from '@/shared/errors/index.js';

/**
 * The prescriptions rules (launch ROUTE #67, patient-file.2, D31): an approved prescription is
 * signed and final; a draft is approved only with at least one line.
 *
 * @remarks
 * - **Algorithm:** a `PATCH` of an approved prescription is refused; `approve` needs a non-empty
 *   `items`. Who approves is the `prescription:update` code (Doctor and Admin by default).
 * - **Failure modes:** `ConflictError('prescription_approved')`; a 400 on `items`.
 */
export const prescriptionsRules: BaseRecordRules = {
  prepareUpdate: (_values, existing) => {
    if (existing.status === 'approved') {
      throw new ConflictError('errors:prescriptionApproved').withReason('prescription_approved');
    }
  },
  prepareTransition: (action, _values, existing) => {
    if (action === 'approve' && !(Array.isArray(existing.items) && existing.items.length > 0)) {
      throw new ValidationError(
        'errors:validation.recordFieldRule',
        { field: 'items' },
        { items: ['Add at least one medicine line before approving'] },
      );
    }
  },
};
