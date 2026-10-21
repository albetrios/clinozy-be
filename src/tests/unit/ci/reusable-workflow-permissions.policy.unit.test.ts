import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { classifyKey, parseEnvContents } from '@tooling/setup/github/sync-github-environments.js';
import { describe, expect, it } from 'vitest';

/**
 * Caller/callee permission contract for local reusable workflows.
 *
 * A called workflow can never hold MORE than the calling job was granted. When a caller job
 * omits its own `permissions:` block it inherits the workflow-level default — which is
 * `contents: read` in this repo, meaning every other scope is `none`. If the callee's jobs then
 * request `packages: write` (or any other elevated scope), GitHub rejects the ENTIRE run at
 * startup: `startup_failure`, zero jobs, and no logs retrievable through the REST API.
 *
 * That is not hypothetical. `release-deploy.yml` shipped without permissions on its
 * reusable-calling jobs and failed this way on **9 consecutive releases** over a month —
 * production was never deployed once — while every PR stayed green, because actionlint does not
 * model this rule and nothing else exercises a `release`-triggered workflow.
 *
 * Secrets have a contract too. They live in GitHub Environments, so every job of a reusable
 * workflow that reads one sets `environment:`. And that job reaches its environment's secrets only
 * when the caller passes `secrets: inherit`: clinozy-fe#150 dropped it and the called deploy read
 * every secret empty (run 39454666563), so a call whose callee reads a secret must pass it.
 */
const ROOT = process.cwd();
const WORKFLOW_DIRECTORY = join(ROOT, '.github/workflows');

/** Ordered so a numeric comparison decides whether a grant covers a request. */
const PERMISSION_RANK: Record<string, number> = { none: 0, read: 1, write: 2 };

/** A `${{ secrets.NAME }}` read; `GITHUB_TOKEN` is the run's own token, never an environment secret. */
const SECRET_READ = /\$\{\{ *secrets\.(?!GITHUB_TOKEN\b)[A-Za-z_]\w*/;
const JOB_ENVIRONMENT = /^ {4}environment:/m;

function listWorkflows(): Array<{ file: string; content: string }> {
  return readdirSync(WORKFLOW_DIRECTORY)
    .filter((name) => name.endsWith('.yml'))
    .map((file) => ({ file, content: readFileSync(join(WORKFLOW_DIRECTORY, file), 'utf8') }));
}

/** Splits a workflow into its top-level job blocks (`jobs:` children are indented two spaces). */
function parseJobBlocks(workflow: string): Map<string, string> {
  const jobsSection = workflow.split(/^jobs:\s*$/m)[1] ?? '';
  const blocks = new Map<string, string>();
  let currentName = '';
  let currentLines: string[] = [];

  for (const line of jobsSection.split('\n')) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header?.[1]) {
      if (currentName) blocks.set(currentName, currentLines.join('\n'));
      currentName = header[1];
      currentLines = [];
      continue;
    }
    if (currentName) currentLines.push(line);
  }
  if (currentName) blocks.set(currentName, currentLines.join('\n'));

  return blocks;
}

/** Reads a `permissions:` mapping at the given indent, or null when the block is absent. */
function parsePermissions(block: string, indent: number): Map<string, string> | null {
  const pad = ' '.repeat(indent);
  const entryPad = ' '.repeat(indent + 2);
  const lines = block.split('\n');
  const start = lines.indexOf(`${pad}permissions:`);
  if (start === -1) return null;

  const permissions = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    const entry = new RegExp(`^${entryPad}([a-z-]+):\\s*([a-z]+)\\s*$`).exec(line);
    const scope = entry?.[1];
    const level = entry?.[2];
    if (!(scope && level)) break;
    permissions.set(scope, level);
  }
  return permissions;
}

/** Workflow-level `permissions:` (column 0), the default every job inherits. */
function parseWorkflowPermissions(workflow: string): Map<string, string> {
  return parsePermissions(workflow, 0) ?? new Map();
}

