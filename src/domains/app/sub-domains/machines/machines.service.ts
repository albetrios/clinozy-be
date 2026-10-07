import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import type { MachinesRepository } from './machines.repository.js';
import { serializeMachine } from './machines.serializer.js';
import type { MachineOutput } from './machines.types.js';
import {
  validateCreateMachine,
  validateListMachinesQuery,
  validateUpdateMachine,
} from './machines.validator.js';

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
export class MachinesService extends BaseRecordService<MachineOutput> {
  constructor(organizationService: OrganizationService, repository: MachinesRepository) {
    super(organizationService, {
      label: 'Machine',
      repository,
      parseCreate: validateCreateMachine,
      parseUpdate: validateUpdateMachine,
      parseList: validateListMachinesQuery,
      serialize: serializeMachine,
      references: [{ field: 'branch_id', table: branches, label: 'branch' }],
      parent: { field: 'branch_id', table: branches, label: 'Branch' },
      conflicts: {
        idx_machines_branch_name_unique: 'errors:recordAlreadyExists',
      },
      branchColumn: 'branch_id',
    });
  }
}
