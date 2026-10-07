import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateMedicalContactDto,
  type CreateMedicalContactInput,
  listMedicalContactsQueryDto,
  UpdateMedicalContactDto,
  type UpdateMedicalContactInput,
} from './medical-contacts.dto.js';

/** Parses a medical contact create body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicalContact(data: unknown): CreateMedicalContactInput {
  return parseWithSchema(CreateMedicalContactDto, data);
}

/** Parses a medical contact update body; throws `ValidationError` naming each bad field. */
export function validateUpdateMedicalContact(data: unknown): UpdateMedicalContactInput {
  return parseWithSchema(UpdateMedicalContactDto, data);
}

/** Parses the `GET /app/medical-contacts` query into a list input (filters by column). */
export function validateListMedicalContactsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listMedicalContactsQueryDto, data);
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
