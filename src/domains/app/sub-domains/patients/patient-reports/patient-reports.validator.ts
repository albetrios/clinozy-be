import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePatientReportDto,
  type CreatePatientReportInput,
  listPatientReportsQueryDto,
  UpdatePatientReportDto,
  type UpdatePatientReportInput,
} from './patient-reports.dto.js';

/** Parses a report create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientReport(data: unknown): CreatePatientReportInput {
  return parseWithSchema({ schema: CreatePatientReportDto, data });
}

/** Parses a report update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientReport(data: unknown): UpdatePatientReportInput {
  return parseWithSchema({ schema: UpdatePatientReportDto, data });
}

/** Parses a patient's reports query into a list input (routes-final 7.G.8 #39). */
export function validateListPatientReportsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listPatientReportsQueryDto, data });
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
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
