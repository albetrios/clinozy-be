/**
 * Policy: warn-only versus blocking is decided in one place — `tooling/validate/warn-only.ts`.
 *
 * Before, a check was made non-blocking wherever someone needed it: a `--report-only` flag passed
 * in a workflow step, `continue-on-error` on a step, a package script ending in `|| echo …`. This
 * test reads `.github/workflows/*.yml`, `.github/actions/<action>/action.yml` and `package.json`,
 * and fails when one of those is not in the registry, or the registry lists one that is gone.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WARN_ONLY_CHECKS, type WarnOnlyMechanism } from '@tooling/validate/warn-only.js';

const ROOT = process.cwd();

/** One non-blocking check as found in a file. */
interface FoundCheck {
  readonly where: string;
  readonly name: string;
  readonly mechanism: WarnOnlyMechanism;
}

/** A `continue-on-error` that can be anything but `false`: `true`, or an expression. */
const CONTINUE_ON_ERROR = /^\s*continue-on-error:\s*(?!false\b)\S/;
/** The `--report-only` flag as a command-line token (not the words in a step name). */
const REPORT_ONLY_FLAG = /(?:^|[\s"'=])--report-only\b/;
/** A package script whose own exit code never counts. */
const SWALLOWED_EXIT = /\|\|\s*(?:echo\b|true\b|exit\s+0\b|:\s*(?:$|[;&|]))/;
/** A list item that starts a step: `- name: …`, `- uses: …`, `- run: …`. */
const STEP_START = /^(\s*)-\s+([\w-]+):\s*(.*)$/;
/** A job id under `jobs:` (two-space indent). */
const JOB_START = /^ {2}([\w-]+):\s*$/;

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

function indentOf(line: string): number {
  return /^(\s*)/.exec(line)?.[1]?.length ?? 0;
}

/** A step's display name: its `name:`, else its first key and value (`uses: actions/x@v1`). */
function stepName(options: {
  lines: readonly string[];
  index: number;
  match: RegExpExecArray;
}): string {
  const { lines, index, match } = options;
  if (match[2] === 'name') return unquote(match[3] ?? '');
  const indent = (match[1] ?? '').length;
  for (const next of lines.slice(index + 1)) {
    if (next.trim() !== '' && indentOf(next) <= indent) break;
    const nameMatch = new RegExp(`^\\s{${indent + 2}}name:\\s*(.+)$`).exec(next);
    if (nameMatch) return unquote(nameMatch[1] ?? '');
  }
  return `${match[2]}: ${unquote(match[3] ?? '')}`;
}

/** The warn-only checks one line declares, for the step or job that owns it. */
function lineChecks(options: { file: string; owner: string; line: string }): FoundCheck[] {
  const { file, owner, line } = options;
  const checks: FoundCheck[] = [];
  if (CONTINUE_ON_ERROR.test(line)) {
    checks.push({ where: file, name: owner, mechanism: 'continue-on-error' });
  }
  if (REPORT_ONLY_FLAG.test(line.replace(/^\s*(?:-\s+)?name:.*$/, ''))) {
    checks.push({ where: file, name: owner, mechanism: 'report-only flag' });
  }
  return checks;
}

/**
 * The warn-only checks a workflow or composite action declares: each step (or job) carrying
 * `continue-on-error`, and each step whose commands pass `--report-only`.
 */
function findWorkflowChecks(options: { file: string; source: string }): FoundCheck[] {
  const lines = options.source.split('\n');
  const found: FoundCheck[] = [];
  let job: string | undefined;
  let step: { name: string; indent: number } | undefined;
  for (const [index, rawLine] of lines.entries()) {
    if (/^\s*#/.test(rawLine)) continue;
    const line = rawLine.replace(/\s+#.*$/, '');
    const jobMatch = JOB_START.exec(line);
    if (jobMatch) {
      job = jobMatch[1];
      step = undefined;
      continue;
    }
    const stepMatch = STEP_START.exec(line);
    if (stepMatch) {
      step = { name: stepName({ lines, index, match: stepMatch }), indent: indentOf(line) };
    }
    const owner =
      step !== undefined && indentOf(line) >= step.indent ? step.name : `job ${job ?? '(none)'}`;
    found.push(...lineChecks({ file: options.file, owner, line }));
  }
  return found;
}

/** The warn-only package scripts: `--report-only` passed, or the exit code swallowed. */
function findScriptChecks(scripts: Readonly<Record<string, string>>): FoundCheck[] {
  return Object.entries(scripts).flatMap(([name, command]) => {
    const found: FoundCheck[] = [];
    if (REPORT_ONLY_FLAG.test(command)) {
      found.push({ where: 'package.json', name, mechanism: 'report-only flag' });
    }
    if (SWALLOWED_EXIT.test(command)) {
      found.push({ where: 'package.json', name, mechanism: 'report script' });
    }
    return found;
  });
}

function workflowFiles(): string[] {
  const workflows = readdirSync(join(ROOT, '.github/workflows'))
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => `.github/workflows/${file}`);
  const actions = readdirSync(join(ROOT, '.github/actions'))
    .map((action) => `.github/actions/${action}/action.yml`)
    .filter((file) => existsSync(join(ROOT, file)));
  return [...workflows, ...actions];
}

function key(check: FoundCheck): string {
  return `${check.where} › ${check.name} › ${check.mechanism}`;
}

const found = [
  ...workflowFiles().flatMap((file) =>
    findWorkflowChecks({ file, source: readFileSync(join(ROOT, file), 'utf8') }),
  ),
  ...findScriptChecks(
    (
      JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      }
    ).scripts,
  ),
];
const registered = WARN_ONLY_CHECKS.map((check) =>
  'workflow' in check
    ? { where: check.workflow, name: check.step, mechanism: check.mechanism }
    : { where: 'package.json', name: check.script, mechanism: check.mechanism },
);

describe('warn-only checks — decided in tooling/validate/warn-only.ts', () => {
  it('finds the non-blocking checks (anti-vacuity)', () => {
    expect(found.map(key)).toEqual(
      expect.arrayContaining([
        '.github/workflows/pr-ci.yml › Dependency audit (all deps, advisory) › continue-on-error',
        '.github/workflows/reusable-vitest-postgres-redis.yml › Merge coverage and check thresholds › report-only flag',
        'package.json › deps:audit:report › report script',
      ]),
    );
  });

  it('lists every --report-only, continue-on-error and report script in the registry', () => {
    const listed = new Set(registered.map(key));
    expect(found.map(key).filter((entry) => !listed.has(entry))).toEqual([]);
  });

  it('lists none that no longer exists', () => {
    const present = new Set(found.map(key));
    expect(registered.map(key).filter((entry) => !present.has(entry))).toEqual([]);
  });

  it('lists each check once, with a reason', () => {
    const keys = registered.map(key);
    expect(keys.filter((entry, index) => keys.indexOf(entry) !== index)).toEqual([]);
    expect(WARN_ONLY_CHECKS.filter((check) => check.reason.trim().length < 20)).toEqual([]);
  });

  it('reads a step, a job-level continue-on-error and a report-only command the same way', () => {
    const source = [
      'jobs:',
      '  audit:',
      '    continue-on-error: true',
      '    steps:',
      '      - uses: actions/checkout@v6',
      '      - name: Report (report-only)',
      '        run: pnpm deps:audit:report',
      '      - name: Coverage',
      '        # --report-only in a comment does not count',
      '        run: |',
      '          node merge.mjs --report-only',
      '      - id: gate',
      '        name: "Gate"',
      `        continue-on-error: \${{ github.event_name != 'pull_request' }}`,
      '        run: k6 run x.js',
      '      - name: Strict',
      '        continue-on-error: false',
      '        run: k6 run y.js',
      '      - run: node check.mjs --report-only',
    ].join('\n');
    expect(findWorkflowChecks({ file: 'w.yml', source }).map(key)).toEqual([
      'w.yml › job audit › continue-on-error',
      'w.yml › Coverage › report-only flag',
      'w.yml › Gate › continue-on-error',
      'w.yml › run: node check.mjs --report-only › report-only flag',
    ]);
    expect(
      findScriptChecks({
        a: 'pnpm audit || echo report-only',
        b: 'node check.mjs --report-only',
        c: 'pnpm audit --prod',
        d: 'tsx check.ts --report',
      }).map(key),
    ).toEqual(['package.json › a › report script', 'package.json › b › report-only flag']);
  });
});
