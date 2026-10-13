import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PaymentsService } from '@/domains/app/sub-domains/billing/payments/payments.service.js';
import type { PaymentOutput } from '@/domains/app/sub-domains/billing/payments/payments.types.js';
import type { PendingCreditsService } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.service.js';
import type { PendingCreditOutput } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.types.js';

/**
 * The store's Payments tab (MD22, MD31) — the payments ledger's list and CSV limited to the medical
 * store (`is_medical_store`), read with `medicine:read`.
 *
 * @remarks
 * - **Algorithm:** a {@link BaseRecordController} on the payments service whose every list and
 *   export adds the `is_medical_store` derived filter; the CSV is `medical-payments-YYYY-MM-DD.csv`.
 *   The writes stay on the ledger's own routes (8.C) with their codes (MD31).
 */
export function createMedicalPaymentsController(
  service: PaymentsService,
): BaseRecordController<PaymentOutput> {
  return new BaseRecordController<PaymentOutput>(service, {
    resource: 'payment',
    idParam: 'payment_id',
    readPermission: APP_PERMISSIONS.MEDICINE_READ,
    exportName: 'medical-payments',
    listDerived: { is_medical_store: true },
  });
}

/**
 * The store's customer credits — the Credits tab (MD32, D90): the pending-credits list limited to
 * the medical store (`is_medical_store`), read with `medicine:read`.
 *
 * @remarks
 * - **Algorithm:** a {@link BaseRecordController} on the pending-credits service whose every list
 *   adds the `is_medical_store` derived filter — a credit naming a `medical` invoice, or left by a
 *   return kept as store credit (MD33). Adding, settling, changing or deleting one are 8.D's own
 *   routes (`/pending-credits…`) with their codes.
 */
export function createMedicalPendingCreditsController(
  service: PendingCreditsService,
): BaseRecordController<PendingCreditOutput> {
  return new BaseRecordController<PendingCreditOutput>(service, {
    resource: 'pending_credit',
    idParam: 'pending_credit_id',
    readPermission: APP_PERMISSIONS.MEDICINE_READ,
    listDerived: { is_medical_store: true },
  });
}
