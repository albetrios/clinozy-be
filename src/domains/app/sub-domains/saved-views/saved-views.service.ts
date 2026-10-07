import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { SavedViewsRepository } from './saved-views.repository.js';
import { serializeSavedView } from './saved-views.serializer.js';
import type { SavedViewOutput } from './saved-views.types.js';
import {
  validateCreateSavedView,
  validateListSavedViewsQuery,
  validateUpdateSavedView,
} from './saved-views.validator.js';

/**
 * Saved views of the active organization (launch ROUTE #9): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Saved view')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class SavedViewsService extends BaseRecordService<SavedViewOutput> {
  constructor(organizationService: OrganizationService, repository: SavedViewsRepository) {
    super(organizationService, {
      label: 'Saved view',
      repository,
      parseCreate: validateCreateSavedView,
      parseUpdate: validateUpdateSavedView,
      parseList: validateListSavedViewsQuery,
      serialize: serializeSavedView,
      ownedByActor: true,
    });
  }
}
