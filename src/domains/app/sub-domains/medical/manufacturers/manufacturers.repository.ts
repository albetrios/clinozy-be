import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import {
  medical_rep_manufacturers,
  medical_reps,
} from '@/domains/app/sub-domains/medical/medical-reps/medical-reps.schema.js';
import { medicines } from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import {
  supplier_manufacturers,
  suppliers,
} from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';
import type { ManufacturerLinkOutput } from './manufacturers.types.js';
import { manufacturers } from './manufacturers.schema.js';

/** A manufacturer's `supplier_ids` (`app.supplier_manufacturers`, MD9). */
export const MANUFACTURER_SUPPLIERS_LINK: BaseRecordLinkTable = {
  table: supplier_manufacturers,
  ownerColumn: 'manufacturer_id',
  targetColumn: 'supplier_id',
  targetTable: suppliers,
};

/** A manufacturer's `medical_rep_ids` (`app.medical_rep_manufacturers`, MD9). */
export const MANUFACTURER_MEDICAL_REPS_LINK: BaseRecordLinkTable = {
  table: medical_rep_manufacturers,
  ownerColumn: 'manufacturer_id',
  targetColumn: 'medical_rep_id',
  targetTable: medical_reps,
};

/** Each manufacturer's linked live records, by manufacturer id. */
type LinkedRecords = Map<number, ManufacturerLinkOutput[]>;

/** Groups `{ owner, id, name }` rows by owner. */
function groupLinks(rows: readonly { owner: number; id: string; name: string }[]): LinkedRecords {
  const byOwner: LinkedRecords = new Map();
  for (const row of rows) {
    const list = byOwner.get(row.owner) ?? [];
    list.push({ id: row.id, name: row.name });
    byOwner.set(row.owner, list);
  }
  return byOwner;
}

/**
 * Persistence for `app.manufacturers` (launch ROUTE #153, routes-final 11.A) — the shared app
 * record reads and writes, plus what a page reads beside the row.
 *
 * @remarks
 * - **Algorithm:** `q` on the name; sorts `name` (A–Z first, the default) and `created_at`. The
 *   medicine count and the linked suppliers and MRs are one grouped read each, live rows only.
 */
export class ManufacturersRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: manufacturers,
      entity: 'manufacturer',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'name',
      defaultOrder: 'asc',
    });
  }

  /** MD9: the tone of the organization's latest manufacturer — a quick one takes the next. */
  async findLastTone(organizationId: number): Promise<string | null> {
    const rows = await getRequestDatabase()
      .select({ tone: manufacturers.tone })
      .from(manufacturers)
      .where(eq(manufacturers.organization_id, organizationId))
      .orderBy(desc(manufacturers.created_at), desc(manufacturers.id))
      .limit(1);
    return rows[0]?.tone ?? null;
  }

  /** MD9: how many live medicines each manufacturer makes (one with none is absent). */
  async countMedicines(manufacturerIds: readonly number[]): Promise<Map<number, number>> {
    if (manufacturerIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ manufacturer_id: medicines.manufacturer_id, total: count() })
      .from(medicines)
      .where(
        and(inArray(medicines.manufacturer_id, [...manufacturerIds]), isNull(medicines.deleted_at)),
      )
      .groupBy(medicines.manufacturer_id);
    return new Map(rows.map((row) => [Number(row.manufacturer_id), Number(row.total)]));
  }

  /** MD9: each manufacturer's live suppliers, A–Z. */
  async findSuppliers(manufacturerIds: readonly number[]): Promise<LinkedRecords> {
    if (manufacturerIds.length === 0) return new Map();
    return groupLinks(
      await getRequestDatabase()
        .select({
          owner: supplier_manufacturers.manufacturer_id,
          id: suppliers.public_id,
          name: suppliers.name,
        })
        .from(supplier_manufacturers)
        .innerJoin(suppliers, eq(suppliers.id, supplier_manufacturers.supplier_id))
        .where(
          and(
            inArray(supplier_manufacturers.manufacturer_id, [...manufacturerIds]),
            isNull(suppliers.deleted_at),
          ),
        )
        .orderBy(suppliers.name, suppliers.id),
    );
  }

  /** MD9: each manufacturer's live MRs, A–Z. */
  async findMedicalReps(manufacturerIds: readonly number[]): Promise<LinkedRecords> {
    if (manufacturerIds.length === 0) return new Map();
    return groupLinks(
      await getRequestDatabase()
        .select({
          owner: medical_rep_manufacturers.manufacturer_id,
          id: medical_reps.public_id,
          name: medical_reps.name,
        })
        .from(medical_rep_manufacturers)
        .innerJoin(medical_reps, eq(medical_reps.id, medical_rep_manufacturers.medical_rep_id))
        .where(
          and(
            inArray(medical_rep_manufacturers.manufacturer_id, [...manufacturerIds]),
            isNull(medical_reps.deleted_at),
          ),
        )
        .orderBy(medical_reps.name, medical_reps.id),
    );
  }
}
