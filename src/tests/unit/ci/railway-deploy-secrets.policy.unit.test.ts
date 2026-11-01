import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { jobBlock } from '@/tests/helpers/workflow-jobs.helper.js';

const workflow = readFileSync('.github/workflows/reusable-railway-deploy.yml', 'utf8');
const deploy = jobBlock({ workflow, job: 'deploy' });
const pins = readFileSync('tooling/setup/agent/tool-versions.sh', 'utf8');
const installer = readFileSync('tooling/setup/agent/install-railway.sh', 'utf8');

/** The `env:` block of the job itself (4-space key, 6-space entries), without its comments. */
function jobEnvironment(job: string): string {
  const lines = job.split('\n');
  const start = lines.indexOf('    env:');
  if (start === -1) return '';
  const entries: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^ {6}\S/.test(line)) break;
    entries.push(line);
  }
  return entries.join('\n');
}

/** The value of `key` in tool-versions.sh. */
const pin = (key: string) =>
  pins
    .split('\n')
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1) ?? '';

/**
 * H-2: the production deploy installed `npm install -g @railway/cli` — whatever npm served that
 * day, its postinstall downloading the binary unverified — with RAILWAY_TOKEN and the whole
 * GitHub Environment (`toJSON(secrets)`) in the job's env, so the install scripts of every
 * dependency and of the CLI could read them. The CLI is now the pinned, SHA-256-verified release
 * binary, and no secret is in reach until both installs are done.
 */
describe('Railway deploy: pinned CLI, secrets only where they are read (H-2)', () => {
  it('reads the deploy job (parser sanity)', () => {
    expect(deploy).toContain('- name: Export GitHub Environment to runner');
    expect(jobEnvironment(deploy)).toContain('ENVIRONMENT:');
  });

  it('puts no secret in the job-level env', () => {
    expect(jobEnvironment(deploy)).not.toMatch(/secrets[.)]/);
  });

  it('installs the pinned, verified CLI, never from npm', () => {
    expect(deploy).toContain('run: sudo bash tooling/setup/agent/install-railway.sh');
    const code = workflow
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/npm (?:install|i) (?:-g|--global)/);
    expect(installer).toContain('pinned_version RAILWAY_VERSION');
    expect(installer).toContain('download_verified');
    expect(pin('RAILWAY_VERSION')).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pin('RAILWAY_SHA256_LINUX_X64')).toMatch(/^[0-9a-f]{64}$/);
    expect(pin('RAILWAY_SHA256_LINUX_ARM64')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('installs the dependencies and the CLI before the first step that holds a secret', () => {
    const firstSecret = deploy.search(/\$\{\{\s*(?:secrets\.|toJSON\(secrets\))/);
    expect(firstSecret).toBeGreaterThan(-1);
    expect(deploy.indexOf('uses: ./.github/actions/setup-node-pnpm')).toBeLessThan(firstSecret);
    expect(deploy.indexOf('install-railway.sh')).toBeLessThan(firstSecret);
  });

  it('hands the whole GitHub Environment only to the steps that read it', () => {
    const steps = deploy.split(/\n(?= {6}- name: )/).slice(1);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression, asserted verbatim
    const holder = 'GH_SECRETS_JSON: ${{ toJSON(secrets) }}';
    const holders = steps
      .filter((step) => step.includes(holder))
      .map((step) => /- name: (.+)/.exec(step)?.[1]);
    expect(holders).toEqual([
      'Derive NODE_ENV from the deploy environment',
      'Export GitHub Environment to runner',
      'Validate Railway deploy secrets',
      'Set Railway service variables',
    ]);
    for (const step of steps.filter((candidate) => candidate.includes('"$GH_SECRETS_JSON"'))) {
      expect(step, /- name: (.+)/.exec(step)?.[1]).toContain(holder);
    }
  });
});
