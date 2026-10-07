import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreatePatientNoteDto,
  type CreatePatientNoteInput,
  listPatientNotesQueryDto,
  UpdatePatientNoteDto,
  type UpdatePatientNoteInput,
} from './patient-notes.dto.js';

/** Parses a patient note create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientNote(data: unknown): CreatePatientNoteInput {
  return parseWithSchema(CreatePatientNoteDto, data);
}

/** Parses a patient note update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientNote(data: unknown): UpdatePatientNoteInput {
  return parseWithSchema(UpdatePatientNoteDto, data);
}

/** Parses the `GET /app/patient-notes` query into a list input (filters by column). */
export function validateListPatientNotesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPatientNotesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
