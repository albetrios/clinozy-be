import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { DAY_CLOSE_STATUS } from './day-closes.constants.js';
import type { DayClosesRepository } from './day-closes.repository.js';
import { createDayClosesRules } from './day-closes.rules.js';
import { serializeDayClose } from './day-closes.serializer.js';
import type { DayCloseOutput } from './day-closes.types.js';
import {
  refuseDayCloseUpdate,
  validateCloseDayClose,
  validateCreateDayClose,
  validateListDayClosesQuery,
  validateReopenDayClose,
} from './day-closes.validator.js';

/**
 * Each branch's day of cash (launch ROUTE #136, routes-final 8.E): past and open days, open the day,
 * a day with its live figures and events, count and close it, reopen it.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.day_closes`, branch-scoped (B4 —
 *   `branch:read` sees every branch); one row per branch and day (a second is a 409
 *   `record_already_exists`). `close` (from `open`) and `reopen` (from `closed`) are its
 *   transitions; the rules fill the opening, the expected cash and the events (B25–B27). Never
 *   changed or deleted. Reading needs `payment:read`, opening and closing `payment:update`,
 *   reopening `payment:delete` (the routes' gates, B2).
 * - **Failure modes:** `NotFoundError('Day close')`; `ValidationError` for a bad body or query, a
 *   branch that is not yours, a date out of range or a missing difference reason; `ConflictError`
 *   `record_already_exists`, `transition_not_allowed`.
 */
export class DayClosesService extends BaseRecordService<DayCloseOutput> {
  constructor(organizationService: OrganizationService, repository: DayClosesRepository) {
    super(organizationService, {
      label: 'Day close',
      repository,
      parseCreate: validateCreateDayClose,
      parseUpdate: refuseDayCloseUpdate,
      parseList: validateListDayClosesQuery,
      serialize: serializeDayClose,
      references: [
        { field: 'branch_id', table: branches, label: 'branch' },
        { field: 'opening_accepted_by_membership_id', table: memberships, label: 'team member' },
        { field: 'closed_by_membership_id', table: memberships, label: 'team member' },
      ],
      conflicts: {
        idx_day_closes_organization_branch_date: {
          key: 'errors:recordAlreadyExists',
          reason: 'record_already_exists',
        },
      },
      branchColumn: 'branch_id',
      transitions: {
        close: {
          from: [DAY_CLOSE_STATUS.OPEN],
          set: { status: DAY_CLOSE_STATUS.CLOSED },
          stamp: ['closed_at'],
          parse: validateCloseDayClose,
        },
        reopen: {
          from: [DAY_CLOSE_STATUS.CLOSED],
          set: { status: DAY_CLOSE_STATUS.OPEN },
          parse: validateReopenDayClose,
        },
      },
      ...createDayClosesRules(repository),
    });
  }
}
