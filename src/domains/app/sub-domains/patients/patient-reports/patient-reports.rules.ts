import { requireConfirmedUploads } from '@/domains/app/base-record.service.js';
import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { patientFileValueLabel } from '@/domains/app/sub-domains/patients/patients.constants.js';
import { writePatientFileActivity } from '@/domains/app/sub-domains/patients/patients.rules.js';

/**
 * The patient report rules (launch ROUTE #133, routes-final 7.G): the files are confirmed uploads,
 * and a new report shows in the contact's activity.
 *
 * @remarks
 * - **Algorithm:** a create or change checks each of `file_keys` is a confirmed upload of the
 *   organization (P29); after a create a `system` entry linked to the report joins the contact's
 *   activity — shown only to `patient:clinical_record:read` holders (7.10, M10).
 * - **Failure modes:** `ValidationError` on `file_keys`.
 */
export const patientReportsRules: BaseRecordRules = {
  prepareCreate: async (values, context) => {
    await requireConfirmedUploads({
      fileKeys: values.file_keys as string[] | undefined,
      field: 'file_keys',
      context,
    });
  },
  prepareUpdate: async (values, _existing, context) => {
    await requireConfirmedUploads({
      fileKeys: values.file_keys as string[] | undefined,
      field: 'file_keys',
      context,
    });
  },
  afterWrite: async (row, change, context) => {
    if (change.kind !== 'create') return;
    await writePatientFileActivity({
      context,
      patientId: row.patient_id as number,
      body: `Report added: ${patientFileValueLabel(String(row.type))} — ${String(row.name)}`,
      link: { patient_report_id: row.id },
    });
  },
};
