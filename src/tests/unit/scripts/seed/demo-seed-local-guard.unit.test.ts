import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const seedPermissions = vi.hoisted(() => vi.fn());

vi.mock('@/domains/tenancy/sub-domains/permission/seed/permission.reference.seed.js', () => ({
  seedPermissions,
  SYSTEM_PERMISSIONS: [],
}));

const HOSTED_URL = 'postgresql://user:pass@ep-aged.neon.tech:5432/neondb';

/**
 * H-11: the full seed (`pnpm db:seed:full` — demo users with a known or logged password, faker
 * organizations) and the demo admin (`pnpm db:seed:demo-admin` — a known default password and
 * every system permission) wrote to whatever `DATABASE_URL` named. Both now ask the bulk seed's
 * guard first, so a hosted database is refused before the first write.
 */
describe('the demo seeds refuse a non-local database (H-11)', () => {
  beforeEach(() => {
    seedPermissions.mockClear();
    // The seeds write through the operator login when one is set (seed-runtime-url.ts copies it
    // into DATABASE_URL on import), so both name the hosted database here.
    vi.stubEnv('DATABASE_URL', HOSTED_URL);
    vi.stubEnv('DATABASE_OPERATOR_URL', HOSTED_URL);
    vi.stubEnv('ALLOW_BULK_SEED', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('the full seed throws before it writes anything', async () => {
    const { runFullSeed } = await import('@/scripts/seed/full.js');
    await expect(runFullSeed()).rejects.toThrow(/not local/);
    expect(seedPermissions).not.toHaveBeenCalled();
  });

  it('the demo admin throws before it writes anything', async () => {
    const { ensureDemoAdmin } = await import('@/scripts/seed/ensure-demo-admin.js');
    await expect(ensureDemoAdmin()).rejects.toThrow(/not local/);
    expect(seedPermissions).not.toHaveBeenCalled();
  });

  it('the demo admin seeds only when run as a script, so importing it writes nothing', async () => {
    await import('@/scripts/seed/ensure-demo-admin.js');
    expect(seedPermissions).not.toHaveBeenCalled();
  });
});