/** Every elevated scope any job inside a reusable workflow asks for. */
function requiredPermissions(reusableWorkflow: string): Map<string, string> {
  const required = new Map<string, string>();
  for (const block of parseJobBlocks(reusableWorkflow).values()) {
    for (const [scope, level] of parsePermissions(block, 4) ?? []) {
      const current = required.get(scope);
      const isHigher = (PERMISSION_RANK[level] ?? 0) > (PERMISSION_RANK[current ?? 'none'] ?? 0);
      if (!current || isHigher) required.set(scope, level);
    }
  }
  return required;
}

interface ReusableCall {
  readonly callerWorkflow: string;
  readonly callerJob: string;
  readonly calleeWorkflow: string;
  readonly granted: Map<string, string>;
  readonly required: Map<string, string>;
}

function collectReusableCalls(): ReusableCall[] {
  const calls: ReusableCall[] = [];

  for (const { file, content: workflow } of listWorkflows()) {
    const workflowPermissions = parseWorkflowPermissions(workflow);

    for (const [jobName, block] of parseJobBlocks(workflow)) {
      const callee = /^\s*uses:\s*\.\/\.github\/workflows\/([A-Za-z0-9._-]+\.yml)\s*$/m.exec(block);
      if (!callee?.[1]) continue;

      calls.push({
        callerWorkflow: file,
        callerJob: jobName,
        calleeWorkflow: callee[1],
        // A job-level block REPLACES the workflow default outright — it is not merged.
        granted: parsePermissions(block, 4) ?? workflowPermissions,
        required: requiredPermissions(readFileSync(join(WORKFLOW_DIRECTORY, callee[1]), 'utf8')),
      });
    }
  }

  return calls;
}

describe('reusable workflow permission contract', () => {
  const calls = collectReusableCalls();

  it('finds the reusable-workflow calls it is meant to guard', () => {
    // Guards the parser itself: a regex that silently matches nothing would make every
    // assertion below vacuous, which is the failure mode this whole suite exists to prevent.
    expect(calls.length).toBeGreaterThan(5);
    expect(calls.some((call) => call.callerWorkflow === 'release-deploy.yml')).toBe(true);
    expect(calls.some((call) => call.required.get('packages') === 'write')).toBe(true);
  });

  it('grants every calling job at least what its called workflow requests', () => {
    const violations = calls.flatMap((call) =>
      [...call.required]
        .filter(([scope, level]) => {
          const grantedLevel = call.granted.get(scope) ?? 'none';
          return (PERMISSION_RANK[grantedLevel] ?? 0) < (PERMISSION_RANK[level] ?? 0);
        })
        .map(
          ([scope, level]) =>
            `${call.callerWorkflow} job '${call.callerJob}' → ${call.calleeWorkflow}: ` +
            `needs ${scope}:${level}, granted ${call.granted.get(scope) ?? 'none'}`,
        ),
    );

    expect(violations).toEqual([]);
  });

  it('every call of a reusable workflow that reads a secret passes secrets: inherit', () => {
    const readsSecret = (calleeWorkflow: string): boolean =>
      [
        ...parseJobBlocks(readFileSync(join(WORKFLOW_DIRECTORY, calleeWorkflow), 'utf8')).values(),
      ].some((block) => SECRET_READ.test(block));
    const secretCalls = listWorkflows().flatMap((workflow) =>
      [...parseJobBlocks(workflow.content)].flatMap(([jobName, block]) => {
        const callee = /^\s*uses:\s*\.\/\.github\/workflows\/([A-Za-z0-9._-]+\.yml)\s*$/m.exec(
          block,
        )?.[1];
        return callee && readsSecret(callee)
          ? [{ caller: `${workflow.file} job '${jobName}'`, block }]
          : [];
      }),
    );
    expect(secretCalls.length).toBeGreaterThan(0);
    const withoutInherit = secretCalls
      .filter(({ block }) => !block.split('\n').some((line) => line.trim() === 'secrets: inherit'))
      .map(({ caller }) => caller);
    expect(withoutInherit).toEqual([]);
  });

  it('every reusable-workflow job that reads a secret sets environment:', () => {
    const reusable = listWorkflows().filter((workflow) =>
      /^ {2}workflow_call:/m.test(workflow.content),
    );
    expect(reusable.length).toBeGreaterThan(0);
    const unscoped = reusable.flatMap((workflow) =>
      [...parseJobBlocks(workflow.content)]
        .filter(([, block]) => SECRET_READ.test(block) && !JOB_ENVIRONMENT.test(block))
        .map(([name]) => `${workflow.file}: ${name}`),
    );
    expect(unscoped).toEqual([]);
  });

  it('reads every synced key from the context its classification names', () => {
    // A Variable read through `secrets.*` (or a Secret through `vars.*`) is an empty string, not an
    // error: the test-result email read TEST_RESULT_EMAIL_TO, a Variable by `classifyKey`, through
    // `secrets.*` (and SCALAR_NAMESPACE once skipped the Scalar publish the same way).
    const synced = new Set(
      parseEnvContents(readFileSync(join(ROOT, '.env.example'), 'utf8')).map((entry) => entry.name),
    );
    const mismatched = listWorkflows().flatMap((workflow) =>
      [...workflow.content.matchAll(CONTEXT_READ)]
        .filter(([, , name]) => name !== undefined && synced.has(name))
        .filter(
          ([, context, name]) => (context === 'secrets') !== (classifyKey(name ?? '') === 'secret'),
        )
        .map(([, context, name]) => `${workflow.file}: ${context}.${name}`),
    );
    expect(mismatched).toEqual([]);
  });

  it("never gates a step on an env value that only the step's own env: sets", () => {
    // A step's `env:` is not visible to its `if:`, so such a gate reads empty: the per-shard
    // test-result email gated on `env.RESEND_API_KEY != ''` from its own `env:` and never sent.
    const selfGated = listWorkflows().flatMap((workflow) =>
      stepsOf(workflow.content).flatMap((step) => {
        const ownEnvironment = stepEnvironmentKeys(step);
        const read = [...stepCondition(step).matchAll(/\benv\.([A-Z_][A-Z0-9_]*)/g)].map(
          ([, name]) => name ?? '',
        );
        return read
          .filter((name) => ownEnvironment.has(name))
          .map((name) => `${workflow.file}: ${step.split('\n')[0]?.trim()} reads env.${name}`);
      }),
    );
    expect(selfGated).toEqual([]);
  });
});

