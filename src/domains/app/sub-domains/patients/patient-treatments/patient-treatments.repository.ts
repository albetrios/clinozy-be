import { eq, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { PATIENT_TREATMENT_STATUS } from './patient-treatments.constants.js';
import { patient_treatments } from './patient-treatments.schema.js';

/** The organization's calendar day a session was performed on (its time zone). */
function performedDay(organizationId: number) {
  const timezone = sql`(select ${organizations.timezone} from ${organizations} where ${organizations.id} = ${organizationId})`;
  return sql`(${patient_treatments.performed_at} at time zone ${timezone})::date`;
}

/**
 * Persistence for `app.patient_treatments` (launch ROUTE #134, routes-final 7.H) — the shared app
 * record reads and writes on its table (no soft delete — TR6), plus a patient's session count.
 *
 * @remarks
 * - **Algorithm:** `q` on the name; sorts `performed_at` (newest first) and `created_at`; derived
 *   filters `is_billed` (TR13 — the not-billed index) and the performed days, read in the
 *   organization's time zone, both ends inclusive.
 */
export class PatientTreatmentsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_treatments,
      entity: 'patientTreatment',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', performed_at: 'created_at' },
      derivedFilters: {
        is_billed: (value) =>
          value === true
            ? sql`${patient_treatments.patient_offering_id} is not null`
            : sql`(${patient_treatments.status} = ${PATIENT_TREATMENT_STATUS.DONE} and ${patient_treatments.offering_id} is not null and ${patient_treatments.patient_offering_id} is null)`,
        performed_from: (value, organizationId) =>
          sql`${performedDay(organizationId)} >= ${String(value)}::date`,
        performed_to: (value, organizationId) =>
          sql`${performedDay(organizationId)} <= ${String(value)}::date`,
      },
      defaultSort: 'performed_at',
      defaultOrder: 'desc',
    });
  }

  /** How many sessions the patient has — the first one converts the file (P4). */
  async countForPatient(patientId: number): Promise<number> {
    const rows = await getRequestDatabase()
      .select({ total: sql<number>`count(*)::int` })
      .from(patient_treatments)
      .where(eq(patient_treatments.patient_id, patientId));
    return rows[0]?.total ?? 0;
  }
}
