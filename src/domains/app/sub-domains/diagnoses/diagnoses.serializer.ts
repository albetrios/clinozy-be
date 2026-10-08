import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { DiagnosisOutput } from './diagnoses.types.js';

/** Shapes a `app.diagnoses` row as the API returns it (public ids, numbers, ISO times). */
export function serializeDiagnosis(
  row: BaseRecordRow,
  _references: BaseRecordReferenceLookup,
): DiagnosisOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
