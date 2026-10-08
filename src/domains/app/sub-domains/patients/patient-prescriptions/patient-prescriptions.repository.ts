import { sql } from 'drizzle-orm';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { medical_sales } from '@/domains/app/sub-domains/medical/medical-sales/medical-sales.schema.js';
import { patient_prescriptions } from './patient-prescriptions.schema.js';

/** MDC4: a prescription a live medical sale fills. */
const FILLED = sql`exists (select 1 from ${medical_sales} where ${medical_sales.patient_prescription_id} = ${patient_prescriptions.id} and ${medical_sales.deleted_at} is null)`;

/**
 * Persistence for `app.patient_prescriptions` (launch ROUTE #133, routes-final 7.C) — the shared app
 * record reads and writes on its table: `q` is the prescription number (`RX-500`, `#500`), newest
 * first or by prescription date; the derived filter `is_filled` (a live medical sale fills it — the
 * pharmacy queue, MDC4).
 */
export class PatientPrescriptionsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_prescriptions,
      entity: 'patientPrescription',
      searchColumns: [],
      numberColumn: 'prescription_number',
      sortColumns: { created_at: 'created_at', prescription_date: 'text' },
      derivedFilters: {
        is_filled: (value) => (value === true ? FILLED : sql`not ${FILLED}`),
      },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}
