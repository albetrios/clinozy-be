import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { RoomOutput } from './rooms.types.js';

/** Shapes a `app.rooms` row as the API returns it (public ids, numbers, ISO times). */
export function serializeRoom(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): RoomOutput {
  return {
    id: row.public_id,
    branch_id: references.publicIdOf('branch_id', row) ?? '',
    name: row.name as string,
    is_active: row.is_active as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