/** A `${{ secrets.NAME }}` or `${{ vars.NAME }}` read: the context and the key. */
const CONTEXT_READ = /\$\{\{[^}]*?\b(secrets|vars)\.([A-Z_][A-Z0-9_]*)/g;

/** The steps of every job: each starts at a `      - ` line (steps sit six spaces in). */
function stepsOf(workflow: string): string[] {
  const steps: string[] = [];
  let current: string[] | undefined;
  for (const line of workflow.split('\n')) {
    if (line.startsWith('      - ')) {
      current = [line];
      steps.push(current.join('\n'));
      continue;
    }
    if (current && (line.startsWith('       ') || line.trim() === '')) {
      current.push(line);
      steps[steps.length - 1] = current.join('\n');
    } else {
      current = undefined;
    }
  }
  return steps;
}

/** The step's `if:` expression, a block scalar's continuation lines included. */
function stepCondition(step: string): string {
  const lines = step.split('\n');
  const start = lines.findIndex((line) => /^ {6}- if:|^ {8}if:/.test(line));
  if (start === -1) return '';
  const continuation = lines.slice(start + 1);
  const end = continuation.findIndex((line) => /^ {8}\S/.test(line));
  return [lines[start], ...(end === -1 ? continuation : continuation.slice(0, end))].join('\n');
}

/** The keys of the step's own `env:` block. */
function stepEnvironmentKeys(step: string): Set<string> {
  const lines = step.split('\n');
  const start = lines.findIndex((line) => /^ {6}- env:\s*$|^ {8}env:\s*$/.test(line));
  if (start === -1) return new Set();
  const keys = new Set<string>();
  for (const line of lines.slice(start + 1)) {
    if (/^ {8}\S/.test(line)) break;
    const key = /^ {10}([A-Z_][A-Z0-9_]*):/.exec(line)?.[1];
    if (key) keys.add(key);
  }
  return keys;
}
