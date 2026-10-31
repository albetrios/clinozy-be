import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { envSchemaKeys } from '@/shared/config/env-schema.js';

const deployWorkflow = readFileSync('.github/workflows/reusable-railway-deploy.yml', 'utf8');

/** The `run:` script of the "Set Railway service variables" step, dedented, read line by line. */
function variablesStepScript(): string {
  const lines = deployWorkflow.split('\n');
  const stepIndex = lines.findIndex(
    (line) => line.trim() === '- name: Set Railway service variables',
  );
  const runIndex = lines.findIndex((line, index) => index > stepIndex && line.trim() === 'run: |');
  if (stepIndex < 0 || runIndex < 0)
    throw new Error('Set Railway service variables step not found');
  const runIndent = lines[runIndex]?.search(/\S/) ?? 0;
  const body: string[] = [];
  for (const line of lines.slice(runIndex + 1)) {
    if (line.trim() !== '' && line.search(/\S/) <= runIndent) break;
    body.push(line.slice(runIndent + 2));
  }
  return body.join('\n');
}

/**
 * Runs the step's own script with stub `railway` and `sleep` commands on PATH: every `railway`
 * call prints `message` and exits `exitCode`, and every call to either stub is logged.
 */
function runVariablesStep(options: { readonly message: string; readonly exitCode: number }) {
  const stubDirectory = mkdtempSync(join(tmpdir(), 'railway-variables-push-'));
  const callLog = join(stubDirectory, 'calls.log');
  try {
    writeFileSync(
      join(stubDirectory, 'railway'),
      `#!/usr/bin/env bash\necho railway >> "${callLog}"\necho "$STUB_RAILWAY_MESSAGE"\nexit "$STUB_RAILWAY_EXIT_CODE"\n`,
    );
    writeFileSync(
      join(stubDirectory, 'sleep'),
      `#!/usr/bin/env bash\necho "sleep $1" >> "${callLog}"\n`,
    );
    chmodSync(join(stubDirectory, 'railway'), 0o755);
    chmodSync(join(stubDirectory, 'sleep'), 0o755);
    writeFileSync(callLog, '');
    const result = spawnSync('bash', ['-e', '-c', variablesStepScript()], {
      encoding: 'utf8',
      env: {
        PATH: `${stubDirectory}:${process.env.PATH ?? ''}`,
        GH_VARS_JSON: '{"ALLOWED_ORIGINS":"https://example.test","LOG_LEVEL":"info"}',
        GH_SECRETS_JSON: '{"github_token":"job-token"}',
        ENVIRONMENT: 'development',
        RAILWAY_SERVICE_ID: 'api-service',
        STUB_RAILWAY_MESSAGE: options.message,
        STUB_RAILWAY_EXIT_CODE: String(options.exitCode),
      },
    });
    const calls = readFileSync(callLog, 'utf8').split('\n').filter(Boolean);
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      railwayCalls: calls.filter((call) => call === 'railway').length,
      sleeps: calls.filter((call) => call.startsWith('sleep ')),
    };
  } finally {
    rmSync(stubDirectory, { recursive: true, force: true });
  }
}

/** The `exclude_regex` of the Railway variables step. Bash ERE and JS agree on this pattern. */
function excludeRegex(): RegExp {
  const pattern = /exclude_regex='([^']+)'/.exec(deployWorkflow)?.[1];
  if (!pattern) throw new Error('exclude_regex not found in reusable-railway-deploy.yml');
  return new RegExp(pattern);
}

/** A `.env.example` section that the API and worker never load: CI or local tooling only. */
const RUNNER_ONLY_SECTION =
  /GitHub Actions only|not loaded by API\/worker runtime|local tooling only/;

/** Every key `.env.example` files under a {@link RUNNER_ONLY_SECTION} heading. */
function runnerOnlyEnvironmentKeys(): string[] {
  const lines = readFileSync('.env.example', 'utf8').split('\n');
  const keys: string[] = [];
  let runnerOnly = false;
  lines.forEach((line, index) => {
    const isRule = line.startsWith('# ---');
    if (isRule && lines[index + 2]?.startsWith('# ---')) {
      runnerOnly = RUNNER_ONLY_SECTION.test(lines[index + 1] ?? '');
      return;
    }
    const key = /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1];
    if (runnerOnly && key) keys.push(key);
  });
  return keys;
}

