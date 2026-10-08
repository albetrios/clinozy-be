import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { MedicalContactOutput } from './medical-contacts.types.js';

/** Shapes a `app.medical_contacts` row as the API returns it (public ids, numbers, ISO times). */
export function serializeMedicalContact(
  row: BaseRecordRow,
  _references: BaseRecordReferenceLookup,
): MedicalContactOutput {
  return {
    id: row.public_id,
    name: row.name as string,
    phone: row.phone as string | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
