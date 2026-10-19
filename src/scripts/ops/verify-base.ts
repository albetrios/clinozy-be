/**
 * End-to-end verify gate: migrate → database logins → minimal seed → full seed → API smoke →
 * validate.
 *
 * Prerequisites:
 * - `docker compose up -d` (Postgres + Redis for migrate, seed, and server)
 * - Optional: `pnpm compose:wait` after compose up so Postgres is ready before migrate.
 * - Set `DEMO_PASSWORD` in `.env` to match smoke defaults (e.g. DemoPassword123!),
 *   otherwise full seed may generate a random demo password and login will fail.
 *
 * Usage: pnpm verify:base
 * Verbose server logs: VERIFY_BASE_VERBOSE=1 pnpm verify:base
 */
import '@/shared/config/load-env-files.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { DATABASE_URL_KEYS } from '@/infrastructure/database/utils/connection-url.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { listProcessTree, signalProcesses } from './process-tree.util.js';

const BASE_URL_FOR_HEALTH = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const HEALTH_URL = `${BASE_URL_FOR_HEALTH}/readyz`;
const POLL_INTERVAL_MILLISECONDS = 500;
const HEALTH_CHECK_TIMEOUT_MILLISECONDS = 1000;
const READY_WAIT_TIMEOUT_MILLISECONDS = 60_000;
const TEARDOWN_GRACE_MILLISECONDS = 5000;

const spawnedChildProcesses: ChildProcess[] = [];

const envLocalPath = resolve(process.cwd(), '.env.local');
/** The database URLs this process loaded from `.env.local`, before the logins step rewrites them. */
const databaseUrlsFromEnvLocal = existsSync(envLocalPath)
  ? dotenv.parse(readFileSync(envLocalPath, 'utf8'))
  : {};

/**
 * This process's environment minus the database URLs it took from `.env.local`, so every step
 * reads the current file itself — the logins step switches them onto the role logins mid-run. A
 * value set outside the file (a shell export) is kept.
 */
function childEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of DATABASE_URL_KEYS) {
    if (environment[key] !== undefined && environment[key] === databaseUrlsFromEnvLocal[key]) {
      delete environment[key];
    }
  }
  return environment;
}

let didRegisterSignalHandlers = false;

function isVerboseDevLogs(): boolean {
  return process.env.VERIFY_BASE_VERBOSE === '1';
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** Every process under the spawned dev server and worker, roots included. */
function spawnedProcessTrees(): number[] {
  return spawnedChildProcesses.flatMap((child) =>
    child.pid === undefined ? [] : listProcessTree(child.pid),
  );
}

function registerSignalHandlersForTeardown(): void {
  if (didRegisterSignalHandlers) {
    return;
  }
  didRegisterSignalHandlers = true;
  const teardownSynchronously = (): void => {
    signalProcesses({ processIds: spawnedProcessTrees(), signal: 'SIGTERM' });
  };
  process.on('SIGINT', () => {
    teardownSynchronously();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    teardownSynchronously();
    process.exit(143);
  });
}

function runPnpmStep({
  stepName,
  pnpmArguments,
}: {
  stepName: string;
  pnpmArguments: string[];
}): Promise<void> {
  const startedAt = performance.now();
  logger.info({ stepName, pnpmArguments }, 'verify.base: step start');
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', pnpmArguments, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: childEnvironment(),
    });
    child.once('error', (error) => {
      reject(error);
    });
    child.once('close', (exitCode) => {
      if (exitCode === 0) {
        logger.info(
          { stepName, durationMs: Math.round(performance.now() - startedAt) },
          'verify.base: step done',
        );
        resolve();
      } else {
        reject(new Error(`${stepName} exited with code ${exitCode ?? 'unknown'}`));
      }
    });
  });
}

async function fetchHealthReadyOk(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, HEALTH_CHECK_TIMEOUT_MILLISECONDS);
  try {
    const response = await fetch(HEALTH_URL, { signal: controller.signal });
    return response.ok && response.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function waitForServerReady(): Promise<void> {
  const deadline = Date.now() + READY_WAIT_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    if (await fetchHealthReadyOk()) {
      logger.info('verify.base: server ready');
      return;
    }
    await sleep(POLL_INTERVAL_MILLISECONDS);
  }
  throw new Error(
    `Server did not become ready within ${READY_WAIT_TIMEOUT_MILLISECONDS / 1000}s (${HEALTH_URL})`,
  );
}

async function teardownSpawnedProcesses(): Promise<void> {
  if (spawnedChildProcesses.length === 0) {
    return;
  }
  logger.info('verify.base: stopping spawned dev processes');
  // The whole trees, snapshotted before the first signal: pnpm runs the script in a process group
  // of its own, so signalling pnpm alone left the API listening on its port.
  const processIds = spawnedProcessTrees();
  signalProcesses({ processIds, signal: 'SIGTERM' });
  await sleep(TEARDOWN_GRACE_MILLISECONDS);
  signalProcesses({ processIds, signal: 'SIGKILL' });
  spawnedChildProcesses.length = 0;
}

async function ensureServerRunning(): Promise<void> {
  if (await fetchHealthReadyOk()) {
    logger.info('verify.base: using existing server (health ready)');
    return;
  }

  registerSignalHandlersForTeardown();

  const stdioMode = isVerboseDevLogs() ? 'inherit' : 'ignore';

  logger.info('verify.base: starting pnpm dev and pnpm dev:worker in background');

  const developmentServer = spawn('pnpm', ['dev'], {
    cwd: process.cwd(),
    stdio: stdioMode,
    shell: process.platform === 'win32',
    env: childEnvironment(),
  });
  const workerProcess = spawn('pnpm', ['dev:worker'], {
    cwd: process.cwd(),
    stdio: stdioMode,
    shell: process.platform === 'win32',
    env: childEnvironment(),
  });

  spawnedChildProcesses.push(developmentServer, workerProcess);

  for (const child of [developmentServer, workerProcess]) {
    child.once('error', (error) => {
      logger.error({ error }, 'verify.base: child process error');
    });
  }

  await waitForServerReady();
}

async function main(): Promise<void> {
  registerSignalHandlersForTeardown();

  logger.info('verify.base: starting gate');
  const gateStartedAt = performance.now();

  try {
    // The one database step: create, migrate, the logins the migrations create, the full seed.
    await runPnpmStep({ stepName: 'db:seed:full', pnpmArguments: ['db:seed:full'] });
    await ensureServerRunning();
    await runPnpmStep({ stepName: 'test:api-smoke', pnpmArguments: ['test:api-smoke'] });
  } finally {
    await teardownSpawnedProcesses();
  }

  await runPnpmStep({ stepName: 'validate', pnpmArguments: ['validate'] });

  logger.info(
    { durationMs: Math.round(performance.now() - gateStartedAt) },
    'verify.base: gate completed successfully',
  );
}

main().catch((error) => {
  logger.error({ error }, 'verify.base: gate failed');
  process.exit(1);
});
