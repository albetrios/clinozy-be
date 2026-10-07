import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { MachinesService } from './machines.service.js';
import type { MachineOutput } from './machines.types.js';

/** HTTP handlers for the `machines` routes — {@link BaseRecordController} on {@link MachinesService}. */
export class MachinesController extends BaseRecordController<MachineOutput> {
  constructor(service: MachinesService) {
    super(service, { resource: 'machine', idParam: 'machine_id', parentParam: 'branch_id' });
  }
}

/** The `machines` controller the routes register. */
export function createMachinesController(service: MachinesService): MachinesController {
  return new MachinesController(service);
}
