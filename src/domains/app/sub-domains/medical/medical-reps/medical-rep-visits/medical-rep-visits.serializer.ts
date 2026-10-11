import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { MedicalRepVisitOutput } from './medical-rep-visits.types.js';

/** Shapes an `app.medical_rep_visits` row as the API returns it (routes-final 11.G.6). */
export function serializeMedicalRepVisit({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): MedicalRepVisitOutput {
  return {
    id: row.public_id,
    medical_rep_id: references.publicIdOf({ field: 'medical_rep_id', row }) ?? '',
    visit_date: row.visit_date as string,
    next_visit_on: (row.next_visit_on as string | null) ?? null,
    samples: (row.samples as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    logged_by_membership_id: references.publicIdOf({ field: 'logged_by_membership_id', row }),
    created_at: row.created_at.toISOString(),
  };
}
