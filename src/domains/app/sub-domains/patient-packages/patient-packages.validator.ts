import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreatePatientPackageDto,
  type CreatePatientPackageInput,
  listPatientPackagesQueryDto,
  UpdatePatientPackageDto,
  type UpdatePatientPackageInput,
} from './patient-packages.dto.js';

/** Parses a patient package create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientPackage(data: unknown): CreatePatientPackageInput {
  return parseWithSchema(CreatePatientPackageDto, data);
}

/** Parses a patient package update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientPackage(data: unknown): UpdatePatientPackageInput {
  return parseWithSchema(UpdatePatientPackageDto, data);
}

/** Parses the `GET /app/patient-packages` query into a list input (filters by column). */
export function validateListPatientPackagesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPatientPackagesQueryDto, data);
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
