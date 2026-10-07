import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import type { DayClosesRepository } from './day-closes.repository.js';
import { serializeDayClose } from './day-closes.serializer.js';
import type { DayCloseOutput } from './day-closes.types.js';
import {
  validateCloseDayClose,
  validateCreateDayClose,
  validateListDayClosesQuery,
  validateUpdateDayClose,
} from './day-closes.validator.js';

/**
 * Day closes of the active organization (launch ROUTE #38): list, read, create, update,
 * soft-delete with a reason and restore, and the lifecycle actions `close`, `reopen`.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Day close')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class DayClosesService extends BaseRecordService<DayCloseOutput> {
  constructor(organizationService: OrganizationService, repository: DayClosesRepository) {
    super(organizationService, {
      label: 'Day close',
      repository,
      parseCreate: validateCreateDayClose,
      parseUpdate: validateUpdateDayClose,
      parseList: validateListDayClosesQuery,
      serialize: serializeDayClose,
      references: [{ field: 'branch_id', table: branches, label: 'branch' }],
      conflicts: {
        idx_day_closes_branch_date_unique: 'errors:recordAlreadyExists',
      },
      branchColumn: 'branch_id',
      transitions: {
        close: {
          from: ['open'],
          set: { status: 'closed' },
          stamp: ['closed_at'],
          parse: validateCloseDayClose,
        },
        reopen: { from: ['closed'], set: { status: 'open' }, stamp: ['reopened_at'] },
      },
    });
  }
}
