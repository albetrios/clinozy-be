import { resolveRecordIds, type BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { PatientOfferingsRepository } from '@/domains/app/sub-domains/patients/patient-offerings/patient-offerings.repository.js';
import { PATIENT_CONVERSION } from '@/domains/app/sub-domains/patients/patients.constants.js';
import { PatientsRepository } from '@/domains/app/sub-domains/patients/patients.repository.js';
import {
  assertAppointmentOfPatient,
  assertOfferingActive,
  organizationToday,
  writePatientFileActivity,
} from '@/domains/app/sub-domains/patients/patients.rules.js';
import { PatientCheckInsRepository } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.repository.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { PATIENT_TREATMENT_STATUS } from './patient-treatments.constants.js';
import type { PatientTreatmentsRepository } from './patient-treatments.repository.js';
import { patient_treatments } from './patient-treatments.schema.js';

const checkInsRepository = new PatientCheckInsRepository();
const patientOfferingsRepository = new PatientOfferingsRepository();
const patientsRepository = new PatientsRepository();

/** The reverse action (TR6). */
const REVERSE = 'reverse';

/** A session is never in the future (TR8) — else a 400 on `performed_at`. */
function assertPerformedNotFuture(performedAt: unknown): void {
  if (performedAt instanceof Date && performedAt.getTime() > Date.now()) {
    throw fieldValidationError({
      field: 'performed_at',
      messageKey: 'errors:validation.patientTreatmentPerformedFuture',
    });
  }
}

/**
 * TR7: spends one session of the bought offering the create names — the patient's, for the same
 * offering, not past `valid_until` (the organization's today), with a session left — in one guarded
 * `sessions_used + 1`; the session takes its offering and its new count.
 */
async function spendBoughtSession(
  values: Record<string, unknown>,
  context: BaseRecordWriteContext,
): Promise<void> {
  if (typeof values.patient_offering_id !== 'number') return;
  const bought = await patientOfferingsRepository.findById(values.patient_offering_id);
  if (!bought || bought.patient_id !== values.patient_id) {
    throw fieldValidationError({
      field: 'patient_offering_id',
      messageKey: 'errors:validation.patientOfferingOtherPatient',
    });
  }
  if (typeof values.offering_id === 'number' && values.offering_id !== bought.offering_id) {
    throw fieldValidationError({
      field: 'patient_offering_id',
      messageKey: 'errors:validation.patientOfferingOtherOffering',
    });
  }
  if (
    typeof bought.valid_until === 'string' &&
    bought.valid_until < (await organizationToday(context))
  ) {
    throw new ConflictError('errors:offeringExpired').withReason('offering_expired');
  }
  const spent = await patientOfferingsRepository.adjust({
    id: bought.id,
    column: 'sessions_used',
    delta: 1,
    ceilingColumn: 'sessions_total',
    userId: context.userId,
  });
  if (!spent) throw new ConflictError('errors:offeringUsedUp').withReason('offering_used_up');
  values.offering_id = bought.offering_id;
  values.session_number = spent.sessions_used;
}

/** TR7: a linked session keeps its number and its offering — reverse it and record it again. */
function assertLinkedFieldsKept(values: Record<string, unknown>, existing: BaseRecordRow): void {
  if (typeof existing.patient_offering_id !== 'number') return;
  if ('session_number' in values) {
    throw fieldValidationError({
      field: 'session_number',
      messageKey: 'errors:validation.patientTreatmentLinkedFixed',
    });
  }
  if ('offering_id' in values && values.offering_id !== existing.offering_id) {
    throw fieldValidationError({
      field: 'offering_id',
      messageKey: 'errors:validation.patientTreatmentLinkedFixed',
    });
  }
}

/**
 * TR6: a reverse gives the spent session back through the `RESTRICT` link — never a silent miss —
 * and clears the link in the same write.
 */
async function giveBoughtSessionBack(
  values: Record<string, unknown>,
  existing: BaseRecordRow,
  context: BaseRecordWriteContext,
): Promise<void> {
  if (typeof existing.patient_offering_id !== 'number') return;
  const returned = await patientOfferingsRepository.adjust({
    id: existing.patient_offering_id,
    column: 'sessions_used',
    delta: -1,
    userId: context.userId,
  });
  if (!returned) {
    throw new Error(
      `The bought offering ${existing.patient_offering_id} of a session could not take it back`,
    );
  }
  values.patient_offering_id = null;
}

/** P4: the patient's first session converts the file (it stays editable). */
async function convertOnFirstSession(
  repository: PatientTreatmentsRepository,
  row: BaseRecordRow,
  context: BaseRecordWriteContext,
): Promise<void> {
  const patientId = row.patient_id as number;
  if ((await repository.countForPatient(patientId)) !== 1) return;
  await patientsRepository.update(
    patientId,
    { conversion: PATIENT_CONVERSION.CONVERTED },
    context.userId,
  );
}

/**
 * The treatment rules (launch ROUTE #134, routes-final 7.H): the session's checks, spending and
 * giving back a bought session, the reverse, the file's conversion, the activity entries and the
 * latest check-in a page reads.
 *
 * @remarks
 * - **Algorithm:** a create checks `performed_at` (not in the future), the visit (the patient's,
 *   checked in or completed), a sent offering (active, O13), then spends one session of
 *   `patient_offering_id` (TR7) — its offering and count become the session's. An update refuses a
 *   reversed session and a linked session's `session_number` / `offering_id`. A reverse gives the
 *   session back and clears the link (TR6). After a create the patient's first session converts the
 *   file (P4); a create and a reverse write a `system` entry into the contact's activity (7.10).
 *   `decorate` adds `latest_check_in` — one read per page.
 * - **Failure modes:** `ValidationError` on `performed_at`, `appointment_id`, `offering_id`,
 *   `patient_offering_id`, `session_number`; `ConflictError` `offering_expired`,
 *   `offering_used_up`, `treatment_reversed`.
 */
export function createPatientTreatmentsRules(
  repository: PatientTreatmentsRepository,
): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      assertPerformedNotFuture(values.performed_at);
      await assertAppointmentOfPatient({
        appointmentId: values.appointment_id,
        patientId: values.patient_id as number,
        requireVisit: true,
      });
      await assertOfferingActive(values.offering_id);
      await spendBoughtSession(values, context);
    },
    prepareUpdate: async (values, existing) => {
      if (existing.status === PATIENT_TREATMENT_STATUS.REVERSED) {
        throw new ConflictError('errors:treatmentReversed').withReason('treatment_reversed');
      }
      assertLinkedFieldsKept(values, existing);
      assertPerformedNotFuture(values.performed_at);
      await assertAppointmentOfPatient({
        appointmentId: values.appointment_id,
        patientId: existing.patient_id as number,
        requireVisit: true,
      });
      if (values.offering_id !== existing.offering_id) {
        await assertOfferingActive(values.offering_id);
      }
    },
    prepareTransition: async (action, values, existing, context) => {
      if (action === REVERSE) await giveBoughtSessionBack(values, existing, context);
    },
    afterWrite: async (row, change, context) => {
      const patientId = row.patient_id as number;
      const link = { patient_treatment_id: row.id };
      if (change.kind === 'create') {
        await convertOnFirstSession(repository, row, context);
        await writePatientFileActivity({
          context,
          patientId,
          body: `Treatment recorded: ${String(row.name)}`,
          link,
        });
      }
      if (change.kind === 'transition' && change.action === REVERSE) {
        await writePatientFileActivity({
          context,
          patientId,
          body: `Treatment reversed: ${String(row.name)} — ${String(row.reversed_reason)}`,
          link,
        });
      }
    },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: patient_treatments,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const latest = await checkInsRepository.findLatestForTreatments([...idsByPublicId.values()]);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        output.latest_check_in = (id === undefined ? undefined : latest.get(id)) ?? null;
      }
    },
  };
}
