import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { BranchRoomsService } from './branch-rooms.service.js';
import type { BranchRoomOutput } from './branch-rooms.types.js';

/** HTTP handlers for the `rooms` routes — {@link BaseRecordController} on {@link BranchRoomsService}. */
export class BranchRoomsController extends BaseRecordController<BranchRoomOutput> {
  constructor(service: BranchRoomsService) {
    super(service, { resource: 'room', idParam: 'branch_room_id', parentParam: 'branch_id' });
  }
}

/** The `rooms` controller the routes register. */
export function createBranchRoomsController(service: BranchRoomsService): BranchRoomsController {
  return new BranchRoomsController(service);
}
