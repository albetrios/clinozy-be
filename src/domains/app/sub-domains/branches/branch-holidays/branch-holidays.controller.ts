import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { BranchHolidaysService } from './branch-holidays.service.js';
import type { BranchHolidayOutput } from './branch-holidays.types.js';

/** HTTP handlers for the `branch-holidays` routes — {@link BaseRecordController} on {@link BranchHolidaysService}. */
export class BranchHolidaysController extends BaseRecordController<BranchHolidayOutput> {
  constructor(service: BranchHolidaysService) {
    super(service, {
      resource: 'branch_holiday',
      idParam: 'branch_holiday_id',
      parentParam: 'branch_id',
    });
  }
}

/** The `branch-holidays` controller the routes register. */
export function createBranchHolidaysController(
  service: BranchHolidaysService,
): BranchHolidaysController {
  return new BranchHolidaysController(service);
}
