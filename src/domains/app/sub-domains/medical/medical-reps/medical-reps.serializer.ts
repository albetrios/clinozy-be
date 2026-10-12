import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { MedicalRepOutput } from './medical-reps.types.js';

/**
 * Shapes an `app.medical_reps` row as the API returns it (routes-final 11.F.6). The latest visit,
 * the overdue flag and the manufacturers are the rules' `decorate`.
 */
export function serializeMedicalRep({ row }: { row: BaseRecordRow }): MedicalRepOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    phone: (row.phone as string | null) ?? null,
    next_visit_on: (row.next_visit_on as string | null) ?? null,
    is_visit_overdue: false,
    last_visit_on: null,
    last_samples: null,
    manufacturers: [],
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
