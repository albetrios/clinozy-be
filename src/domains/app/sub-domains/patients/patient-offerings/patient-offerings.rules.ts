import { toText } from '@/shared/utils/validation/record-fields.util.js';
import { resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { InvoicesRepository } from '@/domains/app/sub-domains/billing/invoices/invoices.repository.js';
import { OfferingsRepository } from '@/domains/app/sub-domains/offerings/offerings.repository.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import { fieldValidationError, ForbiddenError } from '@/shared/errors/index.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { invoice_items } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { PATIENT_OFFERING_STATUS } from './patient-offerings.constants.js';

const invoicesRepository = new InvoicesRepository();
const offeringsRepository = new OfferingsRepository();

/**
 * B1-4: a `sessions_total` above the stored one adds sessions nobody paid for — only a holder of
 * `offering:update` (what a package gives and costs, O2) may; `payment:update` alone lowers it.
 */
async function assertSessionsRaiseAllowed({
  values,
  existing,
  context,
}: {
  values: Record<string, unknown>;
  existing: Record<string, unknown>;
  context: BaseRecordWriteContext;
}): Promise<void> {
  if (!(typeof values.sessions_total === 'number')) return;
  if (values.sessions_total <= Number(existing.sessions_total)) return;
  if (await context.can(APP_PERMISSIONS.OFFERING_UPDATE)) return;
  throw new ForbiddenError('errors:fieldNeedsPermission', {
    field: 'sessions_total',
    permission: APP_PERMISSIONS.OFFERING_UPDATE,
  }).withReason('field_permission_required');
}

/**
 * The patient offering rules (launch ROUTE #135, routes-final 7.L): a change keeps what was spent
 * and the bill's date; a page reads the offering's name and the expired status.
 *
 * @remarks
 * - **Algorithm:** `sessions_total` is never below `sessions_used` (PK6 — a refund lowers it to what
 *   was spent); raising it gives sessions nobody paid for, so it needs `offering:update` — the code
 *   that sets what a package gives and costs (O2) — beyond the route's `payment:update` (B1-4);
 *   `valid_until` is never before its invoice's date (through its line). `decorate`
 *   names each offering and its invoice (one read each per page) and marks one with a session left
 *   past `valid_until` (the organization's today) `expired` (PK5).
 * - **Failure modes:** `ValidationError` on `sessions_total`, `valid_until`; `ForbiddenError`
 *   `field_permission_required` for a raise without `offering:update`.
 */
export const patientOfferingsRules: BaseRecordRules = {
  prepareUpdate: async (values, existing, context) => {
    await assertSessionsRaiseAllowed({ values, existing, context });
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
    if (typeof values.valid_until !== 'string' || typeof existing.invoice_item_id !== 'number') {
      return;
    }
    const invoice = (await invoicesRepository.findInvoicesOfItems([existing.invoice_item_id])).get(
      existing.invoice_item_id,
    );
    if (invoice !== undefined && values.valid_until < invoice.invoice_date) {
      throw fieldValidationError({
        field: 'valid_until',
        messageKey: 'errors:validation.patientOfferingValidBeforeInvoice',
      });
    }
  },
  decorate: async (outputs, context) => {
    const summaries = await offeringsRepository.findSummaries(
      outputs.map((output) => String(output.offering_id)),
      context.organizationId,
    );
    const itemIds = await resolveRecordIds({
      table: invoice_items,
      organizationId: context.organizationId,
      publicIds: outputs.flatMap((output) =>
        output.invoice_item_id ? [toText(output.invoice_item_id)] : [],
      ),
    });
    const invoicesOfItems = await invoicesRepository.findInvoicesOfItems([...itemIds.values()]);
    const today = await organizationToday(context);
    for (const output of outputs) {
      output.offering_name = summaries.get(String(output.offering_id))?.name ?? '';
      const itemId = itemIds.get(String(output.invoice_item_id));
      output.invoice_id =
        itemId === undefined ? null : (invoicesOfItems.get(itemId)?.public_id ?? null);
      const isExpired = typeof output.valid_until === 'string' && output.valid_until < today;
      if (output.status === PATIENT_OFFERING_STATUS.ACTIVE && isExpired) {
        output.status = PATIENT_OFFERING_STATUS.EXPIRED;
      }
    }
  },
};
