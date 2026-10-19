import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One wait for an API to be ready: `tooling/ci/wait-for-ready.sh`. The start-api-server action,
 * the image smoke boot and the Railway deploy each had their own `/readyz` loop (1 s with a
 * died-process check, 2 s for 90 s, 5 s for 300 s); now they pass those numbers to the script.
 */
const files = [
  ...readdirSync('.github/workflows').map((name) => join('.github/workflows', name)),
  ...readdirSync('.github/actions').map((name) => join('.github/actions', name, 'action.yml')),
].filter((path) => path.endsWith('.yml'));
const text = (path: string) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

describe('API readiness wait', () => {
  it('no workflow or action polls /readyz with a loop of its own', () => {
    const looping = files.filter((path) =>
      /(until|while)[^\n]*curl[^\n]*readyz|until curl[^\n]*"\$health_url"/.test(text(path)),
    );
    expect(looping).toEqual([]);
  });

  it('the three waits go through the script', () => {
    for (const path of [
      '.github/actions/start-api-server/action.yml',
      '.github/workflows/reusable-docker-build-trivy.yml',
      '.github/workflows/reusable-railway-deploy.yml',
    ]) {
      expect(text(path), path).toContain('bash tooling/ci/wait-for-ready.sh --url ');
    }
  });
});
