import { resolveRecordIds } from '@/domains/app/base-record.repository.js';
import { requireConfirmedUploads } from '@/domains/app/base-record.service.js';
import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { patientFileValueLabel } from '@/domains/app/sub-domains/patients/patients.constants.js';
import {
  assertAppointmentOfPatient,
  assertDateNotFuture,
  organizationToday,
  writePatientFileActivity,
} from '@/domains/app/sub-domains/patients/patients.rules.js';
import {
  createCallBackTask,
  doctorOfVisitOrPatient,
} from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.rules.js';
import {
  attachFeedbackActions,
  createLogFeedbackAction,
} from '@/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.rules.js';
import { PATIENT_REVIEW_ACTION_RATING_MAX } from './patient-reviews.constants.js';
import { patient_reviews } from './patient-reviews.schema.js';

/** A review needs a call (TR11): a rating ≤ 3. */
function isReviewFlagged(row: Readonly<Record<string, unknown>>): boolean {
  return typeof row.rating === 'number' && row.rating <= PATIENT_REVIEW_ACTION_RATING_MAX;
}

/** The checks a review's write runs: the date, the visit, the files (TR11). */
async function assertReviewValues(
  values: Record<string, unknown>,
  patientId: number,
  context: Parameters<NonNullable<BaseRecordRules['prepareCreate']>>[1],
): Promise<void> {
  await assertDateNotFuture({
    date: values.review_date,
    field: 'review_date',
    messageKey: 'errors:validation.patientReviewDateFuture',
    context,
  });
  await assertAppointmentOfPatient({ appointmentId: values.appointment_id, patientId });
  if (Array.isArray(values.file_keys)) {
    await requireConfirmedUploads({
      fileKeys: values.file_keys as string[],
      field: 'file_keys',
      context,
    });
  }
}

/**
 * The review rules (launch ROUTE #134, routes-final 7.J): the date, the visit, the files, the
 * call-back, the activity entry, and the actions a page reads.
 *
 * @remarks
 * - **Algorithm:** `review_date` defaults to the organization's today and is never in the future;
 *   the visit is the patient's contact's; each `file_keys` entry a confirmed upload of the
 *   organization (TR11). After a create a `system` entry joins the contact's activity (7.10) and — a
 *   rating ≤ 3 — a doctor call-back task (TR4); an edit that turns that on adds one too. `decorate`
 *   adds `actions` and `needs_action` (TR12) — one read per page. The `actions` record action logs a
 *   feedback action.
 * - **Failure modes:** `ValidationError` on `review_date`, `appointment_id`, `file_keys`.
 */
export const patientReviewsRules: BaseRecordRules = {
  prepareCreate: async (values, context) => {
    values.review_date ??= await organizationToday(context);
    await assertReviewValues(values, values.patient_id as number, context);
  },
  prepareUpdate: async (values, existing, context) => {
    await assertReviewValues(values, existing.patient_id as number, context);
  },
  afterWrite: async (row, change, context) => {
    if (change.kind === 'create') {
      const rating = typeof row.rating === 'number' ? `, ${String(row.rating)}/5` : '';
      await writePatientFileActivity({
        context,
        patientId: row.patient_id as number,
        body: `Review logged: ${patientFileValueLabel(String(row.source))}${rating}`,
        link: { patient_review_id: row.id },
      });
    }
    const turnedOn =
      isReviewFlagged(row) &&
      (change.kind === 'create' ||
        (change.kind === 'update' && !isReviewFlagged(change.before ?? {})));
    if (!turnedOn) return;
    await createCallBackTask({
      context,
      row,
      link: 'patient_review_id',
      title: 'Call back — the patient left a low rating',
      why: `${patientFileValueLabel(String(row.source))} review, ${String(row.rating)}/5`,
      doctorMembershipId: await doctorOfVisitOrPatient(row),
    });
  },
  decorate: async (outputs, context) => {
    const idsByPublicId = await resolveRecordIds({
      table: patient_reviews,
      organizationId: context.organizationId,
      publicIds: outputs.map((output) => String(output.id)),
    });
    await attachFeedbackActions({
      outputs,
      column: 'patient_review_id',
      idsByPublicId,
      isFlagged: isReviewFlagged,
    });
  },
  actions: { actions: createLogFeedbackAction('patient_review_id') },
};
