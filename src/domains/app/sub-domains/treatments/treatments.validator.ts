import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { withInstants } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateTreatmentDto,
  type CreateTreatmentInput,
  listTreatmentsQueryDto,
  UpdateTreatmentDto,
  type UpdateTreatmentInput,
  reverseTreatmentDto,
} from './treatments.dto.js';

/** Parses a treatment create body; throws `ValidationError` naming each bad field. */
export function validateCreateTreatment(data: unknown): CreateTreatmentInput {
  return withInstants(parseWithSchema(CreateTreatmentDto, data), ['performed_at']);
}

/** Parses a treatment update body; throws `ValidationError` naming each bad field. */
export function validateUpdateTreatment(data: unknown): UpdateTreatmentInput {
  return withInstants(parseWithSchema(UpdateTreatmentDto, data), ['performed_at']);
}

/** Parses the `GET /app/treatments` query into a list input (filters by column). */
export function validateListTreatmentsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listTreatmentsQueryDto, data);
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
      therapist_membership_id: query.therapist_membership_id,
    },
    ranges: {
      performed_at: {
        from: query.performed_at_from === undefined ? undefined : new Date(query.performed_at_from),
        to: query.performed_at_to === undefined ? undefined : new Date(query.performed_at_to),
      },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}

/** Parses the body of the `reverse` action. */
export function validateReverseTreatment(data: unknown): Record<string, unknown> {
  return parseWithSchema(reverseTreatmentDto, data ?? {});
}
