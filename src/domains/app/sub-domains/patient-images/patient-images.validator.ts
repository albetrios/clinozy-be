import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreatePatientImageDto,
  type CreatePatientImageInput,
  listPatientImagesQueryDto,
  UpdatePatientImageDto,
  type UpdatePatientImageInput,
} from './patient-images.dto.js';

/** Parses a patient image create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientImage(data: unknown): CreatePatientImageInput {
  return parseWithSchema(CreatePatientImageDto, data);
}

/** Parses a patient image update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientImage(data: unknown): UpdatePatientImageInput {
  return parseWithSchema(UpdatePatientImageDto, data);
}

/** Parses the `GET /app/patient-images` query into a list input (filters by column). */
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
      body_part: query.body_part,
    },
    referenceEquals: {
      appointment_id: query.appointment_id,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
