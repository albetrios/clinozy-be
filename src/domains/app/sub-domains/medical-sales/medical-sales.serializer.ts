import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { MedicalSaleOutput } from './medical-sales.types.js';

/** Shapes a `app.medical_sales` row as the API returns it (public ids, numbers, ISO times). */
export function serializeMedicalSale(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): MedicalSaleOutput {
  return {
    id: row.public_id,
    sale_number: row.sale_number as number,
    invoice_id: references.publicIdOf('invoice_id', row),
    patient_id: references.publicIdOf('patient_id', row),
    medical_contact_id: references.publicIdOf('medical_contact_id', row),
    prescription_id: references.publicIdOf('prescription_id', row),
    lead_id: references.publicIdOf('lead_id', row),
    status: row.status as string,
    sold_at: toInstant(row.sold_at) as string,
    voided_at: toInstant(row.voided_at),
    returns: row.returns as unknown,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
