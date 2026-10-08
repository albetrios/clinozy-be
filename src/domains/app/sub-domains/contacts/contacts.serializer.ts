import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { ContactOutput, ContactPhoneOutput } from './contacts.types.js';

/** A received entry newer than the team's last sent one (4.C–4.D). */
function isAwaitingReply(row: BaseRecordRow): boolean {
  const received = row.last_received_at as Date | null;
  const sent = row.last_sent_at as Date | null;
  return received !== null && (sent === null || received > sent);
}

/**
 * Shapes an `app.contacts` row as the API returns it (routes-final 4.A.6): public ids, ISO times,
 * `phones` only on a single-contact response (the lookup has them), the reply state from the
 * activity times. `open_lead_id` / `open_lead_status` are the rules' `decorate` (one read per page,
 * #131); the patient and visit fields are null until #132–#133 (D61).
 */
export function serializeContact(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): ContactOutput {
  const phones = references.childrenOf('phones', row) as ContactPhoneOutput[] | undefined;
  return {
    id: row.public_id,
    contact_number: row.contact_number as number,
    first_name: row.first_name as string,
    last_name: row.last_name as string | null,
    gender: row.gender as string | null,
    date_of_birth: row.date_of_birth as string | null,
    primary_phone: row.primary_phone as string,
    ...(phones === undefined ? {} : { phones }),
    email: row.email as string | null,
    address: row.address as string | null,
    instagram_handles: row.instagram_handles as string[],
    default_channel: row.default_channel as string,
    preference_tags: row.preference_tags as string[],
    has_marketing_consent: row.has_marketing_consent as boolean,
    referral_source: row.referral_source as string | null,
    referred_by_contact_id: references.publicIdOf('referred_by_contact_id', row),
    referred_by_name: row.referred_by_name as string | null,
    household_contact_id: references.publicIdOf('household_contact_id', row) ?? row.public_id,
    member_membership_ids: references.listOf('member_membership_ids', row),
    patient_id: null,
    patient_number: null,
    open_lead_id: null,
    open_lead_status: null,
    last_visit_on: null,
    next_visit_on: null,
    last_activity_at: toInstant(row.last_activity_at),
    last_sent_at: toInstant(row.last_sent_at),
    last_received_at: toInstant(row.last_received_at),
    is_awaiting_reply: isAwaitingReply(row),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
