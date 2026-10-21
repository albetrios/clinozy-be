import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const BOOT_ID = '/proc/sys/kernel/random/boot_id';
const temporaryDirectories: string[] = [];
const processes: ChildProcess[] = [];

function makeStackDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'stack-lock-'));
  temporaryDirectories.push(directory);
  return directory;
}

/** Writes `lock/pid` (and `lock/boot_id` unless null) the way bootstrap.sh does. */
function writeLock({
  stackDirectory,
  pid,
  bootId,
}: {
  stackDirectory: string;
  pid: number;
  bootId: string | null;
}): void {
  mkdirSync(join(stackDirectory, 'lock'), { recursive: true });
  writeFileSync(join(stackDirectory, 'lock', 'pid'), `${pid}\n`);
  if (bootId !== null) writeFileSync(join(stackDirectory, 'lock', 'boot_id'), `${bootId}\n`);
}

/** A process that lives for the test; `bootstrap` names its script bootstrap.sh. */
function startProcess({ bootstrap }: { bootstrap: boolean }): number {
  const directory = makeStackDirectory();
  const script = join(directory, bootstrap ? 'bootstrap.sh' : 'other.sh');
  writeFileSync(script, 'sleep 30\n');
  const child = spawn('/bin/bash', [script], { stdio: 'ignore' });
  processes.push(child);
  if (child.pid === undefined) throw new Error('process did not start');
  return child.pid;
}

function lockHolder(stackDirectory: string) {
  return spawnSync(
    '/bin/bash',
    [
      '-c',
      'source tooling/setup/agent/stack-lock.lib.sh && stack_lock_holder "$1"',
      'holder',
      stackDirectory,
    ],
    { encoding: 'utf8' },
  );
}

afterEach(() => {
  for (const child of processes.splice(0)) child.kill('SIGKILL');
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.runIf(process.platform === 'linux')('tooling/setup/agent/stack-lock.lib.sh', () => {
  const currentBoot = () => readFileSync(BOOT_ID, 'utf8').trim();

  it('a live bootstrap.sh from this boot holds the lock', () => {
    const stackDirectory = makeStackDirectory();
    const pid = startProcess({ bootstrap: true });
    writeLock({ stackDirectory, pid, bootId: currentBoot() });
    const result = lockHolder(stackDirectory);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(String(pid));
  });

  it('a lock written before boot ids were recorded still counts while bootstrap.sh runs', () => {
    const stackDirectory = makeStackDirectory();
    const pid = startProcess({ bootstrap: true });
    writeLock({ stackDirectory, pid, bootId: null });

    expect(lockHolder(stackDirectory).status).toBe(0);
  });

  it.each([
    ['there is no lock', () => ({ write: false, pid: 0, bootId: null as string | null })],
    [
      'its pid is gone',
      () => ({
        write: true,
        pid: spawnSync('/bin/true').pid,
        bootId: currentBoot() as string | null,
      }),
    ],
    [
      'it is from another boot',
      () => ({
        write: true,
        pid: startProcess({ bootstrap: true }),
        bootId: 'another-boot' as string | null,
      }),
    ],
    [
      'its pid now names another process',
      () => ({
        write: true,
        pid: startProcess({ bootstrap: false }),
        bootId: currentBoot() as string | null,
      }),
    ],
  ])('the lock is free or stale when %s', (_case, makeLock) => {
    const stackDirectory = makeStackDirectory();
    const { write, pid, bootId } = makeLock();
    if (write) writeLock({ stackDirectory, pid, bootId });
    const result = lockHolder(stackDirectory);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });

  it('stack.sh status calls a dead bring-up stale instead of in progress', () => {
    const stackDirectory = makeStackDirectory();
    writeLock({ stackDirectory, pid: spawnSync('/bin/true').pid, bootId: currentBoot() });
    writeFileSync(join(stackDirectory, 'status'), '18:34:15Z  running [3/10] Docker\n');
    writeFileSync(join(stackDirectory, 'status.boot_id'), `${currentBoot()}\n`);
    const result = spawnSync('/bin/bash', ['tooling/setup/agent/stack.sh', 'status'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        AGENT_STACK_DIR: stackDirectory,
        PORT: '1',
        WORKER_HEALTH_PORT: '1',
        FRONTEND_URL: 'http://127.0.0.1:1',
      },
    });

    expect(result.stdout).toContain('(stale — no bring-up is running)');
    expect(result.stdout).toContain('lock       stale');
    expect(result.stdout).not.toContain('bring-up in progress');
  });
});
