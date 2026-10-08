import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { MedicalRepVisitOutput } from './medical-rep-visits.types.js';

/** Shapes a `app.medical_rep_visits` row as the API returns it (public ids, numbers, ISO times). */
export function serializeMedicalRepVisit(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): MedicalRepVisitOutput {
  return {
    id: row.public_id,
    medical_rep_id: references.publicIdOf('medical_rep_id', row) ?? '',
    visit_date: row.visit_date as string,
    samples: row.samples as string | null,
    notes: row.notes as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
