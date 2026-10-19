#!/usr/bin/env tsx
/**
 * `pnpm setup:local` — one-command local bootstrap.
 *
 * Idempotent end-to-end flow: preflight → dependencies → env (`.env.local`) →
 * Docker (postgres + redis) → migrations → local database logins → optional
 * seed/worker/toxiproxy → start `pnpm dev`. Every phase is re-run safe: each step
 * checks its own "already done" state and reports "skipped".
 *
 * Usage:
 *   pnpm setup:local
 *   pnpm setup:local --seed minimal
 *   pnpm setup:local --seed full --with-worker
 *   pnpm setup:local --with-toxiproxy
 *   pnpm setup:local --no-start                 (bootstrap only, skip dev)
 *   pnpm setup:local --check                    (preflight only, no mutations)
 *   pnpm setup:local --skip-deps --skip-docker  (granular skips)
 *   pnpm setup:local --skip-codegraph           (skip the CodeGraph agent index)
 *   pnpm setup:local --skip-mac-tools           (skip the macOS external-tool install/upgrade)
 *   pnpm setup:local --skip-mcp                  (skip MCP setup: CodeGraph + Headroom + .mcp.json)
 *   pnpm setup:local --only-env                  (scaffold .env.local only, then exit)
 *   pnpm setup:local --only-env --with-captcha   (turn local CAPTCHA on — Cloudflare test keys)
 *   pnpm setup:local --only-env --without-captcha (turn it back off — the default)
 *
 * Never overwrites a real credential. A missing `.env.local` is scaffolded self-contained
 * (`.env.example` + a generated RS256 JWT keypair + SECRETS_ENCRYPTION_KEY + localhost DB/Redis
 * URLs); an existing one is only rewritten with `--force-env-local`, and otherwise just gets the
 * targeted updates below. `--only-env` runs the env steps and exits — used by the cloud-agent
 * bootstrap (`tooling/setup/agent/bootstrap.sh`). The database — create, migrate, the logins, the
 * seed — is one step, `pnpm db:migrate` / `db:seed` / `db:seed:full` (`src/scripts/ops/db-prepare.ts`).
 *
 * Targeted `.env.local` updates, every run:
 * - Third-party API keys (Stripe, Resend, S3, PostHog — `external-credentials.ts`)
 *   still on their `.env.example` placeholder are copied from the hosted development target's env
 *   file, else from the process environment; key names are printed, never values.
 * - `--with-captcha` / `--without-captcha` turn local CAPTCHA on (Cloudflare test keys) or off.
 * - The database logins the migrations create (`local-database-logins.ts`) are enabled and their
 *   URLs written — by the database step, which runs after the migrations create those roles.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { AGENT_TOOLS, readInstalledVersion, readToolVersions } from './agent-tools.js';
import { ensureDefaultMcpServers } from './mcp-config.js';
import {
  EXTERNAL_CREDENTIALS,
  EXTERNAL_CREDENTIAL_SOURCE,
  fillExternalCredentials,
} from './external-credentials.js';
import { upsertEnvAssignment } from './env-file.util.js';
import { applyLocalCaptcha, TURNSTILE_ALWAYS_PASS_TEST_SITE_KEY } from './local-captcha.js';
import { environmentConnectionUrlProblems, localDatabase } from './local-database-logins.js';
import { isLocalDatabaseUrl } from '@/infrastructure/database/utils/connection-url.util.js';
import { listProcessTree, signalProcesses } from '@/scripts/ops/process-tree.util.js';
import dotenv from 'dotenv';
import { resolveDerivedNames } from '@tooling/setup/codegen/project-identity.util.js';
import { loadConfig } from '@tooling/setup/common/config.js';

const PROJECT_ROOT = process.cwd();
/** The machine-local env file every env step reads and updates. */
const ENV_LOCAL_PATH = resolve(PROJECT_ROOT, '.env.local');
const REQUIRED_NODE_MAJOR = 24;
const SETUP_CONFIG = loadConfig();
const PROJECT_DISPLAY_NAME = SETUP_CONFIG.project.displayName;
const { containers: LOCAL_CONTAINERS } = resolveDerivedNames(SETUP_CONFIG);
const { superuserUrl: LOCAL_DATABASE_URL, logins: LOCAL_DATABASE_LOGINS } = localDatabase();
const POSTGRES_CONTAINER = LOCAL_CONTAINERS.postgres;
const REDIS_CONTAINER = LOCAL_CONTAINERS.redis;
const DEFAULT_DEV_PORT = 3000;

type StepStatus = 'done' | 'skipped' | 'warning' | 'failed';

interface StepReport {
  phase: string;
  status: StepStatus;
  detail?: string;
  elapsedMs: number;
}

interface BootstrapOptions {
  check: boolean;
  noStart: boolean;
  skipDeps: boolean;
  skipDocker: boolean;
  skipMigrate: boolean;
  skipCodegraph: boolean;
  skipMcp: boolean;
  skipMacTools: boolean;
  forceEnvLocal: boolean;
  onlyEnv: boolean;
  /** `--with-captcha` / `--without-captcha`: turn local CAPTCHA enforcement on or off. */
  captcha: 'on' | 'off' | 'unchanged';
  seed: 'none' | 'minimal' | 'full';
  withWorker: boolean;
  withToxiproxy: boolean;
}

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