/** Every `vars.NAME` and `secrets.NAME` the workflows and composite actions read. */
function workflowReadKeys(): string[] {
  const files = [
    ...readdirSync('.github/workflows').map((name) => join('.github/workflows', name)),
    ...readdirSync('.github/actions', { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
      .map((name) => join('.github/actions', name)),
  ];
  const keys = new Set<string>();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(
      /\b(?:vars|secrets)\.([A-Za-z_]\w*)/g,
    )) {
      if (match[1]) keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

/**
 * The Railway variables push merges `toJSON(vars)` and `toJSON(secrets)` and sends every key its
 * `exclude_regex` lets through. The secrets context always carries the job's token as
 * `github_token`, in lower case, and the regex named only `GITHUB_TOKEN`: every deploy wrote the
 * token into both Railway services' variables (run 39565294221 listed it among the 91 pushed keys).
 */
describe('Railway variables push (policy)', () => {
  it('never pushes the job token, under either spelling, or a GitHub Actions internal', () => {
    const regex = excludeRegex();
    for (const key of [
      'github_token',
      'GITHUB_TOKEN',
      'RAILWAY_TOKEN',
      'ACTIONS_RUNTIME_TOKEN',
      'CI',
    ]) {
      expect(regex.test(key), key).toBe(true);
    }
  });

  it('still pushes the runtime configuration', () => {
    const regex = excludeRegex();
    for (const key of ['ALLOWED_ORIGINS', 'DATABASE_URL', 'JWT_PRIVATE_KEY', 'NODE_ENV']) {
      expect(regex.test(key), key).toBe(false);
    }
  });

  // Every deploy until 24 Oct pushed RELEASE_PLEASE_TOKEN, the Postman and Scalar keys and the
  // restore drill's Neon key into both production services (run 40090399037 listed them among
  // the 85 pushed keys), although .env.example files each one as GitHub Actions only.
  it('never pushes a key .env.example keeps for GitHub Actions or local tooling', () => {
    const regex = excludeRegex();
    const keys = runnerOnlyEnvironmentKeys();
    expect(keys).toEqual(expect.arrayContaining(['RELEASE_PLEASE_TOKEN', 'POSTMAN_API_KEY']));
    expect(keys.filter((key) => !regex.test(key))).toEqual([]);
  });

  it('never pushes a variable or secret only a workflow reads', () => {
    const regex = excludeRegex();
    const schemaKeys = new Set<string>(envSchemaKeys);
    const workflowOnly = workflowReadKeys().filter((key) => !schemaKeys.has(key));
    expect(workflowOnly).toEqual(expect.arrayContaining(['DEVELOPMENT_API_URL']));
    expect(workflowOnly.filter((key) => !regex.test(key))).toEqual([]);
  });

  it('filters the merged secrets with that one regex', () => {
    expect(deployWorkflow.match(/exclude_regex='/g)).toHaveLength(1);
    expect(deployWorkflow).toContain('--argjson secrets "$GH_SECRETS_JSON"');
    expect(deployWorkflow).toContain('if [[ "$key" =~ $exclude_regex ]]; then');
  });
});

/**
 * A token answer fails every retry the same way, whether the token is wrong or Railway is down.
 * On 21 Oct the step spent five tries and 30 s of backoff on it, four runs in a row, and the CLI's
 * own "Invalid RAILWAY_TOKEN" line sat under a generic "failed after 5 attempts" error (runs
 * 39571367477 and 39583024361).
 */
describe('Railway variables push: retries (policy)', () => {
  it.each([
    "Invalid RAILWAY_TOKEN. Please check that it is valid and has access to the resource you're trying to use.",
    "Unauthorized. Please check that your RAILWAY_TOKEN is valid and has access to the resource you're trying to use.",
  ])('stops at the first answer that names the token: %s', (message) => {
    const run = runVariablesStep({ message, exitCode: 1 });
    expect(run.status).toBe(1);
    expect(run.railwayCalls).toBe(1);
    expect(run.sleeps).toEqual([]);
    expect(run.output).toContain(
      '::error::Railway answered that RAILWAY_TOKEN is invalid for service api-service',
    );
    expect(run.output).toContain('If Railway is down, re-run this job once it is back.');
  });

  it('still retries an answer that does not name the token', () => {
    const run = runVariablesStep({ message: 'Problem processing request', exitCode: 1 });
    expect(run.status).toBe(1);
    expect(run.railwayCalls).toBe(5);
    expect(run.sleeps).toEqual(['sleep 2', 'sleep 4', 'sleep 8', 'sleep 16']);
    expect(run.output).toContain('push failed for service api-service after 5 attempts');
  });

  it('pushes once when Railway accepts', () => {
    const run = runVariablesStep({ message: 'Set variables', exitCode: 0 });
    expect(run.status).toBe(0);
    expect(run.railwayCalls).toBe(1);
    // ALLOWED_ORIGINS + LOG_LEVEL + the derived NODE_ENV and HOSTED_DEPLOYMENT (github_token is excluded).
    expect(run.output).toContain('Pushed 4 variables to Railway service api-service on attempt 1');
  });
});
