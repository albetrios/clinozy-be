import { and, asc, count, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import type { PostgresDatabaseHandle } from '@/infrastructure/database/utils/database-handle.types.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { APPOINTMENT_STATUS } from '@/domains/app/sub-domains/appointments/appointments.constants.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { patient_clinical_notes } from '@/domains/app/sub-domains/patients/patient-clinical-notes/patient-clinical-notes.schema.js';
import { PATIENT_CLINICAL_NOTE_KIND } from '@/domains/app/sub-domains/patients/patient-clinical-notes/patient-clinical-notes.constants.js';
import { patient_diagnoses } from '@/domains/app/sub-domains/patients/patient-diagnoses/patient-diagnoses.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { PATIENT_TREATMENT_STATUS } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.constants.js';
import { patient_offerings } from '@/domains/app/sub-domains/patients/patient-offerings/patient-offerings.schema.js';
import { patient_offering_suggestions } from '@/domains/app/sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.schema.js';
import { PATIENT_OFFERING_SUGGESTION_STATUS } from '@/domains/app/sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.constants.js';
import {
  PATIENT_IDEAS_NOTES_LIMIT,
  PATIENT_IDEAS_OFFERINGS_LIMIT,
  PATIENT_IDEAS_RENEW_SESSIONS_LEFT,
} from './patient-ideas.constants.js';
import type { IdeaOffering, PatientIdeasHistory } from './patient-ideas.types.js';

/** A live patient file the ideas read from. */
export interface IdeasPatient {
  id: number;
  contactId: number;
}

/** One note the rules read. */
interface IdeasNote {
  kind: string;
  text: string;
  /** The diagnosis catalogue's name when the note links one. */
  catalogueName: string | null;
}

/**
 * Persistence of a patient's offering ideas (launch ROUTE #152, routes-final 7.N): what the
 * prototype's rules read of a patient and the clinic's active offerings.
 *
 * @remarks
 * - **Algorithm:** every read is scoped to one organization's rows (RLS and an explicit
 *   `organization_id`).
 * - **Notes:** reads only, through the request's database.
 */
export class PatientIdeasRepository {
  constructor(private readonly database: () => PostgresDatabaseHandle = getRequestDatabase) {}

  /** A live patient file of the organization by its public id, or `null`. */
  async findPatient(organizationId: number, publicId: string): Promise<IdeasPatient | null> {
    const [row] = await this.database()
      .select({
        id: patients.id,
        contactId: patients.contact_id,
      })
      .from(patients)
      .where(
        and(
          eq(patients.organization_id, organizationId),
          eq(patients.public_id, publicId),
          isNull(patients.deleted_at),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** The organization's active offerings, in catalogue order — what an idea can name. */
  async findActiveOfferings(organizationId: number): Promise<IdeaOffering[]> {
    return this.database()
      .select({
        id: offerings.id,
        publicId: offerings.public_id,
        name: offerings.name,
        category: offerings.category,
        sessions: offerings.sessions,
        price: offerings.price,
      })
      .from(offerings)
      .where(
        and(
          eq(offerings.organization_id, organizationId),
          eq(offerings.is_active, true),
          isNull(offerings.deleted_at),
        ),
      )
      .orderBy(asc(offerings.offering_number))
      .limit(PATIENT_IDEAS_OFFERINGS_LIMIT);
  }

  /** The offerings already in the patient's plan (any status but declined) — never an idea. */
  async findPlannedOfferingIds(patientId: number): Promise<number[]> {
    const rows = await this.database()
      .select({ offeringId: patient_offering_suggestions.offering_id })
      .from(patient_offering_suggestions)
      .where(
        and(
          eq(patient_offering_suggestions.patient_id, patientId),
          ne(patient_offering_suggestions.status, PATIENT_OFFERING_SUGGESTION_STATUS.DECLINED),
          isNull(patient_offering_suggestions.deleted_at),
        ),
      );
    return rows.map((row) => row.offeringId);
  }

  /** What the prototype's rules read of the patient (PI1). */
  async findHistory(patient: IdeasPatient): Promise<PatientIdeasHistory> {
    const notes = await this.findNotes(patient.id);
    const textsOf = (kind: string) =>
      notes.filter((note) => note.kind === kind).map((note) => note.catalogueName ?? note.text);
    const [visits, treatments, lastTreatment, lastVisit, packages] = await Promise.all([
      this.countCompletedVisits(patient),
      this.countDoneTreatments(patient.id),
      this.findLastTreatmentName(patient.id),
      this.findLastVisitService(patient),
      this.findPackagesAlmostUsed(patient.id),
    ]);
    return {
      treatmentSuggestions: textsOf(PATIENT_CLINICAL_NOTE_KIND.TREATMENT_SUGGESTION),
      complaints: textsOf(PATIENT_CLINICAL_NOTE_KIND.COMPLAINT),
      diagnoses: textsOf(PATIENT_CLINICAL_NOTE_KIND.DIAGNOSIS),
      visitCount: visits + treatments,
      lastServiceName: lastTreatment ?? lastVisit,
      packagesAlmostUsedOfferingIds: packages,
    };
  }

  private async findNotes(patientId: number): Promise<IdeasNote[]> {
    return this.database()
      .select({
        kind: patient_clinical_notes.kind,
        text: patient_clinical_notes.text,
        catalogueName: patient_diagnoses.name,
      })
      .from(patient_clinical_notes)
      .leftJoin(
        patient_diagnoses,
        eq(patient_diagnoses.id, patient_clinical_notes.patient_diagnosis_id),
      )
      .where(
        and(
          eq(patient_clinical_notes.patient_id, patientId),
          inArray(patient_clinical_notes.kind, [
            PATIENT_CLINICAL_NOTE_KIND.COMPLAINT,
            PATIENT_CLINICAL_NOTE_KIND.DIAGNOSIS,
            PATIENT_CLINICAL_NOTE_KIND.TREATMENT_SUGGESTION,
          ]),
          isNull(patient_clinical_notes.deleted_at),
        ),
      )
      .orderBy(desc(patient_clinical_notes.created_at), desc(patient_clinical_notes.id))
      .limit(PATIENT_IDEAS_NOTES_LIMIT);
  }

  /** The contact's completed visits. */
  private async countCompletedVisits(patient: IdeasPatient): Promise<number> {
    const [row] = await this.database()
      .select({ total: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.contact_id, patient.contactId),
          eq(appointments.status, APPOINTMENT_STATUS.COMPLETED),
          isNull(appointments.deleted_at),
        ),
      );
    return Number(row?.total ?? 0);
  }

  /** The patient's done treatments. */
  private async countDoneTreatments(patientId: number): Promise<number> {
    const [row] = await this.database()
      .select({ total: count() })
      .from(patient_treatments)
      .where(
        and(
          eq(patient_treatments.patient_id, patientId),
          eq(patient_treatments.status, PATIENT_TREATMENT_STATUS.DONE),
        ),
      );
    return Number(row?.total ?? 0);
  }

  /** The latest done treatment's name. */
  private async findLastTreatmentName(patientId: number): Promise<string | null> {
    const [row] = await this.database()
      .select({ name: patient_treatments.name })
      .from(patient_treatments)
      .where(
        and(
          eq(patient_treatments.patient_id, patientId),
          eq(patient_treatments.status, PATIENT_TREATMENT_STATUS.DONE),
        ),
      )
      .orderBy(desc(patient_treatments.performed_at), desc(patient_treatments.id))
      .limit(1);
    return row?.name ?? null;
  }

  /** The latest completed visit's service. */
  private async findLastVisitService(patient: IdeasPatient): Promise<string | null> {
    const [row] = await this.database()
      .select({ service: appointments.service_label })
      .from(appointments)
      .where(
        and(
          eq(appointments.contact_id, patient.contactId),
          eq(appointments.status, APPOINTMENT_STATUS.COMPLETED),
          isNull(appointments.deleted_at),
        ),
      )
      .orderBy(desc(appointments.appointment_date), desc(appointments.start_time))
      .limit(1);
    return row?.service ?? null;
  }

  /** The offerings of the patient's live packages with at most one session left. */
  private async findPackagesAlmostUsed(patientId: number): Promise<number[]> {
    const rows = await this.database()
      .select({ offeringId: patient_offerings.offering_id })
      .from(patient_offerings)
      .where(
        and(
          eq(patient_offerings.patient_id, patientId),
          isNull(patient_offerings.deleted_at),
          gt(patient_offerings.sessions_total, 1),
          sql`${patient_offerings.sessions_total} - ${patient_offerings.sessions_used} <= ${PATIENT_IDEAS_RENEW_SESSIONS_LEFT}`,
        ),
      )
      .orderBy(desc(patient_offerings.created_at));
    return [...new Set(rows.map((row) => row.offeringId))];
  }
}
