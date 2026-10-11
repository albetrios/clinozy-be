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
 *   activity — shown only to `patient:clinical_record:read` holders (7.10, M10). `decorate` gives
 *   each file its upload's name and a 15-minute view link (D86).
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
  // D86: each file's name and a link that shows it — one upload read per page
  decorate: async (outputs, context) => {
    const links = await context.ports.fileReadUrls({
      organizationId: context.organizationId,
      fileKeys: outputs.flatMap((output) => output.file_keys as string[]),
    });
    for (const output of outputs) {
      output.files = (output.file_keys as string[]).map((file_key) => {
        const link = links.get(file_key);
        return { file_key, file_name: link?.fileName ?? null, file_url: link?.url ?? null };
      });
    }
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
