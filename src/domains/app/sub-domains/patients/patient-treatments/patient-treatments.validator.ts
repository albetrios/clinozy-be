import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange, withInstants } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePatientTreatmentDto,
  type CreatePatientTreatmentInput,
  listPatientTreatmentsQueryDto,
  ReversePatientTreatmentDto,
  UpdatePatientTreatmentDto,
  type UpdatePatientTreatmentInput,
} from './patient-treatments.dto.js';

/** Parses a session create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientTreatment(data: unknown): CreatePatientTreatmentInput {
  return withInstants({
    values: parseWithSchema({ schema: CreatePatientTreatmentDto, data }),
    fields: ['performed_at'],
  });
}

/** Parses a session update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientTreatment(data: unknown): UpdatePatientTreatmentInput {
  return withInstants({
    values: parseWithSchema({ schema: UpdatePatientTreatmentDto, data }),
    fields: ['performed_at'],
  });
}

/** Parses a reverse body into the values it writes (TR6). */
export function validateReversePatientTreatment(data: unknown): Record<string, unknown> {
  return { reversed_reason: parseWithSchema({ schema: ReversePatientTreatmentDto, data }).reason };
}

/** Parses a treatment list query into a list input (routes-final 7.H.8 #45, #46). */
export function validateListPatientTreatmentsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listPatientTreatmentsQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      status: query.status,
    },
    referenceEquals: {
      patient_id: query.patient_id,
      doctor_membership_id: query.doctor_membership_id,
      therapist_membership_id: query.therapist_membership_id,
      appointment_id: query.appointment_id,
      offering_id: query.offering_id,
      patient_offering_id: query.patient_offering_id,
    },
    derived: {
      is_billed: query.is_billed === undefined ? undefined : query.is_billed === 'true',
      performed_from: query.performed_from,
      performed_to: query.performed_to,
    },
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
