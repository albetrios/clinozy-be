import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { LeadOutput } from './leads.types.js';

/** Shapes a `app.leads` row as the API returns it (public ids, numbers, ISO times). */
export function serializeLead(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): LeadOutput {
  return {
    id: row.public_id,
    lead_number: row.lead_number as number,
    name: row.name as string,
    phone: row.phone as string,
    email: row.email as string | null,
    status: row.status as string | null,
    source: row.source as string | null,
    interests: row.interests as string[],
    owner_membership_id: references.publicIdOf('owner_membership_id', row),
    involved_membership_ids: references.listOf('involved_membership_ids', row),
    follow_up_at: toInstant(row.follow_up_at),
    branch_id: references.publicIdOf('branch_id', row),
    patient_id: references.publicIdOf('patient_id', row),
    is_contact_thread: row.is_contact_thread as boolean,
    kind: row.kind as string,
    retarget_reason: row.retarget_reason as string | null,
    notes: row.notes as string | null,
    last_touch_at: toInstant(row.last_touch_at),
    phones: row.phones as string[],
    instagram_handles: row.instagram_handles as string[],
    default_channel: row.default_channel as string | null,
    preferences: row.preferences as unknown,
    household: row.household as string | null,
    held_until: toInstant(row.held_until),
    is_unread: false,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
