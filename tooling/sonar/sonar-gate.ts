/**
 * Local SonarQube quality gate (used by the pre-commit hook and `pnpm sonar:scan`).
 *
 * Ensures the local SonarQube server is running (auto-starts it if not), provisions an analysis
 * token on first run (stored in the gitignored `.env.local`), runs a scan, waits for the server
 * to finish processing, and then prints any unresolved issues and FAILS (exit 1) if there is at
 * least one — so every Sonar finding on the deployed-app surface must be cleared before the commit
 * is accepted. Exits 0 when the project is clean.
 *
 * Run directly with `pnpm sonar:scan`. See docs/reference/quality/sonarqube-local.md.
 */
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import dotenv from 'dotenv';
import { formatEnvValue, upsertEnvAssignment } from '@tooling/dev/env-file.util.js';
import { resolveDerivedNames } from '@tooling/setup/codegen/project-identity.util.js';
import { loadConfig } from '@tooling/setup/common/config.js';
import { requireTool } from '@tooling/setup/common/require-tool.js';

const DERIVED_NAMES = resolveDerivedNames(loadConfig());
const SONAR_URL = process.env.SONAR_HOST_URL ?? 'http://localhost:9000';
const PROJECT_KEY = DERIVED_NAMES.sonarProjectKey;
const COMPOSE_FILE = 'docker-compose.sonar.yml';
const DOCKER_DAEMON_SCRIPT = 'tooling/setup/agent/ensure-docker-daemon.sh';
const ENV_LOCAL = '.env.local';
const TOKEN_NAME = DERIVED_NAMES.sonarTokenName;
const ADMIN_LOGIN = 'admin';
const SERVER_READY_TIMEOUT_MS = 240_000;
const CE_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 4_000;

function log(message: string): void {
  process.stdout.write(`[sonar-gate] ${message}\n`);
}

function die(message: string): never {
  process.stderr.write(`\n[sonar-gate] ✗ ${message}\n`);
  process.exit(1);
}

/** The `.env.local` values (dotenv syntax, the one parser); {} when the file is absent. */
function readEnvLocal(): Record<string, string> {
  return existsSync(ENV_LOCAL) ? dotenv.parse(readFileSync(ENV_LOCAL, 'utf8')) : {};
}

/** The comment above the keys this gate writes. */
const SONAR_SECTION_COMMENT = '# SonarQube local quality gate (generated; gitignored)';

/**
 * Sets the given keys in `.env.local` with the shared line editor: a key's line is replaced in
 * place, a new key is appended under the section comment (written once), every other line is kept.
 */
function upsertEnvLocal(updates: Record<string, string>): void {
  const existing = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, 'utf8') : '';
  const present = dotenv.parse(existing);
  let content = existing;
  if (
    !content.includes(SONAR_SECTION_COMMENT) &&
    Object.keys(updates).some((key) => !(key in present))
  ) {
    content = `${content}${content === '' || content.endsWith('\n') ? '' : '\n'}${SONAR_SECTION_COMMENT}\n`;
  }
  for (const [key, value] of Object.entries(updates)) {
    content = upsertEnvAssignment(content, key, formatEnvValue(value));
  }
  writeFileSync(ENV_LOCAL, content);
}

interface ApiOptions {
  method?: 'GET' | 'POST';
  basicAuth?: string;
  form?: Record<string, string>;
}