function symbolForStatus(status: StepStatus): string {
  switch (status) {
    case 'done':
      return `${ANSI.green}✓${ANSI.reset}`;
    case 'skipped':
      return `${ANSI.gray}○${ANSI.reset}`;
    case 'warning':
      return `${ANSI.yellow}!${ANSI.reset}`;
    case 'failed':
      return `${ANSI.red}✗${ANSI.reset}`;
  }
}

function logInfo(message: string): void {
  process.stdout.write(`  ${message}\n`);
}

function logHeading(message: string): void {
  process.stdout.write(`\n${ANSI.bold}${ANSI.cyan}${message}${ANSI.reset}\n`);
}

function logBanner(): void {
  const width = 58;
  const line = '═'.repeat(width);
  // Pad on the visible text only — the ANSI escapes occupy no display columns,
  // so they must be added after padEnd or the box edge drifts.
  const title = `${PROJECT_DISPLAY_NAME} — local bootstrap (pnpm setup:local)`;
  process.stdout.write(`\n╔${line}╗\n`);
  process.stdout.write(
    `║  ${ANSI.bold}${title}${ANSI.reset}${' '.repeat(Math.max(0, width - title.length - 3))}║\n`,
  );
  process.stdout.write(`║  Docker + env + migrate + dev in one command             ║\n`);
  process.stdout.write(`╚${line}╝\n`);
}

function reportStep(
  reports: StepReport[],
  phase: string,
  status: StepStatus,
  startedAtMs: number,
  detail?: string,
): void {
  const elapsedMs = Math.round(performance.now() - startedAtMs);
  reports.push({
    phase,
    status,
    elapsedMs,
    ...(detail !== undefined ? { detail } : {}),
  });
  const elapsedLabel = elapsedMs < 100 ? '' : `${ANSI.dim}(${elapsedMs}ms)${ANSI.reset}`;
  const detailLabel = detail ? ` ${ANSI.dim}— ${detail}${ANSI.reset}` : '';
  process.stdout.write(`  ${symbolForStatus(status)} ${phase}${detailLabel} ${elapsedLabel}\n`);
}

function parseArgs(): BootstrapOptions {
  const argv = process.argv.slice(2);
  const has = (flag: string): boolean => argv.includes(flag);
  const valueForFlag = (flag: string): string | undefined => {
    const inline = argv.find((arg) => arg.startsWith(`${flag}=`));
    if (inline) return inline.slice(flag.length + 1);
    const positional = argv.indexOf(flag);
    if (positional >= 0) {
      const next = argv[positional + 1];
      if (next && !next.startsWith('--')) return next;
    }
    return undefined;
  };

  const rawSeed = valueForFlag('--seed');
  let seed: BootstrapOptions['seed'] = 'none';
  if (has('--seed') && rawSeed === undefined) seed = 'minimal';
  else if (rawSeed === 'minimal' || rawSeed === 'full') seed = rawSeed;
  else if (rawSeed !== undefined) {
    process.stderr.write(`Invalid --seed value: ${rawSeed}. Expected minimal | full.\n`);
    process.exit(2);
  }

  return {
    check: has('--check'),
    noStart: has('--no-start'),
    skipDeps: has('--skip-deps'),
    skipDocker: has('--skip-docker'),
    skipMigrate: has('--skip-migrate'),
    skipCodegraph: has('--skip-codegraph'),
    skipMcp: has('--skip-mcp'),
    skipMacTools: has('--skip-mac-tools'),
    forceEnvLocal: has('--force-env-local'),
    onlyEnv: has('--only-env'),
    captcha: has('--with-captcha') ? 'on' : has('--without-captcha') ? 'off' : 'unchanged',
    seed,
    withWorker: has('--with-worker'),
    withToxiproxy: has('--with-toxiproxy'),
  };
}

function runCommand(
  command: string,
  args: string[],
  silent = false,
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: silent ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function captureCommand(
  command: string,
  args: string[],
): { code: number; stdout: string; stderr: string } {
  return runCommand(command, args, true);
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const tester = createServer()
      .once('error', () => resolvePromise(true))
      .once('listening', () => {
        tester.close(() => resolvePromise(false));
      })
      .listen(port, '127.0.0.1');
  });
}

interface ContainerState {
  exists: boolean;
  running: boolean;
  health: 'healthy' | 'unhealthy' | 'starting' | 'none' | 'unknown';
}

function inspectContainer(name: string): ContainerState {
  const result = captureCommand('docker', [
    'inspect',
    '--format',
    '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
    name,
  ]);
  if (result.code !== 0) return { exists: false, running: false, health: 'none' };
  const [status = '', health = 'unknown'] = result.stdout.trim().split('|');
  return {
    exists: true,
    running: status === 'running',
    health: (health || 'unknown') as ContainerState['health'],
  };
}

