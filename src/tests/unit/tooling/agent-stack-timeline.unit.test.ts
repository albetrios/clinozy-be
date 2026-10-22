import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const BOOT_ID = '/proc/sys/kernel/random/boot_id';
const temporaryDirectories: string[] = [];

function makeDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function currentBoot(): string {
  try {
    return readFileSync(BOOT_ID, 'utf8').trim();
  } catch {
    return '';
  }
}

/** Runs `stack.sh <command>` against throwaway stack and Setup-timeline directories. */
function runStack({
  command,
  stackDirectory,
  setupTimelineDirectory,
  temporaryDirectory = tmpdir(),
}: {
  command: 'status' | 'timeline';
  stackDirectory: string;
  setupTimelineDirectory: string;
  temporaryDirectory?: string;
}) {
  return spawnSync('/bin/bash', ['tooling/setup/agent/stack.sh', command], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AGENT_STACK_DIR: stackDirectory,
      AGENT_SETUP_TIMELINE_DIR: setupTimelineDirectory,
      TMPDIR: temporaryDirectory,
      PORT: '1',
      WORKER_HEALTH_PORT: '1',
      FRONTEND_URL: 'http://127.0.0.1:1',
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * `pnpm dev:stack:timeline` answers "when did each start-up step run" from the record bootstrap.sh
 * keeps — the Setup script's beside the cached environment, the live bring-up's in the stack
 * directory, stamped with its boot — instead of from file times and other logs.
 */
describe('the start-up timeline', () => {
  it('records stamped lines and reads them back only in the boot that wrote them', () => {
    const file = join(makeDirectory('stack-timeline-'), 'timeline');
    const run = spawnSync(
      '/bin/bash',
      [
        '-c',
        'source tooling/setup/agent/stack-lock.lib.sh && stack_timeline_start "$1" && stack_timeline_append "$1" "▶ [1/10] Node runtime" && stack_timeline_this_boot "$1"',
        'timeline',
        file,
      ],
      { encoding: 'utf8' },
    );

    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z {2}▶ \[1\/10\] Node runtime\n$/,
    );

    writeFileSync(`${file}.boot_id`, 'another-boot\n');
    const stale = spawnSync(
      '/bin/bash',
      [
        '-c',
        'source tooling/setup/agent/stack-lock.lib.sh && stack_timeline_this_boot "$1"',
        'timeline',
        file,
      ],
      { encoding: 'utf8' },
    );
    expect(stale.status).toBe(1);
    expect(stale.stdout).toBe('');
  });

  it("merges each repository's Setup-script run by time, then shows this boot's bring-up", () => {
    const stackDirectory = makeDirectory('stack-timeline-');
    const setupTimelineDirectory = makeDirectory('setup-timeline-');
    writeFileSync(
      join(setupTimelineDirectory, 'setup-timeline-alpha'),
      '2026-10-22 01:35:10Z  ▶ [1/6] Node runtime\n2026-10-22 01:36:00Z  ✓ [2/6] dependencies installed\n',
    );
    writeFileSync(
      join(setupTimelineDirectory, 'setup-timeline-beta'),
      '2026-10-22 01:35:30Z  ▶ [1/9] Node runtime\n',
    );
    writeFileSync(join(setupTimelineDirectory, 'setup-timeline-beta.boot_id'), 'the-setup-boot\n');
    writeFileSync(
      join(stackDirectory, 'timeline'),
      '2026-10-22 01:40:09Z  ▶ [1/10] Node runtime\n',
    );
    writeFileSync(join(stackDirectory, 'timeline.boot_id'), `${currentBoot()}\n`);

    const result = runStack({ command: 'timeline', stackDirectory, setupTimelineDirectory });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      [
        '  2026-10-22 01:35:10Z  alpha  ▶ [1/6] Node runtime',
        '  2026-10-22 01:35:30Z  beta  ▶ [1/9] Node runtime',
        '  2026-10-22 01:36:00Z  alpha  ✓ [2/6] dependencies installed',
      ].join('\n'),
    );
    expect(result.stdout).not.toContain('the-setup-boot');
    expect(result.stdout).toContain('  2026-10-22 01:40:09Z  ▶ [1/10] Node runtime');
  });

  it('says when nothing was recorded, and ignores a bring-up from another boot', () => {
    const stackDirectory = makeDirectory('stack-timeline-');
    writeFileSync(
      join(stackDirectory, 'timeline'),
      '2026-10-21 09:00:00Z  ▶ [1/10] Node runtime\n',
    );
    writeFileSync(join(stackDirectory, 'timeline.boot_id'), 'another-boot\n');

    const result = runStack({
      command: 'timeline',
      stackDirectory,
      setupTimelineDirectory: makeDirectory('setup-timeline-'),
    });

    expect(result.stdout).toContain(
      '  none recorded — the environment was built before bootstrap.sh kept one',
    );
    expect(result.stdout).toContain(
      '  none in this boot — bash tooling/setup/agent/bootstrap.sh starts one',
    );
    expect(result.stdout).not.toContain('2026-10-21 09:00:00Z');
  });
});

/**
 * `pnpm dev:stack:status` carries what used to take a separate look: the session-start checks'
 * last results, and the settings file this session's hooks load from.
 */
describe('stack.sh status', () => {
  it("shows the session-start checks from the hooks' own state directory, and where the hooks load from", () => {
    const temporaryDirectory = makeDirectory('stack-status-');
    // The directory the hooks use under this TMPDIR, read the way stack.sh reads it.
    const hookStateDirectory = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'console.log((await import(process.argv[1])).hookStateDirectory)',
        join(process.cwd(), 'agent-os/hooks/_be-hook.mjs'),
      ],
      { encoding: 'utf8', env: { ...process.env, TMPDIR: temporaryDirectory } },
    ).stdout.trim();
    mkdirSync(join(hookStateDirectory, 'probes'), { recursive: true });
    writeFileSync(join(hookStateDirectory, 'probes', 'agent-os-check'), 'passed at 10:00:00Z\n');
    writeFileSync(join(hookStateDirectory, 'probes', 'tool-pins'), '5/5 at pin\n');

    const result = runStack({
      command: 'status',
      stackDirectory: makeDirectory('stack-timeline-'),
      setupTimelineDirectory: makeDirectory('setup-timeline-'),
      temporaryDirectory,
    });

    expect(hookStateDirectory.startsWith(temporaryDirectory)).toBe(true);
    expect(result.stdout).toContain(
      '  checks     agent-os:check passed at 10:00:00Z · tool pins 5/5 at pin',
    );
    expect(result.stdout).toMatch(/\n {2}hooks {6}\/\S+\/\.claude\/settings\.json/);
  });
});
