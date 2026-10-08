import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreatePatientReportDto,
  type CreatePatientReportInput,
  listPatientReportsQueryDto,
  UpdatePatientReportDto,
  type UpdatePatientReportInput,
} from './patient-reports.dto.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses a report create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientReport(data: unknown): CreatePatientReportInput {
  return parseWithSchema(CreatePatientReportDto, data);
}

/** Parses a report update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientReport(data: unknown): UpdatePatientReportInput {
  return parseWithSchema(UpdatePatientReportDto, data);
}

/** Parses a patient's reports query into a list input (routes-final 7.G.8 #39). */
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
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}