function runPreflight(reports: StepReport[], options: BootstrapOptions): void {
  logHeading('1/8 Preflight');

  const nodeStartedAt = performance.now();
  const nodeMajor = Number(process.versions.node.split('.')[0] ?? 0);
  if (Number.isNaN(nodeMajor) || nodeMajor < REQUIRED_NODE_MAJOR) {
    reportStep(
      reports,
      `Node ${process.versions.node}`,
      'failed',
      nodeStartedAt,
      `requires Node >= ${REQUIRED_NODE_MAJOR} (engines.node)`,
    );
    process.exit(1);
  }
  reportStep(reports, `Node ${process.versions.node}`, 'done', nodeStartedAt);

  const pnpmStartedAt = performance.now();
  const pnpmVersionResult = captureCommand('pnpm', ['--version']);
  if (pnpmVersionResult.code !== 0) {
    reportStep(
      reports,
      'pnpm CLI',
      'failed',
      pnpmStartedAt,
      'pnpm not found — install via corepack enable && corepack prepare pnpm@latest --activate',
    );
    process.exit(1);
  }
  const installedPnpm = pnpmVersionResult.stdout.trim();
  let pnpmDetail = `v${installedPnpm}`;
  let pnpmStatus: StepStatus = 'done';
  const latestPnpm = fetchLatestPnpmVersion();
  if (latestPnpm && installedPnpm !== latestPnpm) {
    pnpmDetail = `v${installedPnpm} — newer v${latestPnpm} available (corepack prepare pnpm@${latestPnpm} --activate)`;
    pnpmStatus = 'warning';
  }
  reportStep(reports, 'pnpm CLI', pnpmStatus, pnpmStartedAt, pnpmDetail);

  // External tools (macOS only for now): install-or-upgrade Homebrew, Node, gitleaks,
  // gh, jq, uv, pipx, codegraph, headroom, and a headless docker runtime — all from
  // authenticated sources, non-interactively. Runs BEFORE the Docker check so a fresh
  // machine gets a runtime (colima) before that gate. Idempotent + skippable.
  if (process.platform === 'darwin' && !options.skipMacTools) {
    const toolsStartedAt = performance.now();
    const toolsResult = runCommand('bash', [
      'tooling/dev/setup-mac-tools.sh',
      ...(options.check ? ['--check'] : []),
    ]);
    reportStep(
      reports,
      'External tools (macOS)',
      toolsResult.code === 0 ? 'done' : 'warning',
      toolsStartedAt,
      toolsResult.code === 0 ? undefined : 'some tools did not install/upgrade — see output',
    );
  }

  const dockerStartedAt = performance.now();
  const dockerInfo = captureCommand('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (dockerInfo.code !== 0) {
    reportStep(
      reports,
      'Docker daemon',
      'failed',
      dockerStartedAt,
      'Docker daemon is not reachable — start Docker Desktop / OrbStack first',
    );
    process.exit(1);
  }
  reportStep(
    reports,
    'Docker daemon',
    'done',
    dockerStartedAt,
    `engine ${dockerInfo.stdout.trim()}`,
  );
}

function fetchLatestPnpmVersion(): string | null {
  const result = captureCommand('npm', ['view', 'pnpm', 'version']);
  if (result.code !== 0) return null;
  const version = result.stdout.trim();
  return /^\d+\.\d+\.\d+/.test(version) ? version : null;
}

function runInstallDependencies(reports: StepReport[], options: BootstrapOptions): void {
  logHeading('2/8 Dependencies');
  const startedAt = performance.now();
  if (options.skipDeps) {
    reportStep(reports, 'pnpm install', 'skipped', startedAt, '--skip-deps');
    return;
  }
  const nodeModulesPath = resolve(PROJECT_ROOT, 'node_modules');
  if (existsSync(nodeModulesPath) && statSync(nodeModulesPath).isDirectory()) {
    reportStep(
      reports,
      'pnpm install',
      'skipped',
      startedAt,
      'node_modules/ present (run pnpm install manually to refresh)',
    );
    return;
  }
  if (options.check) {
    reportStep(reports, 'pnpm install', 'skipped', startedAt, '--check mode (would install)');
    return;
  }
  const result = runCommand('pnpm', ['install', '--frozen-lockfile']);
  if (result.code !== 0) {
    reportStep(
      reports,
      'pnpm install',
      'failed',
      startedAt,
      'pnpm install --frozen-lockfile failed',
    );
    process.exit(1);
  }
  reportStep(reports, 'pnpm install', 'done', startedAt);
}

function runEnvScaffolding(reports: StepReport[], options: BootstrapOptions): void {
  logHeading('3/8 Environment (.env.local)');
  scaffoldEnvLocal(reports, options);
  checkEnvironmentConnectionUrls(reports, options);
  syncExternalCredentials(reports, options);
  configureLocalCaptcha(reports, options);
}

