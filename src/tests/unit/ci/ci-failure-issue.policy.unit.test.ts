import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ACTION_USE = 'uses: ./.github/actions/ci-failure-issue';
const SCRIPT = '.github/actions/ci-failure-issue/ci-failure-issue.sh';
const WORKFLOWS = '.github/workflows';

// Scheduled housekeeping whose only job is deleting old caches/images: a red run there has no
// "check" to report, so it carries no ci-failure issue.
const HOUSEKEEPING = new Set(['cleanup-cache.yml', 'cleanup-ghcr.yml']);

const workflowFiles = readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'));
const workflowText = (name: string): string => readFileSync(join(WORKFLOWS, name), 'utf8');

/** Every scheduled check plus post-merge CI: the runs nobody watches as they finish. */
const alertedWorkflows = [
  ...workflowFiles.filter(
    (name) => /^ {2}schedule:/m.test(workflowText(name)) && !HOUSEKEEPING.has(name),
  ),
  'post-merge-ci.yml',
];

/** The top-level jobs of a workflow, as `[name, block]` (two-space keys under `jobs:`). */
function jobBlocks(text: string): Array<[string, string]> {
  const jobs = text.slice(text.indexOf('\njobs:\n'));
  const parts = jobs.split(/^ {2}([a-z][a-z-]*):\n/m).slice(1);
  const blocks: Array<[string, string]> = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    blocks.push([parts[index] ?? '', parts[index + 1] ?? '']);
  }
  return blocks;
}

/** The `title:` of each action step in the given mode. */
function titles(text: string, mode: 'open' | 'close'): string[] {
  return [...text.matchAll(new RegExp(`mode: ${mode}\\n\\s+title: (.+)`, 'g'))].map(
    (match) => match[1] ?? '',
  );
}

/**
 * Locks in one failure alert for every scheduled and post-merge check: a red run opens (or
 * comments on) one `ci-failure` issue per check through the shared action, and the next green run
 * closes it — so an open issue means the check is red right now.
 */
describe('ci-failure issue alert', () => {
  let directory = '';
  let state = '';
  let log = '';

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'ci-failure-issue-'));
    state = join(directory, 'open-issue');
    log = join(directory, 'gh.log');
    // A stand-in `gh`: logs each call; `issue list` prints the open issue number, if any.
    const stub = join(directory, 'gh');
    writeFileSync(
      stub,
      [
        '#!/usr/bin/env bash',
        'echo "$*" >> "$GH_LOG"',
        'case "$1 $2" in',
        '  "issue list") [ -f "$GH_STATE" ] && cat "$GH_STATE"; exit 0 ;;',
        '  "issue create") echo 7 > "$GH_STATE" ;;',
        '  "issue close") rm -f "$GH_STATE" ;;',
        'esac',
        '',
      ].join('\n'),
    );
    chmodSync(stub, 0o755);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function run(mode: string): { status: number | null; output: string } {
    const result = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        GH_LOG: log,
        GH_STATE: state,
        GH_REPOSITORY: 'owner/repository',
        MODE: mode,
        TITLE: 'Weekly chaos suite failing',
        BODY: 'What failed.',
        CLOSE_COMMENT: 'Green again.',
        WORKFLOW_URL: 'https://github.com/owner/repository/actions/runs/42',
      },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  }

  const ghLog = (): string => readFileSync(log, 'utf8');
  const runLink = 'Run: https://github.com/owner/repository/actions/runs/42';

  it('opens one issue, comments on it after that, and closes it on the next green run', () => {
    expect(run('open').status).toBe(0);
    expect(ghLog()).toContain(
      `issue create --repo owner/repository --title Weekly chaos suite failing --label ci-failure --body ${runLink}\n\nWhat failed.`,
    );

    expect(run('open').output).toContain('Commented on existing ci-failure issue #7.');
    expect(ghLog()).toContain(`issue comment 7 --repo owner/repository --body ${runLink}`);

    expect(run('close').output).toContain('Closed ci-failure issue #7.');
    expect(ghLog()).toContain(
      `issue close 7 --repo owner/repository --comment Green again. ${runLink}`,
    );

    expect(run('close').output).toContain('No open ci-failure issue to close.');
    expect(ghLog().match(/^issue create /gm)).toHaveLength(1);
  });

  it('refuses an unknown mode', () => {
    const result = run('reopen');
    expect(result.status).toBe(2);
    expect(result.output).toContain("mode must be open or close, got 'reopen'");
  });

  it('passes bash -n', () => {
    expect(() => execFileSync('bash', ['-n', SCRIPT])).not.toThrow();
  });

  it.each(alertedWorkflows)('%s opens and closes its issue through the shared action', (name) => {
    const text = workflowText(name);
    const opened = titles(text, 'open');
    expect(opened.length).toBeGreaterThan(0);
    // Every issue a red run opens has a green run that closes it, under the same title.
    expect(new Set(titles(text, 'close'))).toEqual(new Set(opened));
  });

  it('every job that runs the action can write issues and checks the action out', () => {
    const offenders: string[] = [];
    for (const name of workflowFiles) {
      for (const [job, block] of jobBlocks(workflowText(name))) {
        if (!block.includes(ACTION_USE)) continue;
        const checkout = block.indexOf('sparse-checkout: .github/actions/ci-failure-issue');
        if (
          !block.includes('issues: write') ||
          checkout < 0 ||
          checkout > block.indexOf(ACTION_USE)
        ) {
          offenders.push(`${name} → ${job}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no workflow inlines its own ci-failure issue logic', () => {
    const inlined = workflowFiles.filter((name) => /--label ci-failure/.test(workflowText(name)));
    expect(inlined).toEqual([]);
  });
});