async function sonarApi(path: string, options: ApiOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(options.basicAuth).toString('base64')}`;
  }
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(options.form).toString();
  }
  try {
    return await fetch(`${SONAR_URL}${path}`, init);
  } catch {
    return new Response(null, { status: 503 });
  }
}

function dockerCompose(args: string[], extraEnv: Record<string, string> = {}): number {
  const result = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  return result.status ?? 1;
}

/**
 * Starts the Docker daemon when it is not reachable, so the gate never stops on "is Docker
 * running?" — through `tooling/setup/agent/ensure-docker-daemon.sh`, the one way tooling starts
 * Docker (OrbStack or Docker Desktop on a Mac; dockerd, with its restricted-network fallback, on
 * Linux).
 */
function ensureDockerDaemon(): void {
  if (!requireTool({ name: 'docker', mode: 'block', purpose: 'the SonarQube gate' })) {
    throw new Error('Docker is required for the SonarQube gate.');
  }
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0) return;
  if (!existsSync(DOCKER_DAEMON_SCRIPT)) return;
  log('Docker daemon not reachable — starting it (tooling/setup/agent/ensure-docker-daemon.sh)…');
  spawnSync('/bin/bash', [DOCKER_DAEMON_SCRIPT], { stdio: 'inherit' });
}

/** Starts the SonarQube container if it is not already accepting requests, then waits for UP. */
async function ensureServerUp(): Promise<void> {
  const status = await sonarApi('/api/system/status');
  if (status.ok) {
    const parsed = (await status.json()) as { status?: string };
    if (parsed.status === 'UP') return;
  }

  log('SonarQube not ready — starting it (first boot can take ~2 min)…');
  ensureDockerDaemon();
  if (dockerCompose(['up', '-d', 'sonarqube']) !== 0) {
    die('failed to start SonarQube (is Docker running?). Start it with `pnpm sonar:up`.');
  }

  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const probe = await sonarApi('/api/system/status');
    if (probe.ok) {
      const parsed = (await probe.json()) as { status?: string };
      if (parsed.status === 'UP') {
        log('SonarQube is UP.');
        return;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  die(
    'SonarQube did not become ready in time. Check `docker compose -f docker-compose.sonar.yml logs sonarqube`.',
  );
}

async function tokenIsValid(token: string): Promise<boolean> {
  const response = await sonarApi('/api/authentication/validate', { basicAuth: `${token}:` });
  if (!response.ok) return false;
  const parsed = (await response.json()) as { valid?: boolean };
  return parsed.valid === true;
}

/** True when `admin` still authenticates with `password` (SonarQube answers 200 + `valid:false` on a bad password, not 401). */
async function adminPasswordIsValid(password: string): Promise<boolean> {
  const response = await sonarApi('/api/authentication/validate', {
    basicAuth: `${ADMIN_LOGIN}:${password}`,
  });
  if (!response.ok) return false;
  return ((await response.json()) as { valid?: boolean }).valid === true;
}

function generateLocalAdminPassword(): string {
  return `Sonar1!${randomBytes(12).toString('base64url')}`;
}

/**
 * Returns a valid analysis token, provisioning one on first run: changes the default `admin/admin`
 * password to a generated one (stored in `.env.local`) and mints a token. Idempotent thereafter.
 */
async function ensureToken(): Promise<string> {
  const env = readEnvLocal();
  if (env.SONAR_TOKEN && (await tokenIsValid(env.SONAR_TOKEN))) {
    return env.SONAR_TOKEN;
  }

  log('Provisioning a SonarQube token…');
  let adminPassword = env.SONAR_ADMIN_PASSWORD;

  // A stored password goes stale whenever the SonarQube volume is recreated (`sonar:reset`, a
  // pruned Docker volume, a re-cloned container): the instance reverts to `admin/admin` while the
  // generated one is still on disk. Without this check the mint below fails with HTTP 401 and the
  // gate tells the developer to run the DESTRUCTIVE `sonar:reset` — even though the
  // default-credential re-provision path directly beneath us recovers it non-destructively.
  // Discard the stale value and fall through to that path instead.
  if (adminPassword && !(await adminPasswordIsValid(adminPassword))) {
    log('Stored SONAR_ADMIN_PASSWORD is stale (instance was reset) — re-provisioning.');
    adminPassword = undefined;
  }

  if (!adminPassword) {
    const defaultWorks = await sonarApi('/api/authentication/validate', {
      basicAuth: `${ADMIN_LOGIN}:admin`,
    });
    const defaultValid =
      defaultWorks.ok && ((await defaultWorks.json()) as { valid?: boolean }).valid === true;
    if (!defaultValid) {
      die(
        'SonarQube admin password is unknown (not the default and not in .env.local).\n' +
          '  Set SONAR_ADMIN_PASSWORD in .env.local, or reset the instance with `pnpm sonar:reset`.',
      );
    }
    adminPassword = generateLocalAdminPassword();
    const changed = await sonarApi('/api/users/change_password', {
      method: 'POST',
      basicAuth: `${ADMIN_LOGIN}:admin`,
      form: { login: ADMIN_LOGIN, previousPassword: 'admin', password: adminPassword },
    });
    if (!changed.ok && changed.status !== 204) {
      die(`failed to set the local SonarQube admin password (HTTP ${changed.status}).`);
    }
  }

  await sonarApi('/api/user_tokens/revoke', {
    method: 'POST',
    basicAuth: `${ADMIN_LOGIN}:${adminPassword}`,
    form: { name: TOKEN_NAME },
  });
  const generated = await sonarApi('/api/user_tokens/generate', {
    method: 'POST',
    basicAuth: `${ADMIN_LOGIN}:${adminPassword}`,
    form: { name: TOKEN_NAME },
  });
  if (!generated.ok) {
    die(`failed to mint a SonarQube token (HTTP ${generated.status}). Try \`pnpm sonar:reset\`.`);
  }
  const token = ((await generated.json()) as { token?: string }).token;
  if (!token) die('SonarQube returned no token.');

  upsertEnvLocal({ SONAR_ADMIN_PASSWORD: adminPassword, SONAR_TOKEN: token });
  log('Token provisioned and saved to .env.local.');
  return token;
}

