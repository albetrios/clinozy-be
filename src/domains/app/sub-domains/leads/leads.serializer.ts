import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { LeadOutput } from './leads.types.js';

/**
 * Shapes an `app.leads` row as the API returns it (routes-final 5.6): public ids and ISO times.
 * The contact summary, the patient file and the contact's activity fields are the rules' `decorate`
 * (one read per page) — empty here.
 */
export function serializeLead(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): LeadOutput {
  return {
    id: row.public_id,
    lead_number: row.lead_number as number,
    contact_id: references.publicIdOf('contact_id', row) ?? '',
    contact: null,
    patient_id: null,
    status: row.status as string,
    source: row.source as string | null,
    interests: row.interests as string[],
    kind: row.kind as string,
    retarget_reason: row.retarget_reason as string | null,
    owner_membership_id: references.publicIdOf('owner_membership_id', row),
    involved_membership_ids: references.listOf('involved_membership_ids', row),
    held_until: toInstant(row.held_until),
    follow_up_at: toInstant(row.follow_up_at),
    branch_id: references.publicIdOf('branch_id', row),
    notes: row.notes as string | null,
    last_activity_at: null,
    is_awaiting_reply: false,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
