import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { OfferingGroupOutput } from './offering-groups.types.js';

/** Shapes a `app.offering_groups` row as the API returns it (public ids, numbers, ISO times). */
export function serializeOfferingGroup(
  row: BaseRecordRow,
  _references: BaseRecordReferenceLookup,
): OfferingGroupOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    sort_order: row.sort_order as number,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
