import { eq, inArray, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository, nullsLastSortKeys } from '@/domains/app/base-record.repository.js';
import { contactLinkedSearchCondition } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import type { ContactLinkedSearch } from '@/domains/app/sub-domains/contacts/contacts.validator.js';
import { patients } from './patients.schema.js';

/** A patient as a record about them names them (a prescription's `patient`, MD29). */
export interface PatientSummaryRow {
  id: string;
  patient_number: number;
  contact_id: string;
  name: string;
}

/**
 * Persistence for `app.patients` (launch ROUTE #133, routes-final 7.A) — the shared app record
 * reads and writes on its table (the one-file-per-contact read is the contact's —
 * `ContactsRepository.findPatientFile`).
 *
 * @remarks
 * - **Algorithm:** `q` reaches the contact (P9): its trigram-indexed search text (names, email,
 *   Instagram, every number) or contact number, and the patient number (`PT-0412`, `#412`) — the
 *   validator reads which. Sorts: `created_at` (newest first), `patient_number`, `follow_up_at` (a
 *   file without one last in either order — {@link nullsLastSortKeys}). Derived filters: `search`,
 *   `types` (any of them — `&&`, the GIN index).
 * - **Failure modes:** a unique violation propagates (the service maps it — `contact_is_patient`).
 */
export class PatientsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patients,
      entity: 'patient',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        created_at: { keys: [{ value: 'created_at' }], defaultOrder: 'desc' },
        patient_number: { keys: [{ value: 'patient_number' }], defaultOrder: 'asc' },
        follow_up_at: {
          keys: nullsLastSortKeys({
            value: () => sql`${patients.follow_up_at}`,
            sqlType: 'timestamptz',
            empty: sql`'-infinity'::timestamptz`,
            defaultOrder: 'asc',
          }),
          defaultOrder: 'asc',
        },
      },
      derivedFilters: {
        search: (value, organizationId) =>
          contactLinkedSearchCondition({
            search: value as ContactLinkedSearch,
            contactIdColumn: patients.contact_id,
            recordNumberColumn: patients.patient_number,
            organizationId,
          }),
        types: (value) =>
          sql`${patients.types} && array[${sql.join(
            (value as string[]).map((type) => sql`${type}`),
            sql`, `,
          )}]::text[]`,
      },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }

  /**
   * MD29: the patients records name, by public id — the number, the contact and its first and
   * last name; a deleted file's too (a prescription keeps naming its patient).
   */
  async findSummaries(publicIds: readonly string[]): Promise<Map<string, PatientSummaryRow>> {
    const unique = [...new Set(publicIds)];
    if (unique.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        id: patients.public_id,
        patient_number: patients.patient_number,
        contact_id: contacts.public_id,
        first_name: contacts.first_name,
        last_name: contacts.last_name,
      })
      .from(patients)
      .innerJoin(contacts, eq(contacts.id, patients.contact_id))
      .where(inArray(patients.public_id, unique));
    return new Map(
      rows.map(({ first_name: firstName, last_name: lastName, ...row }) => [
        row.id,
        { ...row, name: [firstName, lastName].filter(Boolean).join(' ') },
      ]),
    );
  }
}
