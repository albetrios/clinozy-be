import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { ContactMessageTemplateOutput } from './contact-message-templates.types.js';

/** Shapes an `app.contact_message_templates` row as the API returns it. */
export function serializeContactMessageTemplate({
  row,
}: {
  row: BaseRecordRow;
}): ContactMessageTemplateOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    body: row.body as string,
    type: row.type as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
