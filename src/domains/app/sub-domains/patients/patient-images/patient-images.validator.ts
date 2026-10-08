import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreatePatientImageDto,
  type CreatePatientImageInput,
  listPatientImagesQueryDto,
  UpdatePatientImageDto,
  type UpdatePatientImageInput,
} from './patient-images.dto.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses a photo create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientImage(data: unknown): CreatePatientImageInput {
  return parseWithSchema(CreatePatientImageDto, data);
}

/** Parses a photo update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientImage(data: unknown): UpdatePatientImageInput {
  return parseWithSchema(UpdatePatientImageDto, data);
}

/** Parses a patient's photo query into a list input (routes-final 7.F.8 #33, P26). */
export function validateListPatientImagesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPatientImagesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      album: query.album,
      stage: query.stage,
      body_part: query.body_part,
    },
    referenceEquals: {
      appointment_id: query.appointment_id,
      patient_treatment_id: query.patient_treatment_id,
    },
    derived: {
      has_appointment:
        query.has_appointment === undefined ? undefined : query.has_appointment === 'true',
    },
    ranges: {
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}
