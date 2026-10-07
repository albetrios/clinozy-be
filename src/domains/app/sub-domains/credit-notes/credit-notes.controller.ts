import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { CreditNotesService } from './credit-notes.service.js';
import type { CreditNoteOutput } from './credit-notes.types.js';

/** HTTP handlers for the `credit-notes` routes — {@link BaseRecordController} on {@link CreditNotesService}. */
export class CreditNotesController extends BaseRecordController<CreditNoteOutput> {
  constructor(service: CreditNotesService) {
    super(service, { resource: 'credit_note', idParam: 'credit_note_id' });
  }
}

/** The `credit-notes` controller the routes register. */
export function createCreditNotesController(service: CreditNotesService): CreditNotesController {
  return new CreditNotesController(service);
}
