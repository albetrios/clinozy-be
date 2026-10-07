import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { InvoiceOutput } from './invoices.types.js';

/** Shapes a `app.invoices` row as the API returns it (public ids, numbers, ISO times). */
export function serializeInvoice(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): InvoiceOutput {
  return {
    id: row.public_id,
    invoice_sequence: row.invoice_sequence as number,
    invoice_number: row.invoice_number as string,
    financial_year: row.financial_year as string,
    type: row.type as string,
    branch_id: references.publicIdOf('branch_id', row) ?? '',
    patient_id: references.publicIdOf('patient_id', row),
    team_membership_ids: references.listOf('team_membership_ids', row),
    items: row.items as unknown,
    overall_discount: toAmount(row.overall_discount) as number,
    invoice_date: row.invoice_date as string,
    remark: row.remark as string | null,
    prescription_id: references.publicIdOf('prescription_id', row),
    medical_contact_id: references.publicIdOf('medical_contact_id', row),
    medical_sale_id: references.publicIdOf('medical_sale_id', row),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
