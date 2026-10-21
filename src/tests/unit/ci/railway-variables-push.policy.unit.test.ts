import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
    expect(run.output).toContain('Pushed 3 variables to Railway service api-service on attempt 1');
  });
});
