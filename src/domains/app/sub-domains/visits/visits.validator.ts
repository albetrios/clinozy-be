import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateVisitDto,
  type CreateVisitInput,
  listVisitsQueryDto,
  UpdateVisitDto,
  type UpdateVisitInput,
  stageVisitDto,
} from './visits.dto.js';

/** Parses a visit create body; throws `ValidationError` naming each bad field. */
export function validateCreateVisit(data: unknown): CreateVisitInput {
  return parseWithSchema(CreateVisitDto, data);
}

/** Parses a visit update body; throws `ValidationError` naming each bad field. */
export function validateUpdateVisit(data: unknown): UpdateVisitInput {
  return parseWithSchema(UpdateVisitDto, data);
}

/** Parses the `GET /app/visits` query into a list input (filters by column). */
export function validateListVisitsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listVisitsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      stage: query.stage,
    },
    referenceEquals: {
      appointment_id: query.appointment_id,
      patient_id: query.patient_id,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}

/** Parses the body of the `stage` action. */
export function validateStageVisit(data: unknown): Record<string, unknown> {
  return parseWithSchema(stageVisitDto, data ?? {});
}
