import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { InvoicesRepository } from '@/domains/app/sub-domains/invoices/invoices.repository.js';
import { OfferingsRepository } from '@/domains/app/sub-domains/offerings/offerings.repository.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import { fieldValidationError } from '@/shared/errors/index.js';
import { PATIENT_OFFERING_STATUS } from './patient-offerings.constants.js';

const invoicesRepository = new InvoicesRepository();
const offeringsRepository = new OfferingsRepository();

/**
 * The patient offering rules (launch ROUTE #135, routes-final 7.L): a change keeps what was spent
 * and the bill's date; a page reads the offering's name and the expired status.
 *
 * @remarks
 * - **Algorithm:** `sessions_total` is never below `sessions_used` (PK6 — a refund lowers it to what
 *   was spent); `valid_until` is never before its invoice's date. `decorate` names each offering
 *   (one read per page) and marks one with a session left past `valid_until` (the organization's
 *   today) `expired` (PK5).
 * - **Failure modes:** `ValidationError` on `sessions_total`, `valid_until`.
 */
export const patientOfferingsRules: BaseRecordRules = {
  prepareUpdate: async (values, existing) => {
    if (
      typeof values.sessions_total === 'number' &&
      values.sessions_total < Number(existing.sessions_used)
    ) {
      throw fieldValidationError({
        field: 'sessions_total',
        messageKey: 'errors:validation.patientOfferingSessionsBelowUsed',
        messageParams: { used: Number(existing.sessions_used) },
      });
    }
    if (typeof values.valid_until !== 'string' || typeof existing.invoice_id !== 'number') return;
    const invoice = await invoicesRepository.findById(existing.invoice_id);
    if (typeof invoice?.invoice_date === 'string' && values.valid_until < invoice.invoice_date) {
      throw fieldValidationError({
        field: 'valid_until',
        messageKey: 'errors:validation.patientOfferingValidBeforeInvoice',
      });
    }
  },
  decorate: async (outputs, context) => {
    const summaries = await offeringsRepository.findSummaries(
      outputs.map((output) => String(output.offering_id)),
    );
    const today = await organizationToday(context);
    for (const output of outputs) {
      output.offering_name = summaries.get(String(output.offering_id))?.name ?? '';
      const isExpired = typeof output.valid_until === 'string' && output.valid_until < today;
      if (output.status === PATIENT_OFFERING_STATUS.ACTIVE && isExpired) {
        output.status = PATIENT_OFFERING_STATUS.EXPIRED;
      }
    }
  },
};
