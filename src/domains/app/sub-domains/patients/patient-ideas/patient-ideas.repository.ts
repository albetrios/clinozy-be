import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import {
  assertWorkerDatabaseContext,
  getRequestDatabase,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import type { PostgresDatabaseHandle } from '@/infrastructure/database/utils/database-handle.types.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
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
import { patient_ideas } from './patient-ideas.schema.js';
import { concernLabels } from './patient-ideas.ai.js';
import {
  PATIENT_IDEAS_OFFERINGS_LIMIT,
  PATIENT_IDEAS_RENEW_SESSIONS_LEFT,
  PATIENT_IDEAS_SUMMARY_LIMIT,
  PATIENT_IDEAS_SWEEP_BATCH,
} from './patient-ideas.constants.js';
import type {
  IdeaOffering,
  PatientIdeasHistory,
  PatientIdeasSummary,
  StalePatient,
  StoredPatientIdea,
} from './patient-ideas.types.js';

/** A live patient file the ideas read from. */
export interface IdeasPatient {
  id: number;
  contactId: number;
  hasDataConsent: boolean;
}

/** One note the rules and the summary read. */
interface IdeasNote {
  kind: string;
  text: string;
  /** The diagnosis catalogue's name when the note links one. */
  catalogueName: string | null;
}

/**
 * The sweep's read (WC-47, PI5): the organizations after `afterId` with a live patient file whose
 * ideas are due a refresh, in id order, one batch.
 *
 * @remarks
 * - **Algorithm:** a keyset read of `tenancy.organizations` with an `EXISTS` on the patients' stale
 *   mark (its partial index) under the global retention cleanup context.
 * - **Failure modes:** `WorkerDatabaseContextError` outside that context.
 */
export async function findOrganizationsWithStaleIdeas(
  databaseHandle: WorkerDatabaseHandle,
  afterId: number,
): Promise<{ id: number; publicId: string }[]> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  return databaseHandle
    .select({ id: organizations.id, publicId: organizations.public_id })
    .from(organizations)
    .where(
      and(
        gt(organizations.id, afterId),
        isNull(organizations.deleted_at),
        sql`exists (select 1 from ${patients}
          where ${patients.organization_id} = ${organizations.id}
            and ${patients.ideas_stale_since} is not null
            and ${patients.deleted_at} is null)`,
      ),
    )
    .orderBy(asc(organizations.id))
    .limit(PATIENT_IDEAS_SWEEP_BATCH);
}

/**
 * Persistence of a patient's offering ideas (launch ROUTE #152, routes-final 7.N, D80): what the
 * prototype's rules and Claude's summary read of a patient, the clinic's active offerings, the
 * stored AI ideas and the stale mark.
 *
 * @remarks
 * - **Algorithm:** every read is scoped to one organization's rows (RLS and an explicit
 *   `organization_id`); the stored ideas are replaced as a whole; the stale mark is cleared only when
 *   it still holds the value the refresh read (compare-and-clear — a write meanwhile moved it).
 * - **Notes:** the routes read through the request's database; the worker builds it on its pinned
 *   handle ({@link createWorkerPatientIdeasRepository}).
 */
export class PatientIdeasRepository {
  constructor(private readonly database: () => PostgresDatabaseHandle = getRequestDatabase) {}

