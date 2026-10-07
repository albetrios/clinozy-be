import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { MedicalRepOutput } from './medical-reps.types.js';

/** Shapes a `app.medical_reps` row as the API returns it (public ids, numbers, ISO times). */
export function serializeMedicalRep(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): MedicalRepOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    phone: row.phone as string | null,
    manufacturer_ids: references.listOf('manufacturer_ids', row),
    next_visit_on: row.next_visit_on as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
