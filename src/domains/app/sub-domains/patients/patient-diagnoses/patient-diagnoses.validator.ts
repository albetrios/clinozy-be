import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePatientDiagnosisDto,
  type CreatePatientDiagnosisInput,
  listPatientDiagnosesQueryDto,
  UpdatePatientDiagnosisDto,
  type UpdatePatientDiagnosisInput,
} from './patient-diagnoses.dto.js';

/** Parses a diagnosis create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientDiagnosis(data: unknown): CreatePatientDiagnosisInput {
  return parseWithSchema({ schema: CreatePatientDiagnosisDto, data });
}

/** Parses a diagnosis rename body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientDiagnosis(data: unknown): UpdatePatientDiagnosisInput {
  return parseWithSchema({ schema: UpdatePatientDiagnosisDto, data });
}

/** Parses the `GET /app/patient-diagnoses` query into a list input (routes-final 7.E.8 #27). */
export function validateListPatientDiagnosesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listPatientDiagnosesQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
