import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import type { RoomsRepository } from './rooms.repository.js';
import { serializeRoom } from './rooms.serializer.js';
import type { RoomOutput } from './rooms.types.js';
import {
  validateCreateRoom,
  validateListRoomsQuery,
  validateUpdateRoom,
} from './rooms.validator.js';

/**
 * Rooms of the active organization (launch ROUTE #19): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Room')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class RoomsService extends BaseRecordService<RoomOutput> {
  constructor(organizationService: OrganizationService, repository: RoomsRepository) {
    super(organizationService, {
      label: 'Room',
      repository,
      parseCreate: validateCreateRoom,
      parseUpdate: validateUpdateRoom,
      parseList: validateListRoomsQuery,
      serialize: serializeRoom,
      references: [{ field: 'branch_id', table: branches, label: 'branch' }],
      parent: { field: 'branch_id', table: branches, label: 'Branch' },
      conflicts: {
        idx_rooms_branch_name_unique: 'errors:recordAlreadyExists',
      },
      branchColumn: 'branch_id',
    });
  }
}
