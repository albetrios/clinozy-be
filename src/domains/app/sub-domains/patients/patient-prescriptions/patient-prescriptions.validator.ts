import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { fieldValidationError } from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { addDaysToCalendarDate } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePatientPrescriptionDto,
  type CreatePatientPrescriptionInput,
  listPatientPrescriptionsQueryDto,
  UpdatePatientPrescriptionDto,
  type UpdatePatientPrescriptionInput,
} from './patient-prescriptions.dto.js';

/** A prescription number as a list's `q` takes it: `RX-500`, `rx-500`, `#500`, `500`. */
const PRESCRIPTION_NUMBER_QUERY = /^\s*(?:rx-|#)?0*\d{1,9}\s*$/i;

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses a prescription create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientPrescription(data: unknown): CreatePatientPrescriptionInput {
  return parseWithSchema(CreatePatientPrescriptionDto, data);
}

/** Parses a prescription update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientPrescription(data: unknown): UpdatePatientPrescriptionInput {
  return parseWithSchema(UpdatePatientPrescriptionDto, data);
}

/**
 * Parses a prescription list query (routes-final 7.C.8 #13, #14): `q` is a prescription number only
 * (a 400 otherwise); the prescription-date range is inclusive of its last day.
 */
export function validateListPatientPrescriptionsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPatientPrescriptionsQueryDto, data);
  if (query.q !== undefined && !PRESCRIPTION_NUMBER_QUERY.test(query.q)) {
    throw fieldValidationError({
      field: 'q',
      messageKey: 'errors:validation.prescriptionNumberQuery',
    });
  }
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      status: query.status,
    },
    derived: {
      is_filled: query.is_filled === undefined ? undefined : query.is_filled === 'true',
    },
    referenceEquals: {
      patient_id: query.patient_id,
      appointment_id: query.appointment_id,
      doctor_membership_id: query.doctor_membership_id,
    },
    ranges: {
      prescription_date: {
        from: query.prescription_date_from,
        to:
          query.prescription_date_to === undefined
            ? undefined
            : addDaysToCalendarDate({ date: query.prescription_date_to, days: 1 }),
      },
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}
