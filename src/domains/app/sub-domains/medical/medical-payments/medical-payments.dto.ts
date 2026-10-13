import { listPaymentsQueryDto } from '@/domains/app/sub-domains/billing/payments/payments.dto.js';
import { listPendingCreditsQueryDto } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.dto.js';

/**
 * Query of the store's Payments tab and its CSV (11.I.8 #51, #53) — the ledger's own (8.C.8 #12):
 * the store's slice is the route's, never a query field (MD31).
 */
export const listMedicalPaymentsQueryDto = listPaymentsQueryDto;

/**
 * Query of the store's customer credits (11.I.8 #56) — the pending-credit list's own (8.D.8 #21):
 * the store's slice is the route's (D90).
 */
export const listMedicalPendingCreditsQueryDto = listPendingCreditsQueryDto;
