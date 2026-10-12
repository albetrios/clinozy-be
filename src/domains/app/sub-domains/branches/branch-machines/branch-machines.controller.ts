import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { BranchMachinesService } from './branch-machines.service.js';
import type { BranchMachineOutput } from './branch-machines.types.js';

/** HTTP handlers for the `machines` routes — {@link BaseRecordController} on {@link BranchMachinesService}. */
export class BranchMachinesController extends BaseRecordController<BranchMachineOutput> {
  constructor(service: BranchMachinesService) {
    super(service, { resource: 'machine', idParam: 'branch_machine_id', parentParam: 'branch_id' });
  }
}

/** The `machines` controller the routes register. */
export function createBranchMachinesController(
  service: BranchMachinesService,
): BranchMachinesController {
  return new BranchMachinesController(service);
}
