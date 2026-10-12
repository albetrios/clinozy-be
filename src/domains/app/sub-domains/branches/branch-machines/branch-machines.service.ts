import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import type { BranchMachinesRepository } from './branch-machines.repository.js';
import { serializeBranchMachine } from './branch-machines.serializer.js';
import type { BranchMachineOutput } from './branch-machines.types.js';
import {
  validateCreateBranchMachine,
  validateListBranchMachinesQuery,
  validateUpdateBranchMachine,
} from './branch-machines.validator.js';

/**
 * Machines of the active organization (launch ROUTE #20): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Machine')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class BranchMachinesService extends BaseRecordService<BranchMachineOutput> {
  constructor(organizationService: OrganizationService, repository: BranchMachinesRepository) {
    super(organizationService, {
      label: 'Machine',
      repository,
      parseCreate: validateCreateBranchMachine,
      parseUpdate: validateUpdateBranchMachine,
      parseList: validateListBranchMachinesQuery,
      serialize: serializeBranchMachine,
      references: [{ field: 'branch_id', table: branches, label: 'branch' }],
      parent: { field: 'branch_id', table: branches, label: 'Branch' },
      conflicts: {
        idx_branch_machines_branch_name_unique: 'errors:recordAlreadyExists',
      },
      branchColumn: 'branch_id',
    });
  }
}
