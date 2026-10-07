import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LIBRARY = join(process.cwd(), 'tooling/setup/agent/tool-install.lib.sh');

/** Runs `script` in bash with tool-install.lib.sh sourced; returns exit code + output. */
function runWithLibrary(options: { script: string; environment?: Record<string, string> }): {
  code: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(
    'bash',
    ['-c', `set -uo pipefail; source "${LIBRARY}"; ${options.script}`],
    {
      encoding: 'utf8',
      env: { ...process.env, ...options.environment },
    },
  );
  return { code: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}

/** A temporary directory holding an executable named `name` that prints `output`. */
function fakeCommand(options: { name: string; output: string }): string {
  const directory = mkdtempSync(join(tmpdir(), 'agent-tool-'));
  const path = join(directory, options.name);
  writeFileSync(path, `#!/bin/sh\necho '${options.output}'\n`);
  chmodSync(path, 0o755);
  return directory;
}

/**
 * The shell helpers every `install-*.sh` sources: a pin lookup that an environment variable
 * overrides, the installed-version reader that decides "move to the pin", the checksum gate
 * in front of every release-binary install, and the Linux-only guard for those binaries.
 */
describe('tool-install.lib.sh', () => {
  it('pinned_version reads tool-versions.sh, and an environment variable overrides it', () => {
    expect(runWithLibrary({ script: 'pinned_version K6_VERSION' }).stdout).toMatch(
      /^\d+\.\d+\.\d+$/,
    );
    expect(
      runWithLibrary({ script: 'pinned_version K6_VERSION', environment: { K6_VERSION: '9.9.9' } })
        .stdout,
    ).toBe('9.9.9');
    expect(runWithLibrary({ script: 'pinned_version NOT_A_PINNED_KEY' }).stdout).toBe('');
  });

  it('installed_version takes the first x.y.z the command prints, empty when it is missing', () => {
    const directory = fakeCommand({
      name: 'faketool',
      output: 'faketool v2.3.0 (commit/abc, go1.26.8, linux/amd64)',
    });
    const environment = { PATH: `${directory}:${process.env.PATH ?? ''}` };
    expect(
      runWithLibrary({ script: 'installed_version faketool version', environment }).stdout,
    ).toBe('2.3.0');
    expect(runWithLibrary({ script: 'installed_version no-such-tool --version' }).stdout).toBe('');
  });

  it('download_verified keeps a download whose SHA-256 matches the pin', () => {
    const directory = mkdtempSync(join(tmpdir(), 'agent-tool-'));
    const source = join(directory, 'release.tar.gz');
    writeFileSync(source, 'release bytes');
    const hash = createHash('sha256').update('release bytes').digest('hex');
    const destination = join(directory, 'downloaded');
    const result = runWithLibrary({
      script: `download_verified "file://${source}" "${destination}" ${hash}`,
    });
    expect(result.code).toBe(0);
    expect(existsSync(destination)).toBe(true);
  });

  it('download_verified refuses — and deletes — a download whose SHA-256 differs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'agent-tool-'));
    const source = join(directory, 'release.tar.gz');
    writeFileSync(source, 'tampered bytes');
    const destination = join(directory, 'downloaded');
    const result = runWithLibrary({
      script: `download_verified "file://${source}" "${destination}" ${'0'.repeat(64)}`,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('SHA-256 mismatch');
    expect(existsSync(destination)).toBe(false);
  });

  it('download_verified refuses a binary with no pinned SHA-256 at all', () => {
    const directory = mkdtempSync(join(tmpdir(), 'agent-tool-'));
    const result = runWithLibrary({
      script: `download_verified "file://${directory}/missing" "${directory}/out" ""`,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('refusing to install an unverified binary');
  });

  it('require_linux stops a Linux release binary from landing on another OS', () => {
    const darwin = fakeCommand({ name: 'uname', output: 'Darwin' });
    const onMac = runWithLibrary({
      script: 'require_linux k6 2.3.0',
      environment: { PATH: `${darwin}:${process.env.PATH ?? ''}` },
    });
    expect(onMac.code).toBe(1);
    expect(onMac.stderr).toContain('not Linux');
    const linux = fakeCommand({ name: 'uname', output: 'Linux' });
    expect(
      runWithLibrary({
        script: 'require_linux k6 2.3.0',
        environment: { PATH: `${linux}:${process.env.PATH ?? ''}` },
      }).code,
    ).toBe(0);
  });
});
