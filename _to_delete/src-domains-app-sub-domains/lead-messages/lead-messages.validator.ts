import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateLeadMessageDto,
  type CreateLeadMessageInput,
  listLeadMessagesQueryDto,
  UpdateLeadMessageDto,
  type UpdateLeadMessageInput,
} from './lead-messages.dto.js';

/** Parses a lead message create body; throws `ValidationError` naming each bad field. */
export function validateCreateLeadMessage(data: unknown): CreateLeadMessageInput {
  return parseWithSchema(CreateLeadMessageDto, data);
}

/** Parses a lead message update body; throws `ValidationError` naming each bad field. */
export function validateUpdateLeadMessage(data: unknown): UpdateLeadMessageInput {
  return parseWithSchema(UpdateLeadMessageDto, data);
}

/** Parses the `GET /app/lead-messages` query into a list input (filters by column). */
export function validateListLeadMessagesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listLeadMessagesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      channel: query.channel,
      delivery_status: query.delivery_status,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
