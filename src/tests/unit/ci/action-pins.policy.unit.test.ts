import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every third-party GitHub Action in `.github/workflows` and the composite actions is pinned to a
 * full 40-hex commit SHA (a version comment may follow): a tag can be moved to other code, a SHA
 * cannot. Local actions (`./.github/actions/…`) are exempt. The one way both repositories check it
 * — a policy test (clinozy-fe: tests/ci/github-actions-hardening.policy.test.ts); it replaces the
 * former `tooling/ci/check-action-pins.mjs` script.
 */
const THIRD_PARTY_ACTION = /^\s*-?\s*uses:\s+(?!\.\/)([\w.-]+\/[\w./-]+)@([^\s#]+)/gm;
const SHA_PIN = /^[0-9a-f]{40}$/;

function yamlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return yamlFiles(path);
    return /\.ya?ml$/.test(entry.name) ? [path] : [];
  });
}

const references = [...yamlFiles('.github/workflows'), ...yamlFiles('.github/actions')].flatMap(
  (path) =>
    [...readFileSync(path, 'utf8').matchAll(THIRD_PARTY_ACTION)].map((match) => ({
      file: relative(process.cwd(), path),
      action: match[1] ?? '',
      reference: match[2] ?? '',
    })),
);

describe('GitHub Actions pins', () => {
  it('pins every third-party action to a full commit SHA', () => {
    // Anti-vacuity: the workflows use dozens of third-party actions.
    expect(references.length).toBeGreaterThan(20);
    const unpinned = references
      .filter(({ reference }) => !SHA_PIN.test(reference))
      .map(({ file, action, reference }) => `${file}: ${action}@${reference}`);
    expect(unpinned, 'pin with: uses: owner/repo@<40-char sha> # vX.Y.Z').toEqual([]);
  });
});
