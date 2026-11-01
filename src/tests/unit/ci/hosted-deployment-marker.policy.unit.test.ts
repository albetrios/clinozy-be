import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DEPLOY_WORKFLOW_PATH = '.github/workflows/reusable-railway-deploy.yml';
const deployWorkflow = readFileSync(DEPLOY_WORKFLOW_PATH, 'utf8');

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/**
 * A-4 — the hosted-deploy marker. The env schema refuses every test-only switch when
 * HOSTED_DEPLOYMENT is true, so the marker must reach every hosted service and nothing else: CI
 * runs the API image with TEST_MODE for clinozy-fe's e2e, and the restore drills and k6 jobs carry
 * a job-level TEST_MODE on CI runners — a marker baked into the image or set by another workflow
 * would refuse their boot.
 */
describe('hosted-deployment marker (policy)', () => {
  it('the Railway deploy sets HOSTED_DEPLOYMENT=true in both mirrors — to the runner and to Railway', () => {
    const merge = '{NODE_ENV: $environment, HOSTED_DEPLOYMENT: "true"})';
    expect(deployWorkflow.split(merge)).toHaveLength(3);
  });

  it('no other workflow or composite action sets the marker', () => {
    const files = [...listFiles('.github/workflows'), ...listFiles('.github/actions')].filter(
      (path) => path !== DEPLOY_WORKFLOW_PATH,
    );
    const offenders = files.filter((path) =>
      readFileSync(path, 'utf8').includes('HOSTED_DEPLOYMENT'),
    );
    expect(offenders).toEqual([]);
  });

  it('the image and the local stack never set the marker', () => {
    for (const path of ['Dockerfile', 'Dockerfile.worker', 'docker-compose.yml']) {
      expect(readFileSync(path, 'utf8'), path).not.toContain('HOSTED_DEPLOYMENT');
    }
  });

  it('.env.example documents it only commented out, so no scaffolded env file carries it', () => {
    const template = readFileSync('.env.example', 'utf8');
    expect(template).toMatch(/^# HOSTED_DEPLOYMENT=false$/m);
    expect(template).not.toMatch(/^HOSTED_DEPLOYMENT=/m);
  });
});
