import { isLocalDatabaseUrl } from '@/infrastructure/database/utils/connection-url.util.js';

/**
 * Guard that keeps the demo seeders from ever writing to a hosted/production database: the bulk
 * seed, the full seed (`runFullSeed`), the demo clinic's `--fresh`, the demo admin
 * (`ensureDemoAdmin`, a known password with every permission) and the load-test credential pool.
 * Each calls {@link assertBulkSeedAllowed} before any write.
 */

/**
 * Throws unless demo seeding is safe to run. `ALLOW_BULK_SEED=1` is an explicit override.
 * Otherwise `DATABASE_URL` must resolve to a local host (localhost / 127.0.0.1 / ::1) — a remote
 * DSN (production) can never be seeded with demo data without the override, so no `NODE_ENV`
 * comparison is needed.
 *
 * @remarks
 * Failure modes: throws when `DATABASE_URL` is missing or unparseable, or when its host is
 * non-local. Side effects: none (pure check).
 */
export function assertBulkSeedAllowed(env: NodeJS.ProcessEnv): void {
  if (env.ALLOW_BULK_SEED === '1') return;

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Refusing to seed demo data: DATABASE_URL is not set.');
  }

  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('Refusing to seed demo data: DATABASE_URL is not a valid URL.');
  }

  if (!isLocalDatabaseUrl(databaseUrl)) {
    throw new Error(
      `Refusing to seed demo data: DATABASE_URL host "${host}" is not local. ` +
        'Set ALLOW_BULK_SEED=1 to override deliberately.',
    );
  }
}
