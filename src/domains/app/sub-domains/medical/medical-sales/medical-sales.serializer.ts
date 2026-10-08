import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import { MEDICAL_SALE_STATUS } from './medical-sales.constants.js';
import type { MedicalSaleOutput } from './medical-sales.types.js';

/**
 * Shapes an `app.medical_sales` row as the API returns it (routes-final 11.H.6). The buyer, the
 * invoice, its lines, team and returns, the status of a live sale and the margin are the rules'
 * `decorate`.
 */
export function serializeMedicalSale(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): MedicalSaleOutput {
  const contactId = references.publicIdOf('contact_id', row);
  return {
    id: row.public_id,
    sale_number: row.sale_number as number,
    status: row.deleted_at === null ? MEDICAL_SALE_STATUS.UNPAID : MEDICAL_SALE_STATUS.VOIDED,
    contact: contactId === null ? null : { id: contactId, name: '', primary_phone: '' },
    patient_id: null,
    branch_id: references.publicIdOf('branch_id', row) ?? '',
    invoice: null,
    items: [],
    returned_amount: 0,
    margin_amount: 0,
    margin_percent: null,
    member_ids: [],
    patient_prescription_id: references.publicIdOf('patient_prescription_id', row),
    remark: null,
    returns: [],
    sold_at: (toInstant(row.sold_at) ?? row.created_at.toISOString()) as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: toInstant(row.deleted_at),
    delete_reason: row.delete_reason,
    delete_note: row.delete_note,
  };
}
