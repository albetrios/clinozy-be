import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

// Try the configured Stripe test account first; preserve failures when falling back.
const require = createRequire(`${process.cwd()}/package.json`);
const local = existsSync('.env.local') ? require('dotenv').parse(readFileSync('.env.local')) : {};
const key = process.env.STRIPE_SECRET_KEY || local.STRIPE_SECRET_KEY;
const root = process.env.LOAD_TEST_REPORT_DIR || `${process.cwd()}/k6-stripe-validation`;
mkdirSync(root, { recursive: true });
const attempts = [];
let runs = 0;
async function run(mode) {
  const child = spawn(
    process.execPath,
    [
      'src/tests/load/k6/run-lifecycle.mjs',
      'src/tests/load/k6/scenarios/billing-provider-lifecycle.js',
      ...(mode === 'contract' ? ['src/tests/load/k6/scenarios/webhook-delivery-lifecycle.js'] : []),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        LOAD_TEST_CREATE_DATABASE:
          runs++ === 0 ? process.env.LOAD_TEST_CREATE_DATABASE || 'false' : 'false',
        LOAD_PROVIDER_MODE: mode,
        LOAD_TEST_REPORT_DIR: `${root}/${mode}`,
      },
    },
  );
  const exitCode = await new Promise((resolve) => {
    child.once('error', () => resolve(null));
    child.once('close', resolve);
  });
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
