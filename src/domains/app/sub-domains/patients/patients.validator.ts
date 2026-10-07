import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { withInstants } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePatientDto,
  type CreatePatientInput,
  listPatientsQueryDto,
  UpdatePatientDto,
  type UpdatePatientInput,
} from './patients.dto.js';

/** Parses a patient create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatient(data: unknown): CreatePatientInput {
  return withInstants(parseWithSchema(CreatePatientDto, data), ['follow_up_at']);
}

/** Parses a patient update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatient(data: unknown): UpdatePatientInput {
  return withInstants(parseWithSchema(UpdatePatientDto, data), ['follow_up_at']);
}

/** Parses the `GET /app/patients` query into a list input (filters by column). */
export function validateListPatientsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPatientsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      gender: query.gender,
      status: query.status,
      conversion: query.conversion,
      referral_source: query.referral_source,
    },
    referenceEquals: {
      home_branch_id: query.home_branch_id,
      doctor_membership_id: query.doctor_membership_id,
    },
    ranges: {
      follow_up_at: {
        from: query.follow_up_at_from === undefined ? undefined : new Date(query.follow_up_at_from),
        to: query.follow_up_at_to === undefined ? undefined : new Date(query.follow_up_at_to),
      },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
