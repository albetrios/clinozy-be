import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateMessageDto,
  type CreateMessageInput,
  listMessagesQueryDto,
  UpdateMessageDto,
  type UpdateMessageInput,
} from './messages.dto.js';

/** Parses a message create body; throws `ValidationError` naming each bad field. */
export function validateCreateMessage(data: unknown): CreateMessageInput {
  return parseWithSchema(CreateMessageDto, data);
}

/** Parses a message update body; throws `ValidationError` naming each bad field. */
export function validateUpdateMessage(data: unknown): UpdateMessageInput {
  return parseWithSchema(UpdateMessageDto, data);
}

/** Parses the `GET /app/messages` query into a list input (filters by column). */
export function validateListMessagesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listMessagesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      channel: query.channel,
      direction: query.direction,
      kind: query.kind,
      delivery_status: query.delivery_status,
    },
    referenceEquals: {
      lead_id: query.lead_id,
      patient_id: query.patient_id,
      medical_contact_id: query.medical_contact_id,
      task_id: query.task_id,
    },
    ranges: {
      sent_at: {
        from: query.sent_at_from === undefined ? undefined : new Date(query.sent_at_from),
        to: query.sent_at_to === undefined ? undefined : new Date(query.sent_at_to),
      },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
