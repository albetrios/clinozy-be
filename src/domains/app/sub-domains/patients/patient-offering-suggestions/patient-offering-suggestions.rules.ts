import { toText } from '@/shared/utils/validation/record-fields.util.js';
import {
  findMembershipIdOfUser,
  resolveRecordIds,
  type BaseRecordRow,
} from '@/domains/app/base-record.repository.js';
import { InvoicesRepository } from '@/domains/app/sub-domains/billing/invoices/invoices.repository.js';
import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { OfferingsRepository } from '@/domains/app/sub-domains/offerings/offerings.repository.js';
import {
  assertAppointmentOfPatient,
  assertOfferingActive,
  shortCalendarDate,
} from '@/domains/app/sub-domains/patients/patients.rules.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import {
  PATIENT_OFFERING_SUGGESTION_HELD_STATUS_VALUES,
  PATIENT_OFFERING_SUGGESTION_STATUS,
} from './patient-offering-suggestions.constants.js';
import type {
  PatientOfferingSuggestionSources,
  PatientOfferingSuggestionsRepository,
} from './patient-offering-suggestions.repository.js';
import { patient_offering_suggestions } from './patient-offering-suggestions.schema.js';

const invoicesRepository = new InvoicesRepository();
const offeringsRepository = new OfferingsRepository();

/** Whether a status holds the offering in the plan (PK9). */
function isHeld(status: unknown): boolean {
  return (PATIENT_OFFERING_SUGGESTION_HELD_STATUS_VALUES as readonly unknown[]).includes(status);
}

/** PK8: where a plan row came from — the check-in, else the visit, else the patient file. */
function sourceLabel({
  output,
  sources,
}: {
  output: Readonly<Record<string, unknown>>;
  sources: PatientOfferingSuggestionSources;
}): string {
  const checkInDate = sources.checkInDates.get(String(output.patient_check_in_id));
  if (checkInDate !== undefined) return `Check-in · ${shortCalendarDate(checkInDate)}`;
  const visit = sources.visits.get(String(output.appointment_id));
  if (visit !== undefined) {
    return `Appt #${String(visit.appointment_number)} · ${visit.service_label}`;
  }
  return 'Patient file';
}

/**
 * The plan rules (launch ROUTE #135, routes-final 7.M): an active offering, the patient's visit,
 * who suggested it, no duplicates, and what a page reads — the offering's name, the label, the
 * lowest-price flag.
 *
 * @remarks
 * - **Algorithm:** a create checks the offering is active (O13, PK10) and the visit is the
 *   patient's contact's, records the caller's membership as `suggested_by_membership_id` (PK8), and
 *   refuses a second row holding the offering — planned, next time or accepted (PK9); a declined row
 *   is a record and never clashes. A change that moves a declined row back, and a restore of a held
 *   one, run the same check; an accepted row invoiced in full no longer holds it. A change never
 *   takes `quantity` below what is invoiced (PK7). `decorate` names the offering, derives
 *   `source_label`, flags a `price` below the offering's lowest price × quantity (warns, not
 *   blocks — PK9) and reads what live invoices' lines invoiced.
 * - **Failure modes:** `ValidationError` on `offering_id`, `appointment_id`, `quantity`;
 *   `ConflictError` `suggestion_exists`.
 */
export function createPatientOfferingSuggestionsRules(
  repository: PatientOfferingSuggestionsRepository,
): BaseRecordRules {
  /** PK9: no second live row holding the offering in the patient's plan. */
  async function assertNotInPlan({
    row,
    exceptId,
  }: {
    row: Readonly<Record<string, unknown>>;
    exceptId?: number | undefined;
  }) {
    const held = await repository.hasHeldRow({
      patientId: row.patient_id as number,
      offeringId: row.offering_id as number,
      ...(exceptId === undefined ? {} : { exceptId }),
    });
    if (held) {
      throw new ConflictError('errors:patientOfferingSuggestionExists').withReason(
        'suggestion_exists',
      );
    }
  }

  return {
    prepareCreate: async (values, context) => {
      await assertOfferingActive({ offeringId: values.offering_id });
      await assertAppointmentOfPatient({
        appointmentId: values.appointment_id,
        patientId: values.patient_id as number,
      });
      values.suggested_by_membership_id = await findMembershipIdOfUser({
        organizationId: context.organizationId,
        userId: context.userId,
      });
      if (isHeld(values.status ?? PATIENT_OFFERING_SUGGESTION_STATUS.PLANNED)) {
        await assertNotInPlan({ row: values });
      }
    },
    prepareUpdate: async (values, existing) => {
      if (typeof values.quantity === 'number') {
        const invoiced = (await invoicesRepository.findInvoicedQuantities([existing.id])).get(
          existing.id,
        );
        if (invoiced !== undefined && values.quantity < invoiced) {
          throw fieldValidationError({
            field: 'quantity',
            messageKey: 'errors:validation.patientOfferingSuggestionQuantityBelowInvoiced',
            messageParams: { invoiced },
          });
        }
      }
      if (!isHeld(existing.status) && isHeld(values.status)) {
        await assertNotInPlan({ row: existing, exceptId: existing.id });
      }
    },
    prepareRestore: async (deleted: BaseRecordRow) => {
      if (isHeld(deleted.status)) await assertNotInPlan({ row: deleted, exceptId: deleted.id });
    },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: patient_offering_suggestions,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const invoiced = await invoicesRepository.findInvoicedQuantities([...idsByPublicId.values()]);
      const summaries = await offeringsRepository.findSummaries(
        outputs.map((output) => String(output.offering_id)),
      );
      const sources = await repository.findSources({
        checkInPublicIds: outputs.flatMap((output) =>
          output.patient_check_in_id ? [toText(output.patient_check_in_id)] : [],
        ),
        appointmentPublicIds: outputs.flatMap((output) =>
          output.appointment_id ? [toText(output.appointment_id)] : [],
        ),
      });
      for (const output of outputs) {
        const offering = summaries.get(String(output.offering_id));
        output.offering_name = offering?.name ?? '';
        output.source_label = sourceLabel({ output, sources });
        output.is_below_lowest_price =
          typeof output.price === 'number' &&
          offering !== undefined &&
          output.price < offering.min_price * Number(output.quantity);
        const id = idsByPublicId.get(String(output.id));
        output.invoiced_quantity = id === undefined ? 0 : (invoiced.get(id) ?? 0);
        output.is_fully_invoiced = Number(output.invoiced_quantity) >= Number(output.quantity);
      }
    },
  };
}
