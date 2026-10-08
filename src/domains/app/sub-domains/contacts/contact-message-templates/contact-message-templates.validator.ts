import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateContactMessageTemplateDto,
  type CreateContactMessageTemplateInput,
  listContactMessageTemplatesQueryDto,
  UpdateContactMessageTemplateDto,
  type UpdateContactMessageTemplateInput,
} from './contact-message-templates.dto.js';

/** Parses a template create body; throws `ValidationError` naming each bad field. */
export function validateCreateContactMessageTemplate(
  data: unknown,
): CreateContactMessageTemplateInput {
  return parseWithSchema(CreateContactMessageTemplateDto, data);
}

/** Parses a template update body; throws `ValidationError` naming each bad field. */
export function validateUpdateContactMessageTemplate(
  data: unknown,
): UpdateContactMessageTemplateInput {
  return parseWithSchema(UpdateContactMessageTemplateDto, data);
}

/** Parses the templates list query into a list input — `q` on the name, the `type` filter. */
export function validateListContactMessageTemplatesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listContactMessageTemplatesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: { type: query.type },
  };
}
