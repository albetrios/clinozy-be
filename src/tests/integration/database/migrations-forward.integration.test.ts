import { describe, it, expect } from 'vitest';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { sql } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';

/** Rows of a `database.execute()` result. */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] }).rows ?? []);
}

/**
 * Verifies all SQL migrations in migrations/ are applied to the test database.
 * CI runs `pnpm db:migrate` before tests; local dev should run migrate after compose:up.
 */
// Skipped under `pnpm test:rls-role`: this suite reads `public.schema_migrations`, the migrator's ledger — not something the application role touches, so running it as the RLS-subject
// `clinozy_be_app` would assert nothing about whether the application obeys RLS.
const runAsApplicationBehaviour = !process.env.TEST_DATABASE_ROLE;

describe.runIf(runAsApplicationBehaviour)('Integration: migrations forward', () => {
  it('should have every migrations/*.sql file recorded in schema_migrations', async () => {
    const migrationsFolder = resolve(process.cwd(), 'migrations');
    const allFiles = (await readdir(migrationsFolder))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const applied = rowsOf<{ filename: string }>(
      await database.execute(sql`
      SELECT filename FROM public.schema_migrations ORDER BY filename ASC
    `),
    );
    expect(
      allFiles.length,
      'Expected migration files to compare against the ledger',
    ).toBeGreaterThan(0);
    expect(
      applied.length,
      'schema_migrations is empty; run pnpm db:migrate before this suite',
    ).toBeGreaterThan(0);
    const appliedSet = new Set(applied.map((row) => row.filename));

    const missing = allFiles.filter((filename) => !appliedSet.has(filename));
    expect(missing, `Run pnpm db:migrate — pending: ${missing.join(', ')}`).toEqual([]);
  });

  it('should pass static migration lint', () => {
    execSync('pnpm db:migrate:lint', { stdio: 'pipe', encoding: 'utf-8' });
  });
});