function runScanner(token: string): string {
  log('Scanning… (this takes ~60–90s)');
  const result = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, 'run', '--rm', 'scanner'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, SONAR_TOKEN: token },
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    process.stderr.write(output);
    die('the SonarQube scanner failed (see output above).');
  }
  return output;
}

/** Extracts the Compute Engine task id from the scanner's `…/api/ce/task?id=<id>` log line. */
function parseCeTaskId(scannerOutput: string): string {
  const match = /ce\/task\?id=([\w-]+)/.exec(scannerOutput);
  if (!match?.[1]) {
    process.stderr.write(scannerOutput);
    die('could not find the analysis task id in the scanner output.');
  }
  return match[1];
}

async function waitForAnalysis(token: string, taskId: string): Promise<void> {
  log('Waiting for SonarQube to process the report…');
  const deadline = Date.now() + CE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await sonarApi(`/api/ce/task?id=${taskId}`, { basicAuth: `${token}:` });
    if (response.ok) {
      const status = ((await response.json()) as { task?: { status?: string } }).task?.status;
      if (status === 'SUCCESS') return;
      if (status === 'FAILED' || status === 'CANCELED') {
        die(`SonarQube analysis ${status?.toLowerCase()}. Check the dashboard at ${SONAR_URL}.`);
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  die('timed out waiting for SonarQube to process the analysis.');
}

interface SonarIssue {
  rule: string;
  severity: string;
  component: string;
  line?: number;
  message: string;
}

async function fetchOpenIssues(token: string): Promise<SonarIssue[]> {
  const issues: SonarIssue[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await sonarApi(
      `/api/issues/search?componentKeys=${PROJECT_KEY}&resolved=false&ps=100&p=${page}`,
      { basicAuth: `${token}:` },
    );
    if (!response.ok) die(`failed to query SonarQube issues (HTTP ${response.status}).`);
    const parsed = (await response.json()) as { total: number; issues: SonarIssue[] };
    issues.push(...parsed.issues);
    if (issues.length >= parsed.total || parsed.issues.length === 0) break;
  }
  return issues;
}

async function fetchOpenHotspots(token: string): Promise<number> {
  const response = await sonarApi(
    `/api/hotspots/search?projectKey=${PROJECT_KEY}&status=TO_REVIEW&ps=1`,
    { basicAuth: `${token}:` },
  );
  if (!response.ok) return 0;
  return ((await response.json()) as { paging?: { total?: number } }).paging?.total ?? 0;
}

function reportAndExit(issues: SonarIssue[], hotspots: number): never {
  if (issues.length === 0 && hotspots === 0) {
    log(
      `✓ SonarQube clean — 0 issues / 0 hotspots. Dashboard: ${SONAR_URL}/dashboard?id=${PROJECT_KEY}`,
    );
    process.exit(0);
  }

  process.stderr.write(
    `\n[sonar-gate] ✗ SonarQube found ${issues.length} issue(s)` +
      `${hotspots > 0 ? ` and ${hotspots} security hotspot(s) to review` : ''} — fix them before committing.\n\n`,
  );
  for (const issue of issues.slice(0, 50)) {
    const file = issue.component.includes(':')
      ? issue.component.split(':').slice(1).join(':')
      : issue.component;
    const where = issue.line ? `${file}:${issue.line}` : file;
    process.stderr.write(
      `  ${issue.severity.padEnd(8)} ${issue.rule.padEnd(22)} ${where}\n      ${issue.message}\n`,
    );
  }
  if (issues.length > 50) process.stderr.write(`  … and ${issues.length - 50} more.\n`);
  process.stderr.write(`\n  Full report: ${SONAR_URL}/dashboard?id=${PROJECT_KEY}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  await ensureServerUp();
  const token = await ensureToken();
  const scanOutput = runScanner(token);
  await waitForAnalysis(token, parseCeTaskId(scanOutput));
  const [issues, hotspots] = await Promise.all([fetchOpenIssues(token), fetchOpenHotspots(token)]);
  reportAndExit(issues, hotspots);
}

main().catch((error: unknown) => {
  die(error instanceof Error ? error.message : String(error));
});
