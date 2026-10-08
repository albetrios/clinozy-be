import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { BranchMachineOutput } from './branch-machines.types.js';

/** Shapes a `app.branch_machines` row as the API returns it (public ids, numbers, ISO times). */
export function serializeBranchMachine(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): BranchMachineOutput {
  return {
    id: row.public_id,
    branch_id: references.publicIdOf('branch_id', row) ?? '',
    name: row.name as string,
    is_active: row.is_active as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
