import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
  nullsLastSortKeys,
  organizationTodaySql,
} from '@/domains/app/base-record.repository.js';
import { manufacturers } from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.schema.js';
import { medical_rep_visits } from './medical-rep-visits/medical-rep-visits.schema.js';
import { medical_rep_manufacturers, medical_reps } from './medical-reps.schema.js';

/** An MR's `manufacturer_ids` ("Represents" — `app.medical_rep_manufacturers`, MD17). */
export const MEDICAL_REP_MANUFACTURERS_LINK: BaseRecordLinkTable = {
  table: medical_rep_manufacturers,
  ownerColumn: 'medical_rep_id',
  targetColumn: 'manufacturer_id',
  targetTable: manufacturers,
};

/** An MR's latest live visit (MD17). */
export interface MedicalRepLastVisitRow {
  visit_date: string;
  samples: string | null;
}

/**
 * Persistence for `app.medical_reps` (launch ROUTE #153, routes-final 11.F) — the shared app record
 * reads and writes, plus the latest visit and the brands a page shows.
 *
 * @remarks
 * - **Algorithm:** `q` on the name and phone; sorts `name` (A–Z, the default), `next_visit_on`
 *   (none last) and `created_at`; the derived filter `is_visit_overdue` (the next visit before the
 *   organization's today). A visit sets or clears the next visit in one statement (MD18).
 */
export class MedicalRepsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: medical_reps,
      entity: 'medicalRep',
      searchColumns: ['name', 'phone'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      sortKeys: {
        next_visit_on: {
          keys: nullsLastSortKeys({
            value: () => sql`${medical_reps.next_visit_on}`,
            sqlType: 'date',
            empty: sql`'2000-01-01'::date`,
            defaultOrder: 'asc',
          }),
          defaultOrder: 'asc',
        },
      },
      derivedFilters: {
        is_visit_overdue: (value, organizationId) => {
          const overdue = sql`${medical_reps.next_visit_on} < ${organizationTodaySql(organizationId)}`;
          return value === true ? overdue : sql`not coalesce(${overdue}, false)`;
        },
      },
      defaultSort: 'name',
      defaultOrder: 'asc',
    });
  }

  /** MD18: sets an MR's next visit (null clears it). */
  async setNextVisit(options: {
    id: number;
    nextVisitOn: string | null;
    userId: number | null;
  }): Promise<void> {
    await getRequestDatabase()
      .update(medical_reps)
      .set({
        next_visit_on: options.nextVisitOn,
        updated_at: sql`greatest(${medical_reps.created_at}, now())`,
        updated_by_user_id: options.userId,
      })
      .where(eq(medical_reps.id, options.id));
  }

  /** MD17: each MR's latest live visit (the visit date, then the newest). */
  async findLastVisits(repIds: readonly number[]): Promise<Map<number, MedicalRepLastVisitRow>> {
    if (repIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .selectDistinctOn([medical_rep_visits.medical_rep_id], {
        medical_rep_id: medical_rep_visits.medical_rep_id,
        visit_date: medical_rep_visits.visit_date,
        samples: medical_rep_visits.samples,
      })
      .from(medical_rep_visits)
      .where(
        and(
          inArray(medical_rep_visits.medical_rep_id, [...repIds]),
          isNull(medical_rep_visits.deleted_at),
        ),
      )
      .orderBy(
        medical_rep_visits.medical_rep_id,
        desc(medical_rep_visits.visit_date),
        desc(medical_rep_visits.id),
      );
    return new Map(rows.map(({ medical_rep_id, ...visit }) => [medical_rep_id, visit]));
  }

  /** Each MR's live manufacturers — `id`, `name`, `tone`, A–Z (11.F.6). */
  async findManufacturers(
    repIds: readonly number[],
  ): Promise<Map<number, { id: string; name: string; tone: string }[]>> {
    if (repIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        owner: medical_rep_manufacturers.medical_rep_id,
        id: manufacturers.public_id,
        name: manufacturers.name,
        tone: manufacturers.tone,
      })
      .from(medical_rep_manufacturers)
      .innerJoin(manufacturers, eq(manufacturers.id, medical_rep_manufacturers.manufacturer_id))
      .where(
        and(
          inArray(medical_rep_manufacturers.medical_rep_id, [...repIds]),
          isNull(manufacturers.deleted_at),
        ),
      )
      .orderBy(manufacturers.name, manufacturers.id);
    const byRep = new Map<number, { id: string; name: string; tone: string }[]>();
    for (const { owner, ...manufacturer } of rows) {
      const list = byRep.get(owner) ?? [];
      list.push(manufacturer);
      byRep.set(owner, list);
    }
    return byRep;
  }
}
