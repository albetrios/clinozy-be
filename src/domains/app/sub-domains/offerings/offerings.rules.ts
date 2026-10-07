import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import type { OFFERING_CATEGORY_VALUES } from './offerings.constants.js';

/** The GST a consultation starts with — consultations are exempt (offerings rule). */
const CONSULTATION_GST_PERCENT = 0;
/** The GST every other offering (a procedure, package or product) starts with. */
const PROCEDURE_GST_PERCENT = 18;
/** The category that is a consultation. */
const CONSULTATION: (typeof OFFERING_CATEGORY_VALUES)[number] = 'consultation';

/**
 * The offerings rules (launch ROUTE #63, `operations.offerings`): a new offering without a GST
 * rate gets its category's — 0% for a consultation, 18% for a procedure.
 *
 * @remarks
 * - **Notes:** the list, offer and lowest prices are guarded by `price:manage` and the lowest
 *   price hidden without `lowest_price:read` in the controller (D18).
 */
export const offeringsRules: BaseRecordRules = {
  prepareCreate: (values) => {
    if (values.gst_percent === undefined) {
      values.gst_percent =
        (values.category ?? 'treatment') === CONSULTATION
          ? CONSULTATION_GST_PERCENT
          : PROCEDURE_GST_PERCENT;
    }
  },
};