/**
 * `--with-captcha` / `--without-captcha`: turns local CAPTCHA enforcement on (Cloudflare's
 * always-pass test keys — the real widget and verify call on localhost) or off (the default).
 * Without either flag, `.env.local` keeps whatever it has.
 */
function configureLocalCaptcha(reports: StepReport[], options: BootstrapOptions): void {
  if (options.captcha === 'unchanged') return;
  const startedAt = performance.now();
  if (!existsSync(ENV_LOCAL_PATH)) {
    reportStep(reports, 'local CAPTCHA', 'skipped', startedAt, 'no .env.local yet');
    return;
  }
  const enabled = options.captcha === 'on';
  if (options.check) {
    reportStep(
      reports,
      'local CAPTCHA',
      'warning',
      startedAt,
      `--check mode (would turn CAPTCHA ${enabled ? 'on' : 'off'})`,
    );
    return;
  }
  writeFileSync(ENV_LOCAL_PATH, applyLocalCaptcha(readFileSync(ENV_LOCAL_PATH, 'utf8'), enabled));
  if (!enabled) {
    reportStep(reports, 'local CAPTCHA', 'done', startedAt, 'off (CAPTCHA_PROVIDER=disabled)');
    return;
  }
  reportStep(
    reports,
    'local CAPTCHA',
    'done',
    startedAt,
    'on — Turnstile with the always-pass test secret; k6 / API smoke use the dev bypass header',
  );
  logInfo(
    `      clinozy-fe: set VITE_TURNSTILE_SITE_KEY=${TURNSTILE_ALWAYS_PASS_TEST_SITE_KEY} and leave VITE_CAPTCHA_DISABLED unset.`,
  );
  logInfo('      Restart pnpm dev (and pnpm dev:worker) to apply.');
}

/** Report label for the process environment as a credential source. */
const PROCESS_ENVIRONMENT_LABEL = 'environment variables';

/**
 * Copies the third-party API keys `.env.local` still holds as placeholders — from
 * {@link EXTERNAL_CREDENTIAL_SOURCE} when it is present, otherwise (per key) from the process
 * environment (shell exports, CI or cloud variables) — and lists the ones that still need a real
 * value. Runs on a fresh and an existing `.env.local` alike; prints key names, never values.
 */
function syncExternalCredentials(reports: StepReport[], options: BootstrapOptions): void {
  const startedAt = performance.now();
  const examplePath = resolve(PROJECT_ROOT, '.env.example');
  if (!(existsSync(ENV_LOCAL_PATH) && existsSync(examplePath))) {
    reportStep(reports, 'third-party API keys', 'skipped', startedAt, 'no .env.local yet');
    return;
  }
  const sourcePath = resolve(PROJECT_ROOT, EXTERNAL_CREDENTIAL_SOURCE);
  const sources = [
    ...(existsSync(sourcePath)
      ? [
          {
            label: EXTERNAL_CREDENTIAL_SOURCE,
            values: dotenv.parse(readFileSync(sourcePath, 'utf8')),
          },
        ]
      : []),
    { label: PROCESS_ENVIRONMENT_LABEL, values: process.env },
  ];
  const fill = fillExternalCredentials({
    local: readFileSync(ENV_LOCAL_PATH, 'utf8'),
    example: readFileSync(examplePath, 'utf8'),
    sources,
  });
  const changed = fill.copied.length > 0;
  if (changed && !options.check) writeFileSync(ENV_LOCAL_PATH, fill.content);

  const copiedLabel = [
    ...sources.map(({ label }) => {
      const keys = fill.copied.filter((copy) => copy.source === label).map((copy) => copy.key);
      return keys.length > 0
        ? `${options.check ? 'would copy' : 'copied'} from ${label}: ${keys.join(', ')}`
        : '';
    }),
  ]
    .filter(Boolean)
    .join('; ');
  if (fill.missing.length === 0) {
    reportStep(
      reports,
      'third-party API keys',
      changed ? 'done' : 'skipped',
      startedAt,
      copiedLabel || 'all set',
    );
    return;
  }
  reportStep(
    reports,
    'third-party API keys',
    'warning',
    startedAt,
    [
      copiedLabel,
      `${fill.missing.length} still a placeholder (no real value in ${sources.map(({ label }) => label).join(' or ')})`,
    ]
      .filter(Boolean)
      .join('; '),
  );
  for (const key of fill.missing) {
    const integration = EXTERNAL_CREDENTIALS.find(
      (credential) => credential.key === key,
    )?.integration;
    logInfo(`      ${key} — ${integration ?? 'third-party credential'}`);
  }
  logInfo(
    `      Set them in .env.local, export them, or add them to ${EXTERNAL_CREDENTIAL_SOURCE} — then re-run.`,
  );
}

function injectGeneratedSecrets(content: string): string {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const escapedPrivateKey = privateKey.replace(/\n/g, '\\n').trimEnd();
  const escapedPublicKey = publicKey.replace(/\n/g, '\\n').trimEnd();
  const secretsKey = randomBytes(32).toString('hex');

  let updated = content;
  updated = upsertEnvAssignment(updated, 'JWT_PRIVATE_KEY', `"${escapedPrivateKey}"`);
  updated = upsertEnvAssignment(updated, 'JWT_PUBLIC_KEY', `"${escapedPublicKey}"`);
  updated = upsertEnvAssignment(updated, 'SECRETS_ENCRYPTION_KEY', secretsKey);
  return updated;
}

