import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { BranchRoomOutput } from './branch-rooms.types.js';

/** Shapes a `app.branch_rooms` row as the API returns it (public ids, numbers, ISO times). */
export function serializeBranchRoom(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): BranchRoomOutput {
  return {
    id: row.public_id,
    branch_id: references.publicIdOf('branch_id', row) ?? '',
    name: row.name as string,
    is_active: row.is_active as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
