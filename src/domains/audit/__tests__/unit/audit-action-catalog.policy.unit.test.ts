import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Policy: the action catalog in `docs/reference/security/audit-logs.md` and the actions the code
 * emits are the same set.
 *
 * The catalog is what an investigator searches. It once listed about twenty-five actions no code
 * emitted — membership, ownership, organization-settings, subscription and webhook changes, all
 * silently unaudited — while a dozen emitted actions were missing from it. Both directions are
 * pinned here:
 *
 * - every catalogued action appears as a string literal in non-test source, and
 * - every `action: '<domain>.<resource>.<verb>'` literal in non-test source is catalogued.
 *
 * Emitting a new action means adding its catalog row; removing one means deleting the row.
 */
const CATALOG_PATH = 'docs/reference/security/audit-logs.md';

/** Action names from the catalog tables' first column: rows shaped `| \`a.b.c\` | ...`. */
function catalogActions(): string[] {
  const catalog = readFileSync(CATALOG_PATH, 'utf8');
  return [...catalog.matchAll(/^\| `([a-z_]+(?:\.[a-z_]+)+)` \|/gm)].map((match) => match[1]!);
}

/** Every non-test TypeScript source file under `src/`, concatenated. */
function nonTestSource(): string {
  return readdirSync('src', { recursive: true, encoding: 'utf8' })
    .filter((relativePath) => relativePath.endsWith('.ts'))
    .filter((relativePath) => !relativePath.endsWith('.test.ts'))
    .filter((relativePath) => !relativePath.split('/').includes('__tests__'))
    .filter((relativePath) => !relativePath.startsWith('tests/'))
    .map((relativePath) => readFileSync(join('src', relativePath), 'utf8'))
    .join('\n');
}

describe('audit action catalog ↔ emitted actions', () => {
  const catalogued = catalogActions();
  const source = nonTestSource();

  it('reads a non-trivial catalog (the table parser still matches the doc)', () => {
    expect(catalogued.length).toBeGreaterThan(40);
    expect(new Set(catalogued).size).toBe(catalogued.length);
  });

  it('every catalogued action is emitted somewhere in the code', () => {
    const neverEmitted = catalogued.filter((action) => !source.includes(`'${action}'`));
    expect(
      neverEmitted,
      `${CATALOG_PATH} lists actions no code emits — emit them or delete their rows`,
    ).toEqual([]);
  });

  it('every action the code emits is catalogued', () => {
    const emitted = new Set(
      [...source.matchAll(/action: '([a-z_]+(?:\.[a-z_]+)+)'/g)].map((match) => match[1]!),
    );
    const uncatalogued = [...emitted].filter((action) => !catalogued.includes(action)).sort();
    expect(uncatalogued, `add a row to ${CATALOG_PATH} for each`).toEqual([]);
  });
});