// Localhost DB/Redis values for the `pnpm compose:up` stack. Credentials are
// DERIVED from the manifest, matching the POSTGRES_USER/PASSWORD/DB that
// docker-compose.yml provisions from the same source — hardcoding them here made
// `setup:local` write credentials the compose stack does not accept, so a freshly
// adopted project could never migrate. Local Postgres/Redis are plaintext (no TLS).
// The runtime and maintenance URLs start on the superuser too; once the migrations have
// created the roles, the login step rewrites both onto their RLS-subject logins.
function injectLocalhostOverrides(content: string): string {
  let updated = content;
  updated = upsertEnvAssignment(updated, 'DATABASE_URL', LOCAL_DATABASE_URL);
  updated = upsertEnvAssignment(updated, 'DATABASE_MIGRATION_URL', LOCAL_DATABASE_URL);
  updated = upsertEnvAssignment(updated, 'DATABASE_MAINTENANCE_URL', LOCAL_DATABASE_URL);
  updated = upsertEnvAssignment(updated, 'REDIS_URL', 'redis://localhost:6379');
  updated = upsertEnvAssignment(updated, 'DATABASE_SSL_ENABLED', 'false');
  updated = upsertEnvAssignment(updated, 'DATABASE_SSL_REJECT_UNAUTHORIZED', 'false');
  return updated;
}

function scaffoldEnvLocal(reports: StepReport[], options: BootstrapOptions): void {
  const startedAt = performance.now();
  if (existsSync(ENV_LOCAL_PATH) && !options.forceEnvLocal) {
    reportStep(
      reports,
      '.env.local',
      'skipped',
      startedAt,
      'present (use --force-env-local to rewrite)',
    );
    return;
  }
  if (options.check) {
    reportStep(
      reports,
      '.env.local',
      'warning',
      startedAt,
      '--check mode (would create self-contained .env.local)',
    );
    return;
  }
  const examplePath = resolve(PROJECT_ROOT, '.env.example');
  if (!existsSync(examplePath)) {
    reportStep(reports, '.env.local', 'failed', startedAt, '.env.example missing');
    process.exit(1);
  }
  let content = readFileSync(examplePath, 'utf8');
  content = injectGeneratedSecrets(content);
  content = injectLocalhostOverrides(content);
  writeFileSync(ENV_LOCAL_PATH, content);
  reportStep(
    reports,
    '.env.local',
    'done',
    startedAt,
    'self-contained: .env.example + generated JWT keys/SECRETS_ENCRYPTION_KEY + localhost DB/Redis',
  );
}

/**
 * Stops when the process environment sets a database or Redis URL the local stack must own — a
 * remote host, or a login other than the variable's role (`environmentConnectionUrlProblems`). The
 * environment beats `.env.local`, so a cloud environment's Variables copied from development
 * would otherwise migrate, seed, queue or run maintenance contexts against the hosted database and
 * Redis. Runs in the env phase, before Docker and migrations; skipped when `.env.local`'s
 * `DATABASE_URL` is itself remote.
 */
function checkEnvironmentConnectionUrls(reports: StepReport[], options: BootstrapOptions): void {
  const startedAt = performance.now();
  const phase = 'database and Redis URLs in the environment';
  if (!existsSync(ENV_LOCAL_PATH)) {
    reportStep(reports, phase, 'skipped', startedAt, 'no .env.local yet');
    return;
  }
  const envLocal = readFileSync(ENV_LOCAL_PATH, 'utf8');
  const currentDatabaseUrl = dotenv.parse(envLocal).DATABASE_URL;
  if (currentDatabaseUrl && !isLocalDatabaseUrl(currentDatabaseUrl)) {
    reportStep(reports, phase, 'skipped', startedAt, 'DATABASE_URL points at a remote database');
    return;
  }
  const problems = environmentConnectionUrlProblems({
    envLocal,
    environment: process.env,
    logins: LOCAL_DATABASE_LOGINS,
  });
  if (problems.length === 0) {
    reportStep(reports, phase, 'skipped', startedAt, 'none override .env.local');
    return;
  }
  reportStep(
    reports,
    phase,
    options.check ? 'warning' : 'failed',
    startedAt,
    problems.map(({ envKey, problem }) => `${envKey} ${problem}`).join('; '),
  );
  logInfo(
    '      The environment beats .env.local. Remove these from the environment (the Variables of a cloud environment, or your shell) and re-run.',
  );
  if (!options.check) process.exit(1);
}