  /** The organization's internal id by its public id, or `null` when it is gone (a refresh job). */
  async findOrganizationId(organizationPublicId: string): Promise<number | null> {
    const [row] = await this.database()
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(eq(organizations.public_id, organizationPublicId), isNull(organizations.deleted_at)),
      )
      .limit(1);
    return row?.id ?? null;
  }

  /** A live patient file of the organization by its public id, or `null`. */
  async findPatient(organizationId: number, publicId: string): Promise<IdeasPatient | null> {
    const [row] = await this.database()
      .select({
        id: patients.id,
        contactId: patients.contact_id,
        hasDataConsent: patients.has_data_consent,
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

  /**
   * The de-identified summary Claude sees (PI6): the concerns the complaints name and the
   * diagnoses' catalogue names (an unlinked diagnosis by its concerns) — never a note's text —,
   * treatment names with their months, packages with sessions left, the completed visit count and
   * the plan's offering names: nothing that names or reaches the patient.
   */
  async findSummary(patient: IdeasPatient): Promise<PatientIdeasSummary> {
    const database = this.database();
    const notes = await this.findNotes(patient.id);
    const complaints = notes.filter((note) => note.kind === PATIENT_CLINICAL_NOTE_KIND.COMPLAINT);
    const diagnoses = notes.filter((note) => note.kind === PATIENT_CLINICAL_NOTE_KIND.DIAGNOSIS);
    const catalogueNames = diagnoses.flatMap((note) =>
      note.catalogueName === null ? [] : [note.catalogueName],
    );
    const treatments = await database
      .select({
        name: patient_treatments.name,
        month: sql<string>`to_char(${patient_treatments.performed_at}, 'YYYY-MM')`,
      })
      .from(patient_treatments)
      .where(
        and(
          eq(patient_treatments.patient_id, patient.id),
          eq(patient_treatments.status, PATIENT_TREATMENT_STATUS.DONE),
        ),
      )
      .orderBy(desc(patient_treatments.performed_at))
      .limit(PATIENT_IDEAS_SUMMARY_LIMIT);
    const packages = await database
      .select({
        offering: offerings.name,
        sessionsLeft: sql<number>`(${patient_offerings.sessions_total} - ${patient_offerings.sessions_used})::int`,
      })
      .from(patient_offerings)
      .innerJoin(offerings, eq(offerings.id, patient_offerings.offering_id))
      .where(
        and(eq(patient_offerings.patient_id, patient.id), isNull(patient_offerings.deleted_at)),
      )
      .orderBy(desc(patient_offerings.created_at))
      .limit(PATIENT_IDEAS_SUMMARY_LIMIT);
    const planned = await database
      .select({ name: offerings.name })
      .from(patient_offering_suggestions)
      .innerJoin(offerings, eq(offerings.id, patient_offering_suggestions.offering_id))
      .where(
        and(
          eq(patient_offering_suggestions.patient_id, patient.id),
          ne(patient_offering_suggestions.status, PATIENT_OFFERING_SUGGESTION_STATUS.DECLINED),
          isNull(patient_offering_suggestions.deleted_at),
        ),
      );
    return {
      complaints: concernLabels(complaints.map((note) => note.text)),
      diagnoses: [
        ...new Set([
          ...catalogueNames,
          ...concernLabels(
            diagnoses.filter((note) => note.catalogueName === null).map((note) => note.text),
          ),
        ]),
      ],
      treatments,
      packages: packages.map((row) => ({
        offering: row.offering,
        sessions_left: row.sessionsLeft,
      })),
      completed_visits: await this.countCompletedVisits(patient),
      already_planned: planned.map((row) => row.name),
    };
  }

  /** The stored AI ideas, in order. */
  async findStoredIdeas(patientId: number): Promise<StoredPatientIdea[]> {
    return this.database()
      .select({
        offeringId: patient_ideas.offering_id,
        reason: patient_ideas.reason,
        position: patient_ideas.position,
        createdAt: patient_ideas.created_at,
      })
      .from(patient_ideas)
      .where(eq(patient_ideas.patient_id, patientId))
      .orderBy(asc(patient_ideas.position));
  }

  /** Replaces the patient's stored ideas as a whole — none deletes them all. */
  async replaceIdeas(options: {
    organizationId: number;
    patientId: number;
    ideas: readonly { offeringId: number; reason: string }[];
  }): Promise<void> {
    const database = this.database();
    await database.delete(patient_ideas).where(eq(patient_ideas.patient_id, options.patientId));
    if (options.ideas.length === 0) return;
    await database.insert(patient_ideas).values(
      options.ideas.map((idea, index) => ({
        organization_id: options.organizationId,
        patient_id: options.patientId,
        offering_id: idea.offeringId,
        position: index + 1,
        reason: idea.reason,
      })),
    );
  }

  /** The organization's live files due a refresh, oldest mark first (PI5). */
  async findStalePatients(organizationId: number, limit: number): Promise<StalePatient[]> {
    return this.database()
      .select({
        id: patients.id,
        contactId: patients.contact_id,
        hasDataConsent: patients.has_data_consent,
        staleSince: sql<string>`to_char(${patients.ideas_stale_since} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(patients)
      .where(
        and(
          eq(patients.organization_id, organizationId),
          isNotNull(patients.ideas_stale_since),
          isNull(patients.deleted_at),
        ),
      )
      .orderBy(asc(patients.ideas_stale_since), asc(patients.id))
      .limit(limit);
  }

  /**
   * Clears the stale mark when it still holds `staleSince` (PI4) — a write meanwhile moved it, and
   * the next refresh takes the patient again. Answers whether it cleared. The mark is compared to
   * the microsecond, as {@link findStalePatients} read it (a JavaScript `Date` would drop them and
   * never match).
   */
  async clearStaleMark(options: { patientId: number; staleSince: string }): Promise<boolean> {
    const cleared = await this.database()
      .update(patients)
      .set({ ideas_stale_since: null })
      .where(
        and(
          eq(patients.id, options.patientId),
          sql`${patients.ideas_stale_since} = ${options.staleSince}::timestamptz`,
        ),
      )
      .returning({ id: patients.id });
    return cleared.length > 0;
  }

  /** The complaint, diagnosis and treatment-suggestion notes, newest first. */
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
      .limit(PATIENT_IDEAS_SUMMARY_LIMIT * 3);
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

/** Worker-only factory — a handle pinned to one organization's context (PI5). */
export function createWorkerPatientIdeasRepository(
  databaseHandle: WorkerDatabaseHandle,
): PatientIdeasRepository {
  assertWorkerDatabaseContext(['organization']);
  return new PatientIdeasRepository(() => databaseHandle);
}
