import { describe, expect, it } from 'vitest';

import { selectOnlyEntries } from '@tooling/setup/github/sync-github-environments.js';

/**
 * `pnpm github:sync --only KEY,KEY` pushes a few changed values without re-pushing every secret
 * (GitHub can't diff secrets) — so it must push exactly the requested keys and refuse when one
 * is missing or blank locally, rather than silently skipping it.
 */
describe('github:sync --only key selection', () => {
  const declared = [
    { name: 'DATABASE_URL', value: 'postgresql://x' },
    { name: 'DATABASE_POOL_MAX', value: '30' },
    { name: 'SENTRY_DSN', value: 'https://dsn' },
    { name: 'SONAR_TOKEN', value: '' },
  ];

  it('selects exactly the requested keys', () => {
    const { entries, missing } = selectOnlyEntries(declared, ['DATABASE_URL', 'DATABASE_POOL_MAX']);
    expect(entries.map((entry) => entry.name)).toEqual(['DATABASE_URL', 'DATABASE_POOL_MAX']);
    expect(missing).toEqual([]);
  });

  it('reports a requested key that is absent or blank locally', () => {
    expect(selectOnlyEntries(declared, ['DATABASE_URL', 'NOPE', 'SONAR_TOKEN']).missing).toEqual([
      'NOPE',
      'SONAR_TOKEN',
    ]);
  });
});