function runDocker(reports: StepReport[], options: BootstrapOptions): void {
  logHeading('4/8 Docker Compose (postgres + redis)');
  if (options.skipDocker) {
    const startedAt = performance.now();
    reportStep(reports, 'docker compose', 'skipped', startedAt, '--skip-docker');
    return;
  }

  const postgresStartedAt = performance.now();
  const postgresState = inspectContainer(POSTGRES_CONTAINER);
  startOrSkipContainer(reports, 'postgres', postgresStartedAt, postgresState, options);

  const redisStartedAt = performance.now();
  const redisState = inspectContainer(REDIS_CONTAINER);
  startOrSkipContainer(reports, 'redis', redisStartedAt, redisState, options);

  if (options.withToxiproxy) {
    const toxiStartedAt = performance.now();
    if (options.check) {
      reportStep(reports, 'toxiproxy', 'skipped', toxiStartedAt, '--check mode');
    } else {
      const result = captureCommand('docker', [
        'compose',
        '--profile',
        'chaos',
        'up',
        '-d',
        'toxiproxy',
      ]);
      const status: StepStatus = result.code === 0 ? 'done' : 'warning';
      reportStep(
        reports,
        'toxiproxy',
        status,
        toxiStartedAt,
        result.code === 0 ? 'sidecar up' : 'failed to start',
      );
    }
  }

  const waitStartedAt = performance.now();
  if (options.check) {
    reportStep(reports, 'postgres ready', 'skipped', waitStartedAt, '--check mode');
    return;
  }
  const wait = captureCommand('bash', ['tooling/dev/wait-for-local-postgres.sh']);
  if (wait.code !== 0) {
    reportStep(reports, 'postgres ready', 'failed', waitStartedAt, 'wait script failed');
    process.exit(1);
  }
  reportStep(reports, 'postgres ready', 'done', waitStartedAt);
}

function startOrSkipContainer(
  reports: StepReport[],
  label: string,
  startedAt: number,
  state: ContainerState,
  options: BootstrapOptions,
): void {
  if (state.exists && state.running) {
    reportStep(
      reports,
      `${label} container`,
      'skipped',
      startedAt,
      `already running (health: ${state.health})`,
    );
    return;
  }
  if (options.check) {
    reportStep(reports, `${label} container`, 'warning', startedAt, '--check mode (would start)');
    return;
  }
  if (state.exists && !state.running) {
    const result = captureCommand('docker', ['compose', 'start', label]);
    const status: StepStatus = result.code === 0 ? 'done' : 'failed';
    reportStep(
      reports,
      `${label} container`,
      status,
      startedAt,
      status === 'done' ? 'started existing container' : 'docker compose start failed',
    );
    if (status === 'failed') process.exit(1);
    return;
  }
  const result = captureCommand('docker', ['compose', 'up', '-d', label]);
  const status: StepStatus = result.code === 0 ? 'done' : 'failed';
  reportStep(
    reports,
    `${label} container`,
    status,
    startedAt,
    status === 'done' ? 'created and started' : 'docker compose up failed',
  );
  if (status === 'failed') process.exit(1);
}

/**
 * Prepares the local database the one way every database is set up (`src/scripts/ops/db-prepare.ts`):
 * create, migrate, the database logins, then the seed `--seed` asks for — `pnpm db:migrate`,
 * `pnpm db:seed` or `pnpm db:seed:full`.
 */
function runPrepareDatabase(reports: StepReport[], options: BootstrapOptions): void {
  logHeading('5/8 Database (create, migrate, logins, seed)');
  const startedAt = performance.now();
  const script = { none: 'db:migrate', minimal: 'db:seed', full: 'db:seed:full' }[options.seed];
  if (options.skipMigrate) {
    reportStep(reports, script, 'skipped', startedAt, '--skip-migrate');
    return;
  }
  if (options.check) {
    reportStep(reports, script, 'skipped', startedAt, `--check mode (would run pnpm ${script})`);
    return;
  }
  const result = runCommand('pnpm', [script]);
  if (result.code !== 0) {
    reportStep(reports, script, 'failed', startedAt, `pnpm ${script} failed`);
    process.exit(1);
  }
  reportStep(reports, script, 'done', startedAt);
}

const CODEGRAPH_PACKAGE = '@colbymchenry/codegraph';

function runMcpSetup(reports: StepReport[], options: BootstrapOptions): void {
  logHeading('6/8 MCP servers (CodeGraph index + default set)');
  if (options.skipMcp) {
    const startedAt = performance.now();
    reportStep(reports, 'mcp', 'skipped', startedAt, '--skip-mcp');
    return;
  }
  runCodeGraphSetup(reports, options);
  ensureDefaultMcpConfig(reports, options);
  installHeadroomCli(reports, options);
}

