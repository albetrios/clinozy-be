import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { SavedViewsService } from './saved-views.service.js';
import type { SavedViewOutput } from './saved-views.types.js';

/** HTTP handlers for the `saved-views` routes — {@link BaseRecordController} on {@link SavedViewsService}. */
export class SavedViewsController extends BaseRecordController<SavedViewOutput> {
  constructor(service: SavedViewsService) {
    super(service, { resource: 'saved_view', idParam: 'saved_view_id' });
  }
}

/** The `saved-views` controller the routes register. */
export function createSavedViewsController(service: SavedViewsService): SavedViewsController {
  return new SavedViewsController(service);
}
