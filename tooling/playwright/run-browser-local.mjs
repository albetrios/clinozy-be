// One-command local browser contracts (`pnpm test:browser:local`): a fresh scratch database,
// migrated and bulk-seeded with synthetic tenants, an isolated API with the browser-contract
// settings, then the Playwright suite. Never touches the `pnpm dev` database or Redis keys.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const repo = process.cwd();
const require = createRequire(`${repo}/package.json`);
const fileEnv = existsSync(`${repo}/.env.local`)
  ? require('dotenv').parse(readFileSync(`${repo}/.env.local`))
  : {};
const configured = { ...fileEnv, ...process.env };
const DATABASE_URL_KEYS = [
  'DATABASE_URL',
  'DATABASE_MIGRATION_URL',
  'DATABASE_MAINTENANCE_URL',
  'DATABASE_OPERATOR_URL',
];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const migrationUrl = new URL(configured.DATABASE_MIGRATION_URL || configured.DATABASE_URL);
if (!LOCAL_HOSTS.has(migrationUrl.hostname)) {
  throw new Error('Browser contracts only run against a local PostgreSQL');
}
const database =
  process.env.BROWSER_TEST_DATABASE || `${migrationUrl.pathname.slice(1)}_browser_test`;
if (!/^[a-z][a-z0-9_]*_test$/.test(database)) {
  throw new Error('BROWSER_TEST_DATABASE must be a lowercase *_test scratch database name');
}
const reportDirectory = process.env.BROWSER_TEST_REPORT_DIR || `${repo}/browser-test-report`;
mkdirSync(reportDirectory, { recursive: true, mode: 0o700 });
const credentialPool = `${reportDirectory}/credential-pool.json`;
const port = process.env.BROWSER_TEST_API_PORT || '63003';

/** Child environment: `.env.local` stays the primary file, every database URL points at the scratch one. */
const env = { ...process.env, NODE_ENV: 'local' };
for (const key of DATABASE_URL_KEYS) {
  if (!configured[key]) continue;
  const url = new URL(configured[key]);
  if (!LOCAL_HOSTS.has(url.hostname)) throw new Error(`${key} is not a local PostgreSQL`);
  url.pathname = `/${database}`;
  env[key] = url.toString();
}

function run(command, args, childEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repo, env: childEnv, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)),
    );
  });
}

// A fresh scratch database every run; the previous one is left behind for inspection.
const serverUrl = new URL(migrationUrl);
serverUrl.pathname = '/postgres';
const admin = require('postgres')(serverUrl.toString(), { max: 1, onnotice: () => {} });
try {
  await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${database}"`);
} finally {
  await admin.end({ timeout: 5 });
}
await run('pnpm', ['db:migrate'], env);
await run('pnpm', ['db:seed:loadtest'], { ...env, LOAD_TEST_CREDENTIAL_POOL_PATH: credentialPool });

const apiEnv = {
  ...env,
  PORT: port,
  HTTP_BIND_HOST: '127.0.0.1',
  CAPTCHA_PROVIDER: 'disabled',
  SESSION_ORIGIN_CSRF_REQUIRED: 'true',
  COOKIE_SECURE: 'false',
  ALLOWED_ORIGINS: 'http://localhost:5175',
  FRONTEND_URL: 'http://localhost:5175',
  REDIS_KEY_PREFIX: `browser-test:${randomBytes(6).toString('hex')}:`,
};
// No telemetry: an empty value makes the env loader drop a key `.env.local` sets.
for (const key of ['SENTRY_DSN', 'POSTHOG_KEY', 'OTEL_EXPORTER_OTLP_ENDPOINT']) {
  if (key in fileEnv) apiEnv[key] = '';
  else delete apiEnv[key];
}
const api = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
  cwd: repo,
  env: apiEnv,
  stdio: ['ignore', 'ignore', 'inherit'],
});
let exitCode = 1;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && api.exitCode === null; attempt++) {
    try {
      ready = (await fetch(`http://127.0.0.1:${port}/readyz`)).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('Isolated API did not become ready');
  await run('pnpm', ['test:browser'], {
    ...process.env,
    BROWSER_TEST_API_URL: `http://localhost:${port}`,
    BROWSER_TEST_CREDENTIAL_POOL: credentialPool,
    BROWSER_TEST_REPORT_DIR: reportDirectory,
  });
  exitCode = 0;
} catch (error) {
  console.error(error.message);
} finally {
  api.kill('SIGTERM');
  await new Promise((resolve) => (api.exitCode !== null ? resolve() : api.once('close', resolve)));
}
process.exitCode = exitCode;
