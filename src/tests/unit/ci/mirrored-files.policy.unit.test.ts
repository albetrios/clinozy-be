import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The sibling repository's checkout beside this one, as in a session that holds both. */
const SIBLING = join(process.cwd(), '..', 'clinozy-fe');

/**
 * The files this repository and clinozy-fe keep as true copies: a change to one is a change to both.
 * Everything else the two repositories share the shape of (session-hooks.ts, mcp-config.ts,
 * lint-changed-markdown.sh, check-patch-coverage.mjs, …) is a parallel implementation — each
 * repository's own formatter, helpers and doc links — and is not listed here.
 */
const COPIES = [
  'tooling/setup/agent/ensure-docker-daemon.sh',
  'tooling/ci/early-failure-alert.d.mts',
] as const;

/** A file's text with the repository names folded together, so "the other one" reads the same. */
const normalised = (path: string) =>
  readFileSync(path, 'utf8').replace(/clinozy-(?:be|fe)\b/g, 'clinozy-<repository>');

/**
 * Locks in the true copies across the two repositories. It compares against the sibling checkout
 * when the session holds both (a cloud session, a developer with both cloned side by side); a CI
 * run checks out one repository, so there it checks only that each copy is still here.
 */
describe('files mirrored in clinozy-fe', () => {
  it('keeps every listed copy in this repository', () => {
    for (const path of COPIES) expect(existsSync(path), path).toBe(true);
  });

  it.skipIf(!existsSync(join(SIBLING, '.git')))(
    'matches the sibling checkout byte for byte',
    () => {
      for (const path of COPIES) {
        expect(normalised(join(SIBLING, path)), path).toBe(normalised(path));
      }
    },
  );
});
