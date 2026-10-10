import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

// Try the configured Stripe test account first; preserve failures when falling back.
const require = createRequire(`${process.cwd()}/package.json`);
const local = existsSync('.env.local') ? require('dotenv').parse(readFileSync('.env.local')) : {};
const configured = { ...local, ...process.env };
const key = configured.STRIPE_SECRET_KEY;
// A fresh scratch database named after the application one (never the application one itself).
const applicationDatabase = new URL(
  configured.DATABASE_OPERATOR_URL || configured.DATABASE_URL,
).pathname.slice(1);
const database = process.env.LOAD_TEST_DATABASE || `${applicationDatabase}_stripe_load_test`;
const scratch = { ...process.env, NODE_ENV: 'local', LOAD_TEST_DATABASE: database };
for (const name of [
  'DATABASE_URL',
  'DATABASE_OPERATOR_URL',
  'DATABASE_MIGRATION_URL',
  'DATABASE_MAINTENANCE_URL',
]) {
  if (!configured[name]) continue;
  const url = new URL(configured[name]);
  url.pathname = `/${database}`;
  scratch[name] = url.toString();
}
const root = process.env.LOAD_TEST_REPORT_DIR || `${process.cwd()}/k6-stripe-validation`;
mkdirSync(root, { recursive: true, mode: 0o700 });
const attempts = [];

function spawnAndWait(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env });
    child.once('error', () => resolve(null));
    child.once('close', resolve);
  });
}

// Scratch database, synthetic tenants and (with a test key) the sandbox catalog.
const prepared = await spawnAndWait(
  ['--import', 'tsx', 'src/tests/load/k6/prepare-provider-fixtures.mjs', root],
  { ...scratch, STRIPE_SECRET_KEY: key?.startsWith('sk_test_') ? key : '' },
);
if (prepared !== 0) throw new Error('Provider fixture preparation failed');
const fixtures = JSON.parse(readFileSync(`${root}/fixtures.json`, 'utf8'));

async function run(mode) {
  // Seven plan/cycle journeys per lane (one actor each) plus the lane's foreign-tenant actor.
  const exitCode = await spawnAndWait(
    [
      'src/tests/load/k6/run-lifecycle.mjs',
      'src/tests/load/k6/scenarios/billing-provider-lifecycle.js',
      ...(mode === 'contract' ? ['src/tests/load/k6/scenarios/webhook-delivery-lifecycle.js'] : []),
    ],
    {
      ...process.env,
      LOAD_TEST_DATABASE: database,
      LOAD_TEST_CREATE_DATABASE: 'false',
      LOAD_PROVIDER_MODE: mode,
      LOAD_PROVIDER_CREDENTIAL_POOL: fixtures.providerPool,
      LOAD_CREDENTIAL_POOL_FILE: fixtures.k6Pool,
      ...(fixtures.catalog ? { LOAD_PROVIDER_CATALOG_FILE: fixtures.catalog } : {}),
      LOAD_TEST_REPORT_DIR: `${root}/${mode}`,
      VUS: '1',
      ITERATIONS: '7',
    },
  );
  attempts.push({ mode, exitCode, passed: exitCode === 0 });
  return exitCode === 0;
}
let providerPassed = false;
if (key?.startsWith('sk_test_')) providerPassed = await run('sandbox');
else
  attempts.push({
    mode: 'sandbox',
    passed: false,
    skipped: true,
    reason: 'Configured Stripe test key unavailable; live keys are never used.',
  });
// Always verify the local outbound receiver; it also provides fallback billing evidence.
const fallbackPassed = await run('contract');
writeFileSync(
  `${root}/result.json`,
  JSON.stringify(
    {
      providerPassed,
      fallbackPassed,
      attempts,
      fullyVerified: providerPassed && fallbackPassed,
      note: 'Local contract success does not verify Stripe network access or real provider behavior.',
    },
    null,
    2,
  ),
);
// A successful fallback must not turn a failed provider gate green.
process.exitCode = providerPassed && fallbackPassed ? 0 : 1;
