import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateMedicalRepVisitDto,
  type CreateMedicalRepVisitInput,
  listMedicalRepVisitsQueryDto,
} from './medical-rep-visits.dto.js';

/** Parses a visit's body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicalRepVisit(data: unknown): CreateMedicalRepVisitInput {
  return parseWithSchema({ schema: CreateMedicalRepVisitDto, data });
}

/** A visit is never changed (MD18) — there is no change route. */
export function refuseMedicalRepVisitUpdate(): Record<string, unknown> {
  throw new Error('medical rep visits are never changed');
}

/** Parses an MR's visits query into a list input (routes-final 11.G.8 #39). */
export function validateListMedicalRepVisitsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listMedicalRepVisitsQueryDto, data });
  return { after: query.after, limit: query.limit, sort: query.sort, order: query.order };
}
