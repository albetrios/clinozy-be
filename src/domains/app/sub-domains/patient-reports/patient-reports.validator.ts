import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreatePatientReportDto,
  type CreatePatientReportInput,
  listPatientReportsQueryDto,
  UpdatePatientReportDto,
  type UpdatePatientReportInput,
} from './patient-reports.dto.js';

/** Parses a patient report create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientReport(data: unknown): CreatePatientReportInput {
  return parseWithSchema(CreatePatientReportDto, data);
}

/** Parses a patient report update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientReport(data: unknown): UpdatePatientReportInput {
  return parseWithSchema(UpdatePatientReportDto, data);
}

/** Parses the `GET /app/patient-reports` query into a list input (filters by column). */
export function validateListPatientReportsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPatientReportsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      type: query.type,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
