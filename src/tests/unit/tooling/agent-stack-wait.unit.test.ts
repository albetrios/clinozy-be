import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const BOOT_ID = '/proc/sys/kernel/random/boot_id';
const temporaryDirectories: string[] = [];
const servers: Server[] = [];

function makeStackDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'stack-wait-'));
  temporaryDirectories.push(directory);
  return directory;
}

/** Writes the status line the way bootstrap.sh does: one line, stamped with a boot id. */
function writeStatus({
  stackDirectory,
  line,
  bootId,
}: {
  stackDirectory: string;
  line: string;
  bootId: string;
}): void {
  writeFileSync(join(stackDirectory, 'status'), `${line}\n`);
  writeFileSync(join(stackDirectory, 'status.boot_id'), `${bootId}\n`);
}

/** An API stand-in that answers GET /livez with 200; its port. */
async function startLiveApi(): Promise<number> {
  const server = createServer((request, response) => {
    response.statusCode = request.url === '/livez' ? 200 : 404;
    response.end('{}');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/** Runs `stack.sh <command>` without blocking this process (the stand-in API must answer). */
function runStack({
  command,
  stackDirectory,
  port = 1,
}: {
  command: string;
  stackDirectory: string;
  port?: number;
}): Promise<{ status: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('/bin/bash', ['tooling/setup/agent/stack.sh', command], {
      env: {
        ...process.env,
        AGENT_STACK_DIR: stackDirectory,
        PORT: String(port),
        WORKER_HEALTH_PORT: '1',
        FRONTEND_URL: 'http://127.0.0.1:1',
        STACK_WAIT_GRACE_SECONDS: '0',
        STACK_WAIT_SECONDS: '20',
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('close', (status) => resolve({ status, output }));
  });
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * `pnpm dev:stack:wait` is what an agent runs before database or API work, so it must never say
 * "live" for a stack that is not: a status line from before a pause (the container resumes with
 * the file but none of the processes) reads as no status, and "live" also needs the API to answer.
 */
describe.runIf(process.platform === 'linux')(
  'stack.sh wait and the boot-stamped status line',
  () => {
    const currentBoot = () => readFileSync(BOOT_ID, 'utf8').trim();

    it('returns 0 once this boot went live and the API answers', async () => {
      const stackDirectory = makeStackDirectory();
      const port = await startLiveApi();
      writeStatus({
        stackDirectory,
        line: '14:12:17Z  live — API · worker',
        bootId: currentBoot(),
      });

      const result = await runStack({ command: 'wait', stackDirectory, port });

      expect(result.status).toBe(0);
      expect(result.output).toContain('stack: live');
    });

    it('never trusts a "live" line written in another boot', async () => {
      const stackDirectory = makeStackDirectory();
      const port = await startLiveApi();
      writeStatus({
        stackDirectory,
        line: '13:39:20Z  live — API · worker',
        bootId: 'another-boot',
      });

      const result = await runStack({ command: 'wait', stackDirectory, port });

      expect(result.status).toBe(1);
      expect(result.output).toContain('no bring-up is running in this boot');
    });

    it('fails a "live" stack whose API no longer answers', async () => {
      const stackDirectory = makeStackDirectory();
      writeStatus({
        stackDirectory,
        line: '14:12:17Z  live — API · worker',
        bootId: currentBoot(),
      });

      const result = await runStack({ command: 'wait', stackDirectory });

      expect(result.status).toBe(1);
      expect(result.output).toContain('does not answer now');
    });

    it('fails with the step and the log tail when the bring-up failed', async () => {
      const stackDirectory = makeStackDirectory();
      writeStatus({
        stackDirectory,
        line: '13:29:48Z  failed — db:migrate failed',
        bootId: currentBoot(),
      });
      writeFileSync(join(stackDirectory, 'bootstrap.log'), '✗ create: no pg_hba.conf entry\n');

      const result = await runStack({ command: 'wait', stackDirectory });

      expect(result.status).toBe(1);
      expect(result.output).toContain('failed — db:migrate failed');
      expect(result.output).toContain('no pg_hba.conf entry');
    });

    it('fails at once when a "running" line has no bring-up behind it', async () => {
      const stackDirectory = makeStackDirectory();
      writeStatus({
        stackDirectory,
        line: '14:00:00Z  running [5/10] Postgres',
        bootId: currentBoot(),
      });

      const started = Date.now();
      const result = await runStack({ command: 'wait', stackDirectory });

      expect(result.status).toBe(1);
      expect(Date.now() - started).toBeLessThan(10_000);
    });

    it('status says a line from another boot is no bring-up of this one', async () => {
      const stackDirectory = makeStackDirectory();
      writeStatus({
        stackDirectory,
        line: '13:39:20Z  live — API · worker',
        bootId: 'another-boot',
      });

      const result = await runStack({ command: 'status', stackDirectory });

      expect(result.output).toContain('bring-up   none in this boot');
      expect(result.output).toContain('SonarQube  backend :9000');
      expect(result.output).toContain('frontend   http://127.0.0.1:1  not serving');
    });
  },
);
