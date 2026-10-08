import { eq, sql, type SQL } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository, nullsLastSortKeys } from '@/domains/app/base-record.repository.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { PATIENT_OFFERING_STATUS } from './patient-offerings.constants.js';
import { patient_offerings } from './patient-offerings.schema.js';

/** The organization's today (its time zone) in SQL. */
function organizationToday(organizationId: number): SQL {
  const timezone = sql`(select ${organizations.timezone} from ${organizations} where ${organizations.id} = ${organizationId})`;
  return sql`(now() at time zone ${timezone})::date`;
}

/** Each derived status as a condition (PK5) — used up first, then expired, else active. */
function statusCondition(status: string, organizationId: number): SQL {
  const usedUp = sql`${patient_offerings.sessions_used} >= ${patient_offerings.sessions_total}`;
  const expired = sql`${patient_offerings.valid_until} < ${organizationToday(organizationId)}`;
  if (status === PATIENT_OFFERING_STATUS.USED_UP) return usedUp;
  if (status === PATIENT_OFFERING_STATUS.EXPIRED) return sql`(not (${usedUp}) and ${expired})`;
  return sql`(not (${usedUp}) and not coalesce(${expired}, false))`;
}

/**
 * Persistence for `app.patient_offerings` (launch ROUTE #135, routes-final 7.L) — the shared app
 * record reads and writes on its table.
 *
 * @remarks
 * - **Algorithm:** sorts `created_at` (newest first) and `valid_until` (no expiry last, either
 *   order); derived filters `status` (several — `active`, `used_up`, `expired`, today in the
 *   organization's time zone) and `is_package` (more than one session).
 */
export class PatientOfferingsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_offerings,
      entity: 'patientOffering',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        created_at: { keys: [{ value: 'created_at' }], defaultOrder: 'desc' },
        valid_until: {
          keys: nullsLastSortKeys({
            value: () => sql`${patient_offerings.valid_until}`,
            sqlType: 'date',
            empty: sql`'infinity'::date`,
            defaultOrder: 'asc',
          }),
          defaultOrder: 'asc',
        },
      },
      derivedFilters: {
        status: (value, organizationId) =>
          sql`(${sql.join(
            (value as string[]).map((status) => statusCondition(status, organizationId)),
            sql` or `,
          )})`,
        is_package: (value) =>
          value === true
            ? sql`${patient_offerings.sessions_total} > 1`
            : sql`${patient_offerings.sessions_total} = 1`,
      },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }

  /** Removes a patient offering whose line no longer sells sessions (nothing spent — PK4, B12). */
  async deleteById(id: number): Promise<void> {
    await getRequestDatabase().delete(patient_offerings).where(eq(patient_offerings.id, id));
  }
}
