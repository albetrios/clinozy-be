import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { MessageTemplateOutput } from './message-templates.types.js';

/** Shapes a `app.message_templates` row as the API returns it (public ids, numbers, ISO times). */
export function serializeMessageTemplate(
  row: BaseRecordRow,
  _references: BaseRecordReferenceLookup,
): MessageTemplateOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    body: row.body as string,
    channel: row.channel as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
