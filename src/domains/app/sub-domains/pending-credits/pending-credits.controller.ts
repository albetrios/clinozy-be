import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PendingCreditsService } from './pending-credits.service.js';
import type { PendingCreditOutput } from './pending-credits.types.js';

/** HTTP handlers for the `pending-credits` routes — {@link BaseRecordController} on {@link PendingCreditsService}. */
export class PendingCreditsController extends BaseRecordController<PendingCreditOutput> {
  constructor(service: PendingCreditsService) {
    super(service, { resource: 'pending_credit', idParam: 'pending_credit_id' });
  }
}

/** The `pending-credits` controller the routes register. */
export function createPendingCreditsController(
  service: PendingCreditsService,
): PendingCreditsController {
  return new PendingCreditsController(service);
}
