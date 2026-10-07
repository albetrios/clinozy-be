import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateMessageTemplateDto,
  type CreateMessageTemplateInput,
  listMessageTemplatesQueryDto,
  UpdateMessageTemplateDto,
  type UpdateMessageTemplateInput,
} from './message-templates.dto.js';

/** Parses a message template create body; throws `ValidationError` naming each bad field. */
export function validateCreateMessageTemplate(data: unknown): CreateMessageTemplateInput {
  return parseWithSchema(CreateMessageTemplateDto, data);
}

/** Parses a message template update body; throws `ValidationError` naming each bad field. */
export function validateUpdateMessageTemplate(data: unknown): UpdateMessageTemplateInput {
  return parseWithSchema(UpdateMessageTemplateDto, data);
}

/** Parses the `GET /app/message-templates` query into a list input (filters by column). */
export function validateListMessageTemplatesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listMessageTemplatesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      channel: query.channel,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
