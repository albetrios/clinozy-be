import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreatePatientClinicalNoteDto,
  type CreatePatientClinicalNoteInput,
  listPatientClinicalNotesQueryDto,
  UpdatePatientClinicalNoteDto,
  type UpdatePatientClinicalNoteInput,
} from './patient-clinical-notes.dto.js';

/** Parses a clinical note create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientClinicalNote(data: unknown): CreatePatientClinicalNoteInput {
  return parseWithSchema(CreatePatientClinicalNoteDto, data);
}

/** Parses a clinical note update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientClinicalNote(data: unknown): UpdatePatientClinicalNoteInput {
  return parseWithSchema(UpdatePatientClinicalNoteDto, data);
}

/** Parses the `GET /app/patient-clinical-notes` query into a list input (filters by column). */
export function validateListPatientClinicalNotesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPatientClinicalNotesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      kind: query.kind,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
