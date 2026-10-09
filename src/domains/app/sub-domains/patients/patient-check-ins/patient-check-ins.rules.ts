import { RECORD_LABEL_MAX } from '@/shared/constants/record-fields.constants.js';
import { resolveRecordIds, type BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { AppointmentsRepository } from '@/domains/app/sub-domains/appointments/appointments.repository.js';
import { TasksRepository } from '@/domains/app/sub-domains/tasks/tasks.repository.js';
import { openCallBackTask } from '@/domains/app/sub-domains/tasks/tasks.rule-tasks.js';
import { patientFileValueLabel } from '@/domains/app/sub-domains/patients/patients.constants.js';
import {
  assertAppointmentOfPatient,
  assertDateNotFuture,
  assertTreatmentOfPatient,
  organizationToday,
  shortCalendarDate,
  usualDoctorOf,
  writePatientFileActivity,
} from '@/domains/app/sub-domains/patients/patients.rules.js';
import {
  attachFeedbackActions,
  createLogFeedbackAction,
} from '@/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.rules.js';
import { PatientTreatmentsRepository } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.repository.js';
import {
  PATIENT_CHECK_IN_ACTION_SCORE_MAX,
  PATIENT_CHECK_IN_FEEL,
} from './patient-check-ins.constants.js';
import type { PatientCheckInsRepository } from './patient-check-ins.repository.js';
import { patient_check_ins } from './patient-check-ins.schema.js';

/** How soon a doctor calls back a patient who needs it (TR4). */
/** The longest server-filled context. */
const CONTEXT_MAX = RECORD_LABEL_MAX;

const appointmentsRepository = new AppointmentsRepository();
const tasksRepository = new TasksRepository();
const treatmentsRepository = new PatientTreatmentsRepository();

/** A check-in needs a call (TR9): feel `worse` or a score ≤ 4. */
function isCheckInFlagged(row: Readonly<Record<string, unknown>>): boolean {
  return (
    row.feel === PATIENT_CHECK_IN_FEEL.WORSE ||
    Number(row.score) <= PATIENT_CHECK_IN_ACTION_SCORE_MAX
  );
}

/** TR9: "After <treatment>" for a session's check-in, else "Visit · <date>". */
async function defaultContext(values: Record<string, unknown>): Promise<string> {
  if (typeof values.patient_treatment_id === 'number') {
    const treatment = await treatmentsRepository.findById(values.patient_treatment_id);
    if (treatment) return `After ${String(treatment.name)}`.slice(0, CONTEXT_MAX);
  }
  return `Visit · ${shortCalendarDate(String(values.check_in_date))}`;
}

/** The doctor a call-back goes to: the session's, else the visit's, else the usual doctor. */
async function doctorOfCheckIn(row: BaseRecordRow): Promise<number | null> {
  if (typeof row.patient_treatment_id === 'number') {
    const treatment = await treatmentsRepository.findById(row.patient_treatment_id);
    if (typeof treatment?.doctor_membership_id === 'number') return treatment.doctor_membership_id;
  }
  return doctorOfVisitOrPatient(row);
}

/** The visit's doctor, else the patient's usual doctor (a review's call-back, TR4). */
export async function doctorOfVisitOrPatient(row: BaseRecordRow): Promise<number | null> {
  if (typeof row.appointment_id === 'number') {
    const appointment = await appointmentsRepository.findById(row.appointment_id);
    if (typeof appointment?.doctor_membership_id === 'number') {
      return appointment.doctor_membership_id;
    }
  }
  return usualDoctorOf(row.patient_id as number);
}

/**
 * TR4 through the task rules (launch #138, TK4): a doctor call-back for a check-in or review that
 * needs action — the patient's contact and the visit's branch, one open per record.
 */
export async function createCallBackTask(options: {
  context: BaseRecordWriteContext;
  row: BaseRecordRow;
  link: 'patient_check_in_id' | 'patient_review_id';
  title: string;
  why: string;
  doctorMembershipId: number | null;
}): Promise<void> {
  const { context, row } = options;
  const record = await tasksRepository.findRecordContext({ link: options.link, id: row.id });
  await openCallBackTask({
    organizationId: context.organizationId,
    contactId: record?.contactId ?? null,
    link:
      options.link === 'patient_check_in_id'
        ? { patient_check_in_id: row.id }
        : { patient_review_id: row.id },
    doctorMembershipId: options.doctorMembershipId,
    branchId: record?.branchId ?? null,
    title: options.title,
    why: options.why,
    userId: context.userId,
  });
}

/** The links a check-in's write checks: the visit and the session are the patient's (TR3). */
async function assertLinks(values: Record<string, unknown>, patientId: number): Promise<void> {
  if ('appointment_id' in values) {
    await assertAppointmentOfPatient({ appointmentId: values.appointment_id, patientId });
  }
  if ('patient_treatment_id' in values) {
    await assertTreatmentOfPatient({ treatmentId: values.patient_treatment_id, patientId });
  }
}

/**
 * The check-in rules (launch ROUTE #134, routes-final 7.I): the date, the links, the server-filled
 * context, the call-back, the activity entry, and what a page reads — the trend, the plan, the
 * actions.
 *
 * @remarks
 * - **Algorithm:** `check_in_date` defaults to the organization's today and is never in the future;
 *   the visit and the session are the patient's (TR3); `context` is filled when not sent (TR9).
 *   After a create a `system` entry joins the contact's activity (TR5) and — feel `worse` or a score
 *   ≤ 4 — a doctor call-back task (TR4); an edit that turns that on adds one too. `decorate` adds
 *   `score_change` (the previous check-in), `next_offering_ids` (its plan rows, TR10), `actions` and
 *   `needs_action` (TR12) — one read each per page. The `actions` record action logs a feedback
 *   action.
 * - **Failure modes:** `ValidationError` on `check_in_date`, `appointment_id`,
 *   `patient_treatment_id`.
 */
export function createPatientCheckInsRules(repository: PatientCheckInsRepository): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      values.check_in_date ??= await organizationToday(context);
      await assertDateNotFuture({
        date: values.check_in_date,
        field: 'check_in_date',
        messageKey: 'errors:validation.patientCheckInDateFuture',
        context,
      });
      await assertLinks(values, values.patient_id as number);
      values.context ??= await defaultContext(values);
    },
    prepareUpdate: async (values, existing, context) => {
      await assertDateNotFuture({
        date: values.check_in_date,
        field: 'check_in_date',
        messageKey: 'errors:validation.patientCheckInDateFuture',
        context,
      });
      await assertLinks(values, existing.patient_id as number);
    },
    afterWrite: async (row, change, context) => {
      const turnedOn =
        isCheckInFlagged(row) &&
        (change.kind === 'create' ||
          (change.kind === 'update' && !isCheckInFlagged(change.before ?? {})));
      if (change.kind === 'create') {
        await writePatientFileActivity({
          context,
          patientId: row.patient_id as number,
          body: `Check-in logged: ${patientFileValueLabel(String(row.feel))}, score ${String(row.score)}/10`,
          link: { patient_check_in_id: row.id },
        });
      }
      if (!turnedOn) return;
      await createCallBackTask({
        context,
        row,
        link: 'patient_check_in_id',
        title: 'Call back — the patient needs it after a check-in',
        why: String(row.context),
        doctorMembershipId: await doctorOfCheckIn(row),
      });
    },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: patient_check_ins,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const ids = [...idsByPublicId.values()];
      const previousScores = await repository.findPreviousScores(ids);
      const planned = await repository.findNextOfferingIds(ids);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        const previous = id === undefined ? undefined : previousScores.get(id);
        output.score_change = previous === undefined ? null : Number(output.score) - previous;
        output.next_offering_ids = id === undefined ? [] : (planned.get(id) ?? []);
      }
      await attachFeedbackActions({
        outputs,
        column: 'patient_check_in_id',
        idsByPublicId,
        isFlagged: isCheckInFlagged,
      });
    },
    actions: { actions: createLogFeedbackAction('patient_check_in_id') },
  };
}
