import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { LeadMessageOutput } from './lead-messages.types.js';

/** Shapes a `app.lead_messages` row as the API returns it (public ids, numbers, ISO times). */
export function serializeLeadMessage(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): LeadMessageOutput {
  return {
    id: row.public_id,
    lead_id: references.publicIdOf('lead_id', row) ?? '',
    channel: row.channel as string,
    direction: row.direction as string,
    body: row.body as string,
    delivery_status: row.delivery_status as string,
    is_system: row.is_system as boolean,
    author_membership_id: references.publicIdOf('author_membership_id', row),
    sent_at: toInstant(row.sent_at) as string,
    record_type: row.record_type as string | null,
    record_id: row.record_id as string | null,
    task_id: references.publicIdOf('task_id', row),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
