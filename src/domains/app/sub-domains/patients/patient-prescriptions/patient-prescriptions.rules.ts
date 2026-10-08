import { findMembershipIdOfUser, resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { medicines } from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import {
  assertAppointmentOfPatient,
  writePatientFileActivity,
} from '@/domains/app/sub-domains/patients/patients.rules.js';
import { ConflictError, fieldValidationError, ForbiddenError } from '@/shared/errors/index.js';
import { PATIENT_PRESCRIPTION_STATUS } from './patient-prescriptions.constants.js';
import type { PatientPrescriptionLine } from './patient-prescriptions.dto.js';

/** The action that makes a prescription final (P15). */
const APPROVE = 'approve';

/** The 409 of a change to an approved prescription (P15). */
function prescriptionApprovedError(): ConflictError {
  return new ConflictError('errors:prescriptionApproved').withReason('prescription_approved');
}

/**
 * Every line's `medicine_id` is a live medicine of the organization (P15) — else a 400 on `items`
 * naming the line. Shared by prescriptions and kits.
 */
export async function assertLineMedicinesLive(options: {
  items: unknown;
  context: BaseRecordWriteContext;
}): Promise<void> {
  if (!Array.isArray(options.items)) return;
  const lines = options.items as PatientPrescriptionLine[];
  const named = lines.flatMap((line) => (line.medicine_id ? [line.medicine_id] : []));
  const live = await resolveRecordIds({
    table: medicines,
    organizationId: options.context.organizationId,
    publicIds: named,
  });
  lines.forEach((line, index) => {
    if (line.medicine_id && !live.has(line.medicine_id)) {
      throw fieldValidationError({
        field: 'items',
        messageKey: 'errors:validation.prescriptionMedicineNotLive',
        messageParams: { line: index + 1, id: line.medicine_id },
      });
    }
  });
}

/**
 * The patient prescription rules (launch ROUTE #133, routes-final 7.C): a draft until approved,
 * then final; lines name live medicines; the visit is the patient's; approving shows in the
 * contact's activity.
 *
 * @remarks
 * - **Algorithm:** a create or change checks each line's medicine (P15) and the visit (TR3); a
 *   `PATCH` or `DELETE` of an approved prescription is refused (P15). `approve` needs at least one
 *   line and records the caller's membership as the approver (a caller who is not a member is a
 *   403); after it a `system` entry linked to the prescription joins the contact's activity —
 *   shown only to `patient_prescription:read` holders (7.10, M10).
 * - **Failure modes:** `ConflictError` `prescription_approved`; `ValidationError` on `items` or
 *   `appointment_id`; `ForbiddenError` `not_a_member`.
 */
export const patientPrescriptionsRules: BaseRecordRules = {
  prepareCreate: async (values, context) => {
    await assertLineMedicinesLive({ items: values.items, context });
    await assertAppointmentOfPatient({
      appointmentId: values.appointment_id,
      patientId: values.patient_id as number,
    });
  },
  prepareUpdate: async (values, existing, context) => {
    if (existing.status === PATIENT_PRESCRIPTION_STATUS.APPROVED) throw prescriptionApprovedError();
    await assertLineMedicinesLive({ items: values.items, context });
    if ('appointment_id' in values) {
      await assertAppointmentOfPatient({
        appointmentId: values.appointment_id,
        patientId: existing.patient_id as number,
      });
    }
  },
  prepareRemove: (existing) => {
    if (existing.status === PATIENT_PRESCRIPTION_STATUS.APPROVED) throw prescriptionApprovedError();
  },
  prepareTransition: async (action, values, existing, context) => {
    if (action !== APPROVE) return;
    if (!(Array.isArray(existing.items) && existing.items.length > 0)) {
      throw fieldValidationError({
        field: 'items',
        messageKey: 'errors:validation.prescriptionApproveNeedsLines',
      });
    }
    const membershipId = await findMembershipIdOfUser({
      organizationId: context.organizationId,
      userId: context.userId,
    });
    if (membershipId === null) {
      throw new ForbiddenError('errors:forbidden').withReason('not_a_member');
    }
    values.approved_by_membership_id = membershipId;
  },
  afterWrite: async (row, change, context) => {
    if (!(change.kind === 'transition' && change.action === APPROVE)) return;
    await writePatientFileActivity({
      context,
      patientId: row.patient_id as number,
      body: `Prescription RX-${row.prescription_number} approved`,
      link: { patient_prescription_id: row.id },
    });
  },
};
