import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreatePrescriptionDto,
  type CreatePrescriptionInput,
  listPrescriptionsQueryDto,
  UpdatePrescriptionDto,
  type UpdatePrescriptionInput,
} from './prescriptions.dto.js';

/** Parses a prescription create body; throws `ValidationError` naming each bad field. */
export function validateCreatePrescription(data: unknown): CreatePrescriptionInput {
  return parseWithSchema(CreatePrescriptionDto, data);
}

/** Parses a prescription update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePrescription(data: unknown): UpdatePrescriptionInput {
  return parseWithSchema(UpdatePrescriptionDto, data);
}

/** Parses the `GET /app/prescriptions` query into a list input (filters by column). */
export function validateListPrescriptionsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPrescriptionsQueryDto, data);
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
      appointment_id: query.appointment_id,
      doctor_membership_id: query.doctor_membership_id,
    },
    ranges: {
      prescription_date: { from: query.prescription_date_from, to: query.prescription_date_to },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