function runCodeGraphSetup(reports: StepReport[], options: BootstrapOptions): void {
  const startedAt = performance.now();
  if (options.skipCodegraph) {
    reportStep(reports, 'codegraph', 'skipped', startedAt, '--skip-codegraph');
    return;
  }
  if (options.check) {
    reportStep(
      reports,
      'codegraph',
      'skipped',
      startedAt,
      '--check mode (would install CLI + build the index)',
    );
    return;
  }

  // The version pinned in tooling/setup/agent/tool-versions.sh — the same one the cloud
  // bootstrap installs. A different installed version is replaced, not kept.
  const codegraphTool = AGENT_TOOLS.find((tool) => tool.name === 'codegraph');
  const pinnedVersion = codegraphTool ? readToolVersions()[codegraphTool.versionKey] : undefined;
  const installedVersion = codegraphTool ? readInstalledVersion(codegraphTool) : undefined;
  if (!installedVersion || installedVersion !== pinnedVersion) {
    const codegraphPackage = pinnedVersion
      ? `${CODEGRAPH_PACKAGE}@${pinnedVersion}`
      : CODEGRAPH_PACKAGE;
    const install = captureCommand('npm', ['install', '-g', codegraphPackage]);
    if (install.code !== 0) {
      reportStep(
        reports,
        'codegraph',
        'warning',
        startedAt,
        `global install failed — run \`npm i -g ${codegraphPackage}\` manually (non-fatal)`,
      );
      return;
    }
  }

  const databasePath = resolve(PROJECT_ROOT, '.codegraph/codegraph.db');

  if (existsSync(databasePath)) {
    const sync = captureCommand('codegraph', ['sync']);
    const status: StepStatus = sync.code === 0 ? 'done' : 'warning';
    reportStep(
      reports,
      'codegraph',
      status,
      startedAt,
      status === 'done' ? 'index refreshed (codegraph sync)' : 'codegraph sync failed (non-fatal)',
    );
    return;
  }

  // Index only — never `codegraph install`: it builds no index without `--init`, and it
  // replaces the tracked .mcp.json, .cursor/mcp.json and .claude/settings.json symlinks
  // with plain files. ensureDefaultMcpConfig declares the codegraph MCP server through them.
  const result = captureCommand('codegraph', ['init']);
  const status: StepStatus = result.code === 0 ? 'done' : 'warning';
  reportStep(
    reports,
    'codegraph',
    status,
    startedAt,
    status === 'done'
      ? 'project indexed (codegraph init — restart agents to load the MCP server)'
      : 'codegraph init failed (non-fatal)',
  );
}

// Declare the default auto-start MCP pair (be-codegraph + be-headroom) in .mcp.json so a local
// session matches the cloud bootstrap. Non-destructive: writes through the .mcp.json
// symlink and adds codegraph + headroom without clobbering real keys.
function ensureDefaultMcpConfig(reports: StepReport[], options: BootstrapOptions): void {
  const startedAt = performance.now();
  if (options.check) {
    reportStep(
      reports,
      '.mcp.json (default set)',
      'skipped',
      startedAt,
      '--check mode (would declare codegraph + headroom)',
    );
    return;
  }
  try {
    const result = ensureDefaultMcpServers();
    reportStep(
      reports,
      '.mcp.json (default set)',
      'done',
      startedAt,
      result.changed
        ? [
            result.renamed.length > 0 ? `renamed ${result.renamed.join(', ')}` : '',
            result.added.length > 0 ? `declared ${result.added.join(' + ')}` : '',
          ]
            .filter(Boolean)
            .join('; ')
        : 'be-codegraph + be-headroom already declared',
    );
  } catch (error) {
    reportStep(
      reports,
      '.mcp.json (default set)',
      'warning',
      startedAt,
      error instanceof Error ? error.message : 'failed to scaffold .mcp.json',
    );
  }
}

// Best-effort Headroom CLI install (context-compression MCP) via the same installer the
// cloud bootstrap uses. Headroom is a Python tool (uv / pipx / pip --user); fail-open.
function installHeadroomCli(reports: StepReport[], options: BootstrapOptions): void {
  const startedAt = performance.now();
  if (options.check) {
    reportStep(reports, 'headroom CLI', 'skipped', startedAt, '--check mode (would install)');
    return;
  }
  // The version pinned in tooling/setup/agent/tool-versions.sh — the same one the cloud
  // bootstrap installs. A different installed version is replaced, not kept.
  const headroomTool = AGENT_TOOLS.find((tool) => tool.name === 'headroom');
  const pinnedVersion = headroomTool ? readToolVersions()[headroomTool.versionKey] : undefined;
  if (headroomTool && readInstalledVersion(headroomTool) === pinnedVersion) {
    reportStep(reports, 'headroom CLI', 'skipped', startedAt, `${pinnedVersion} (at the pin)`);
    return;
  }
  captureCommand('bash', ['tooling/setup/agent/install-headroom.sh']);
  const installed = headroomTool ? readInstalledVersion(headroomTool) : undefined;
  reportStep(
    reports,
    'headroom CLI',
    installed === pinnedVersion ? 'done' : 'warning',
    startedAt,
    installed === pinnedVersion
      ? `context-compression MCP ready (${installed}, at the pin)`
      : 'install failed — run `bash tooling/setup/agent/install-headroom.sh` manually (non-fatal)',
  );
}

