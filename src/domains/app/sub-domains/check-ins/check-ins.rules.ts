import {
  type BaseRecordRow,
  listLinkedPublicIds,
  resolveRecordIds,
} from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { AppointmentsRepository } from '@/domains/app/sub-domains/appointments/appointments.repository.js';
import { OfferingSuggestionsRepository } from '@/domains/app/sub-domains/offering-suggestions/offering-suggestions.repository.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { TasksRepository } from '@/domains/app/sub-domains/tasks/tasks.repository.js';
import { TreatmentsRepository } from '@/domains/app/sub-domains/treatments/treatments.repository.js';
import { CHECK_IN_NEXT_OFFERINGS_LINK } from './check-ins.repository.js';

/** How soon a doctor calls back a patient who feels worse. */
const CALL_BACK_WITHIN_MILLISECONDS = 2 * 60 * 60 * 1000;
/** The plan card's source line for an offering a check-in suggested. */
const CHECK_IN_SOURCE_LABEL = 'Check-in';

const appointmentsRepository = new AppointmentsRepository();
const offeringSuggestionsRepository = new OfferingSuggestionsRepository();
const tasksRepository = new TasksRepository();
const treatmentsRepository = new TreatmentsRepository();

/** The doctor the check-in is about: its treatment's, else its appointment's, else none. */
async function doctorOf(row: BaseRecordRow): Promise<number | null> {
  if (typeof row.treatment_id === 'number') {
    const treatment = await treatmentsRepository.findById(row.treatment_id);
    if (typeof treatment?.doctor_membership_id === 'number') return treatment.doctor_membership_id;
  }
  if (typeof row.appointment_id === 'number') {
    const appointment = await appointmentsRepository.findById(row.appointment_id);
    if (typeof appointment?.doctor_membership_id === 'number') {
      return appointment.doctor_membership_id;
    }
  }
  return null;
}

/**
 * The check-ins rules (launch ROUTE #67, patient-file.6): a patient who feels worse gets a doctor
 * call-back task (Action needed); each next offering the check-in names becomes a planned
 * offering suggestion on the patient's plan.
 *
 * @remarks
 * - **Algorithm:** on create only, in the same transaction: a `worse` check-in inserts a high
 *   priority `callback` task (rule `call_back`) for the doctor of its treatment or appointment
 *   (else any doctor), due in two hours, sourced to the check-in; the linked `next_offering_ids`
 *   each insert a `planned` suggestion.
 * - **Side effects:** writes `app.tasks` and `app.offering_suggestions`.
 */
export const checkInsRules: BaseRecordRules = {
  afterWrite: async (row, change, context) => {
    if (change.kind !== 'create') return;
    const stamp = {
      organization_id: context.organizationId,
      created_by_user_id: context.userId,
      updated_by_user_id: context.userId,
    };
    if (row.feel === 'worse') {
      await tasksRepository.insert({
        ...stamp,
        kind: 'callback',
        rule_key: 'call_back',
        title: 'Call back — the patient feels worse',
        why: String(row.context),
        owner_membership_id: await doctorOf(row),
        owner_role: 'doctor',
        patient_id: row.patient_id,
        source_type: 'check_in',
        source_id: row.public_id,
        due_at: new Date(Date.now() + CALL_BACK_WITHIN_MILLISECONDS),
        priority: 'high',
      });
    }
    const linked = await listLinkedPublicIds({
      link: CHECK_IN_NEXT_OFFERINGS_LINK,
      ownerIds: [row.id],
    });
    const offeringIds = await resolveRecordIds({
      table: offerings,
      organizationId: context.organizationId,
      publicIds: linked.get(row.id) ?? [],
    });
    for (const offeringId of offeringIds.values()) {
      await offeringSuggestionsRepository.insert({
        ...stamp,
        patient_id: row.patient_id,
        offering_id: offeringId,
        source_label: CHECK_IN_SOURCE_LABEL,
        appointment_id: row.appointment_id,
        reason: row.next_plan,
      });
    }
  },
};
