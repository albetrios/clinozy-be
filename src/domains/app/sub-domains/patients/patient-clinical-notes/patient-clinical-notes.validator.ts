import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePatientClinicalNoteDto,
  type CreatePatientClinicalNoteInput,
  listPatientClinicalNotesQueryDto,
} from './patient-clinical-notes.dto.js';

/** Parses a clinical note create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientClinicalNote(data: unknown): CreatePatientClinicalNoteInput {
  return parseWithSchema({ schema: CreatePatientClinicalNoteDto, data });
}

/** Clinical notes are never edited (P12) — a wrong one is deleted and written again. */
export function refusePatientClinicalNoteUpdate(): Record<string, unknown> {
  throw new Error('clinical notes are never edited');
}

/** Parses a patient's clinical-notes query into a list input (routes-final 7.B.8 #8). */
export function validateListPatientClinicalNotesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listPatientClinicalNotesQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      kind: query.kind?.split(','),
    },
    referenceEquals: {
      appointment_id: query.appointment_id,
    },
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