function runOptionalWorker(reports: StepReport[], options: BootstrapOptions): ChildProcess | null {
  logHeading('7/8 Background worker');
  const startedAt = performance.now();
  if (!options.withWorker) {
    reportStep(reports, 'dev:worker', 'skipped', startedAt, 'pass --with-worker to spawn');
    return null;
  }
  if (options.check || options.noStart) {
    reportStep(
      reports,
      'dev:worker',
      'skipped',
      startedAt,
      options.check ? '--check mode' : '--no-start',
    );
    return null;
  }
  const worker = spawn('pnpm', ['dev:worker'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    detached: false,
  });
  reportStep(reports, 'dev:worker', 'done', startedAt, `pid=${worker.pid}`);
  return worker;
}

async function runDevServer(
  reports: StepReport[],
  options: BootstrapOptions,
  worker: ChildProcess | null,
): Promise<void> {
  logHeading('8/8 Dev server');
  const startedAt = performance.now();
  if (options.check) {
    reportStep(reports, 'dev', 'skipped', startedAt, '--check mode');
    return;
  }
  if (options.noStart) {
    reportStep(reports, 'dev', 'skipped', startedAt, '--no-start');
    return;
  }
  const inUse = await isPortInUse(DEFAULT_DEV_PORT);
  if (inUse) {
    reportStep(
      reports,
      'dev',
      'warning',
      startedAt,
      `port ${DEFAULT_DEV_PORT} already in use — dev may fail or attach unexpectedly`,
    );
  } else {
    reportStep(reports, 'dev', 'done', startedAt, `port ${DEFAULT_DEV_PORT} free`);
  }

  printReadyBanner();

  const dev = spawn('pnpm', ['dev'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    detached: false,
  });

  // pnpm runs each script in a process group of its own and ignores a SIGINT sent to it, so
  // signalling pnpm left the API listening on :3000 and this process waiting for an exit that never
  // came. Interrupt every process under each child instead.
  const interruptTree = (child: ChildProcess | null): void => {
    if (child?.pid !== undefined) {
      signalProcesses({ processIds: listProcessTree(child.pid), signal: 'SIGINT' });
    }
  };
  const cleanup = (): void => {
    interruptTree(worker);
    interruptTree(dev);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  await new Promise<void>((resolveExit) => {
    dev.on('exit', (code) => {
      interruptTree(worker);
      process.exitCode = code ?? 0;
      resolveExit();
    });
  });
}

function printReadyBanner(): void {
  process.stdout.write(`\n${ANSI.bold}${ANSI.green}Ready — starting pnpm dev${ANSI.reset}\n`);
  logInfo(`API           ${ANSI.cyan}http://localhost:${DEFAULT_DEV_PORT}${ANSI.reset}`);
  logInfo(`Liveness      ${ANSI.cyan}http://localhost:${DEFAULT_DEV_PORT}/livez${ANSI.reset}`);
  logInfo(`Readiness     ${ANSI.cyan}http://localhost:${DEFAULT_DEV_PORT}/readyz${ANSI.reset}`);
  logInfo(
    `Scalar docs   ${ANSI.cyan}http://localhost:${DEFAULT_DEV_PORT}/api/reference${ANSI.reset} (if ENABLE_API_REFERENCE)`,
  );
  logInfo(
    `Queues        ${ANSI.cyan}http://localhost:${DEFAULT_DEV_PORT}/admin/queues${ANSI.reset} (if ENABLE_QUEUE_DASHBOARD)`,
  );
  process.stdout.write('\n');
}

function printSummary(reports: StepReport[]): void {
  logHeading('Summary');
  const counts: Record<StepStatus, number> = { done: 0, skipped: 0, warning: 0, failed: 0 };
  let totalMs = 0;
  for (const r of reports) {
    counts[r.status] += 1;
    totalMs += r.elapsedMs;
  }
  logInfo(
    `${ANSI.green}${counts.done} done${ANSI.reset}  ·  ${ANSI.gray}${counts.skipped} skipped${ANSI.reset}  ·  ${ANSI.yellow}${counts.warning} warning${ANSI.reset}  ·  ${ANSI.red}${counts.failed} failed${ANSI.reset}  ·  total ${Math.round(totalMs)}ms`,
  );
  process.stdout.write('\n');
}

async function main(): Promise<void> {
  const options = parseArgs();
  const reports: StepReport[] = [];

  logBanner();
  if (options.check) logInfo(`${ANSI.yellow}--check mode: read-only, no mutations${ANSI.reset}`);

  ensureDevDirectoriesExist();

  if (options.onlyEnv) {
    runEnvScaffolding(reports, options);
    printSummary(reports);
    return;
  }

  runPreflight(reports, options);
  runInstallDependencies(reports, options);
  runEnvScaffolding(reports, options);
  runDocker(reports, options);
  runPrepareDatabase(reports, options);
  runMcpSetup(reports, options);
  const worker = runOptionalWorker(reports, options);
  printSummary(reports);
  await runDevServer(reports, options, worker);
}

function ensureDevDirectoriesExist(): void {
  const dir = resolve(PROJECT_ROOT, 'tooling/dev');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

main().catch((error) => {
  process.stderr.write(
    `\n${ANSI.red}setup:local failed${ANSI.reset}: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
