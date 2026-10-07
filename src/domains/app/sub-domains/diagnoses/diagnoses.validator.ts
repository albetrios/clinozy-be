import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateDiagnosisDto,
  type CreateDiagnosisInput,
  listDiagnosesQueryDto,
  UpdateDiagnosisDto,
  type UpdateDiagnosisInput,
} from './diagnoses.dto.js';

/** Parses a diagnosis create body; throws `ValidationError` naming each bad field. */
export function validateCreateDiagnosis(data: unknown): CreateDiagnosisInput {
  return parseWithSchema(CreateDiagnosisDto, data);
}

/** Parses a diagnosis update body; throws `ValidationError` naming each bad field. */
export function validateUpdateDiagnosis(data: unknown): UpdateDiagnosisInput {
  return parseWithSchema(UpdateDiagnosisDto, data);
}

/** Parses the `GET /app/diagnoses` query into a list input (filters by column). */
export function validateListDiagnosesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listDiagnosesQueryDto, data);
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
