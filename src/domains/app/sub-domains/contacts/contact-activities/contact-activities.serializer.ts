import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import { CONTACT_ACTIVITY_LINK_COLUMNS } from './contact-activities.constants.js';
import { contactActivityGroupOf } from './contact-activities.repository.js';
import type { ContactActivityOutput } from './contact-activities.types.js';

/**
 * Shapes an `app.contact_activities` row as the API returns it (routes-final 4.C.6): public ids for
 * the contact, template, answered entry, author and record link; ISO times; the derived `group`.
 */
export function serializeContactActivity(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): ContactActivityOutput {
  const links = Object.fromEntries(
    CONTACT_ACTIVITY_LINK_COLUMNS.map((column) => [column, references.publicIdOf(column, row)]),
  ) as Record<(typeof CONTACT_ACTIVITY_LINK_COLUMNS)[number], string | null>;
  return {
    id: row.public_id,
    contact_id: references.publicIdOf('contact_id', row) as string,
    type: row.type as string,
    direction: row.direction as string | null,
    body: row.body as string,
    contact_message_template_id: references.publicIdOf('contact_message_template_id', row),
    attachment_keys: row.attachment_keys as string[],
    reply_to_contact_activity_id: references.publicIdOf('reply_to_contact_activity_id', row),
    delivery_status: row.delivery_status as string | null,
    provider_message_id: row.provider_message_id as string | null,
    failure_reason: row.failure_reason as string | null,
    occurred_at: toInstant(row.occurred_at) as string,
    delivered_at: toInstant(row.delivered_at),
    read_at: toInstant(row.read_at),
    failed_at: toInstant(row.failed_at),
    author_membership_id: references.publicIdOf('author_membership_id', row),
    ...links,
    group: contactActivityGroupOf(row),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
