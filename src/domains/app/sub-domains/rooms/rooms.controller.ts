import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { RoomsService } from './rooms.service.js';
import type { RoomOutput } from './rooms.types.js';

/** HTTP handlers for the `rooms` routes — {@link BaseRecordController} on {@link RoomsService}. */
export class RoomsController extends BaseRecordController<RoomOutput> {
  constructor(service: RoomsService) {
    super(service, { resource: 'room', idParam: 'room_id', parentParam: 'branch_id' });
  }
}

/** The `rooms` controller the routes register. */
export function createRoomsController(service: RoomsService): RoomsController {
  return new RoomsController(service);
}
