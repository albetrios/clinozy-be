import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import type { BranchHolidaysRepository } from './branch-holidays.repository.js';
import { serializeBranchHoliday } from './branch-holidays.serializer.js';
import type { BranchHolidayOutput } from './branch-holidays.types.js';
import {
  validateCreateBranchHoliday,
  validateListBranchHolidaysQuery,
  validateUpdateBranchHoliday,
} from './branch-holidays.validator.js';

/**
 * Branch holidays of the active organization (launch ROUTE #18): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Branch holiday')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class BranchHolidaysService extends BaseRecordService<BranchHolidayOutput> {
  constructor(organizationService: OrganizationService, repository: BranchHolidaysRepository) {
    super(organizationService, {
      label: 'Branch holiday',
      repository,
      parseCreate: validateCreateBranchHoliday,
      parseUpdate: validateUpdateBranchHoliday,
      parseList: validateListBranchHolidaysQuery,
      serialize: serializeBranchHoliday,
      references: [{ field: 'branch_id', table: branches, label: 'branch' }],
      parent: { field: 'branch_id', table: branches, label: 'Branch' },
      conflicts: {
        idx_branch_holidays_branch_date_unique: 'errors:recordAlreadyExists',
      },
      branchColumn: 'branch_id',
    });
  }
}
