import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { MessageOutput } from './messages.types.js';

/** Shapes a `app.messages` row as the API returns it (public ids, numbers, ISO times). */
export function serializeMessage(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): MessageOutput {
  return {
    id: row.public_id,
    lead_id: references.publicIdOf('lead_id', row),
    patient_id: references.publicIdOf('patient_id', row),
    medical_contact_id: references.publicIdOf('medical_contact_id', row),
    channel: row.channel as string,
    direction: row.direction as string,
    kind: row.kind as string,
    body: row.body as string,
    message_template_id: references.publicIdOf('message_template_id', row),
    attachment_keys: row.attachment_keys as string[],
    reply_to_message_id: references.publicIdOf('reply_to_message_id', row),
    delivery_status: row.delivery_status as string,
    provider_message_id: row.provider_message_id as string | null,
    failure_reason: row.failure_reason as string | null,
    sent_at: toInstant(row.sent_at) as string,
    delivered_at: toInstant(row.delivered_at),
    read_at: toInstant(row.read_at),
    failed_at: toInstant(row.failed_at),
    is_system: row.is_system as boolean,
    author_membership_id: references.publicIdOf('author_membership_id', row),
    record_type: row.record_type as string | null,
    record_id: row.record_id as string | null,
    task_id: references.publicIdOf('task_id', row),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
