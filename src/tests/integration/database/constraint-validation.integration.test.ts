import { describe, expect, it } from 'vitest';
import { sql } from '@/infrastructure/database/connection.js';

/**
 * Every constraint the migrations create is VALIDATED by migration head.
 *
 * The migration-safety rule adds a foreign key or CHECK `NOT VALID` (no full-table scan under the
 * ADD's lock) and VALIDATEs it in a follow-up step. A follow-up that never ships leaves the
 * constraint enforced for new rows only: older rows stay unproven and the planner cannot trust
 * it. The `auth.mfa_methods` foreign keys sat in exactly that state until migration
 * `20261005180000_validate_mfa_methods_foreign_keys.sql`.
 */
describe('Integration: constraint validation', () => {
  it('leaves no NOT VALID constraint behind at migration head', async () => {
    const rows = await sql<{ constraint_name: string }[]>`
      SELECT c.conrelid::regclass::text || ' ' || c.conname AS constraint_name
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE NOT c.convalidated
        AND n.nspname IN ('auth', 'tenancy', 'billing', 'notify', 'audit', 'upload', 'public')
      ORDER BY 1
    `;
    expect(rows.map((row) => row.constraint_name)).toEqual([]);
  });
});
