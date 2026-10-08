import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { readContactLinkedSearch } from '@/domains/app/sub-domains/contacts/contacts.validator.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { withInstants } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePatientDto,
  type CreatePatientInput,
  listPatientsQueryDto,
  UpdatePatientDto,
  type UpdatePatientInput,
} from './patients.dto.js';
import { PATIENT_NUMBER_PREFIX } from './patients.constants.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses a patient create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatient(data: unknown): CreatePatientInput {
  return withInstants(parseWithSchema(CreatePatientDto, data), ['follow_up_at']);
}

/** Parses a patient update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatient(data: unknown): UpdatePatientInput {
  return withInstants(parseWithSchema(UpdatePatientDto, data), ['follow_up_at']);
}

/**
 * Parses the `GET /app/patients` query into a list input (routes-final 7.A.8 #1, P9): `q` through
 * the contact and the patient number (`PT-0412`, `#412`), `types` as a list (any of them), the
 * references by public id.
 */
export function validateListPatientsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPatientsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    equals: {
      status: query.status,
      conversion: query.conversion,
    },
    referenceEquals: {
      home_branch_id: query.home_branch_id,
      doctor_membership_id: query.doctor_membership_id,
      contact_id: query.contact_id,
    },
    derived: {
      search: readContactLinkedSearch(query.q, { recordPrefix: PATIENT_NUMBER_PREFIX }),
      types: query.types?.split(','),
    },
    ranges: {
      follow_up_at: {
        from: readInstant(query.follow_up_at_from),
        to: readInstant(query.follow_up_at_to),
      },
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}
