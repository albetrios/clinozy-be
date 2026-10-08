import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CONTACT_ACTIVITY_DELIVERY_STATUS,
  CONTACT_ACTIVITY_DIRECTION,
  CONTACT_ACTIVITY_TYPE,
} from './contact-activities.constants.js';
import {
  AddContactNoteDto,
  ContactMessageBatchDto,
  type ContactMessageBatchInput,
  LogContactCallDto,
  listContactActivitiesQueryDto,
  SendContactMessageDto,
} from './contact-activities.dto.js';

/** A send-message body as entry values: sent, queued for the messaging worker (M8). */
export function validateSendContactMessage(data: unknown): Record<string, unknown> {
  return {
    ...parseWithSchema(SendContactMessageDto, data),
    direction: CONTACT_ACTIVITY_DIRECTION.SENT,
    delivery_status: CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED,
  };
}

/** A log-call body as entry values: a `call_log` either way, no delivery status. */
export function validateLogContactCall(data: unknown): Record<string, unknown> {
  return { ...parseWithSchema(LogContactCallDto, data), type: CONTACT_ACTIVITY_TYPE.CALL_LOG };
}

/** An add-note body as entry values: a `note`, no direction. */
export function validateAddContactNote(data: unknown): Record<string, unknown> {
  return { ...parseWithSchema(AddContactNoteDto, data), type: CONTACT_ACTIVITY_TYPE.NOTE };
}

/** Parses a message batch body; throws `ValidationError` naming each bad field. */
export function validateContactMessageBatch(data: unknown): ContactMessageBatchInput {
  return parseWithSchema(ContactMessageBatchDto, data);
}

/** Entries are never created by a generic body (one route per action, M12) — always a 404 route. */
export function refuseGenericContactActivity(): Record<string, unknown> {
  throw new Error('contact activities are created through their named routes');
}

/** Entries are never changed through a `PATCH` (append-only, M7). */
export function refuseContactActivityUpdate(): Record<string, unknown> {
  throw new Error('contact activities are append-only');
}

/**
 * Parses a stream query into a list input (routes-final 4.C.8 #10): `type` and `group` lists,
 * direction, delivery status, task and appointment links, the time range.
 */
export function validateListContactActivitiesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listContactActivitiesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      type: query.type?.split(','),
      direction: query.direction,
      delivery_status: query.delivery_status,
    },
    referenceEquals: {
      task_id: query.task_id,
      appointment_id: query.appointment_id,
    },
    derived: {
      group: query.group?.split(','),
    },
    ranges: {
      occurred_at: {
        from: query.occurred_at_from === undefined ? undefined : new Date(query.occurred_at_from),
        to: query.occurred_at_to === undefined ? undefined : new Date(query.occurred_at_to),
      },
    },
  };
}
