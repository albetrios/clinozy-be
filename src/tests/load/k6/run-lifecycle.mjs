import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, openSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:net';
const repo = process.cwd(),
  root = process.env.LOAD_TEST_REPORT_DIR || `${repo}/k6-lifecycle`;
const require = createRequire(`${repo}/package.json`);
const local = existsSync(`${repo}/.env.local`)
  ? require('dotenv').parse(readFileSync(`${repo}/.env.local`))
  : {};
const mode = randomBytes(8).toString('hex');
const output = root;
const providerMode = process.env.LOAD_PROVIDER_MODE;
if (providerMode && !['contract', 'sandbox'].includes(providerMode))
  throw new Error('Invalid LOAD_PROVIDER_MODE');
if (
  providerMode === 'sandbox' &&
  process.argv.slice(2).some((path) => path.endsWith('/webhook-delivery-lifecycle.js'))
)
  throw new Error(
    'Local outbound receiver requires contract mode; run it separately from the real Stripe transport',
  );
const providerToken = randomBytes(32).toString('hex');
mkdirSync(output, { recursive: true });
const database = process.env.LOAD_TEST_DATABASE;
if (!(database && /^[a-z][a-z0-9_]*$/.test(database) && /(?:^|_)(load|test)(?:_|$)/.test(database)))
  throw new Error('Explicit scratch LOAD_TEST_DATABASE required');
const original = { ...local, ...process.env };
const sourceUrl = new URL(original.DATABASE_OPERATOR_URL || original.DATABASE_URL);
if (sourceUrl.pathname.slice(1) === database)
  throw new Error('Scratch database must differ from application database');
if (process.env.LOAD_TEST_CREATE_DATABASE === 'true') {
  const source = sourceUrl.pathname.slice(1);
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const sql = require('postgres')(adminUrl.toString(), { max: 1 });
  if (!/^[a-z][a-z0-9_]*$/.test(source)) throw new Error('Invalid source database');
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await sql.unsafe(`CREATE DATABASE "${database}" TEMPLATE "${source}"`);
        break;
      } catch (error) {
        if (error.code !== '55006' || attempt >= 39) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } finally {
    await sql.end();
  }
}

const shared = {
  ...local,
  ...process.env,
  TEST_MODE: 'true',
  RATE_LIMIT_MAX: '100000',
  RATE_LIMIT_WINDOW_MS: '1000',
  RATE_LIMIT_RELAXED_CAPS: 'true',
  GLOBAL_ADMIN_EMAILS: Array.from(
    { length: Number(process.env.VUS || '4') },
    (_, index) => `load-admin-${mode}-${index}@loadtest.example.com`,
  ).join(','),
  RESEND_API_KEY: 're_test_contract_fixture_key',
  EMAIL_FROM_ADDRESS: 'noreply@example.com',
};
const env = {
  ...shared,
  PORT: '3002',
  NODE_USE_ENV_PROXY: '1',
  NO_PROXY: [shared.NO_PROXY || '', '127.0.0.1', 'localhost'].filter(Boolean).join(','),
  DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX || '60',
  OVERLOAD_DB_POOL_SHED_RATIO: process.env.OVERLOAD_DB_POOL_SHED_RATIO || '3',
  WEBHOOK_URL_ALLOWLIST: 'example.com,1.1.1.1',
  S3_ENDPOINT: 'http://127.0.0.1:3004',
  S3_BUCKET: 'load-fixture',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'load-fixture-access-key',
  S3_SECRET_ACCESS_KEY: 'load-fixture-secret-key-for-loopback-only',
  S3_FORCE_PATH_STYLE: 'true',
  FRONTEND_URL: 'http://localhost:5173',
  ALLOWED_ORIGINS: 'http://localhost:5173',
  WEBAUTHN_RP_ID: 'localhost',
  HOST: '127.0.0.1',
  REDIS_KEY_PREFIX: `clinozy:load-lifecycle:${mode}:`,
};
if (providerMode) {
  env.LOAD_PROVIDER_MODE = providerMode;
  env.LOAD_PROVIDER_URL = 'http://127.0.0.1:3006';
  env.LOAD_PROVIDER_TOKEN = providerToken;
  env.CONTRACT_TESTS_ENABLED = providerMode === 'contract' ? 'true' : 'false';
  env.NODE_OPTIONS = [
    shared.NODE_OPTIONS || '',
    ...(providerMode === 'contract'
      ? ['--import=nock', '--import=./src/tests/load/k6/load-provider-preload.mjs']
      : []),
  ]
    .filter(Boolean)
    .join(' ');
  if (providerMode === 'contract') env.STRIPE_SECRET_KEY = 'sk_test_load_contract_fixture_only';
}
for (const key of [
  'DATABASE_URL',
  'DATABASE_OPERATOR_URL',
  'DATABASE_MIGRATION_URL',
  'DATABASE_MAINTENANCE_URL',
])
  if (env[key]) {
    const u = new URL(env[key]);
    u.pathname = `/${database}`;
    env[key] = u.toString();
  }
for (const key of ['SENTRY_DSN', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'POSTHOG_KEY']) delete env[key];
for (const port of [3002, 3003, 3004, 3005, ...(providerMode ? [3006, 9092] : [])]) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
const provider = providerMode
  ? spawn(process.execPath, ['src/tests/load/k6/load-provider.mjs'], {
      cwd: repo,
      env: { ...env, NODE_OPTIONS: shared.NODE_OPTIONS || '' },
      stdio: [
        'ignore',
        openSync(`${output}/provider.log`, 'w'),
        openSync(`${output}/provider.errors.log`, 'w'),
      ],
    })
  : null;
const worker = providerMode
  ? spawn(process.execPath, ['dist/src/worker.js'], {
      cwd: repo,
      env: { ...env, WORKER_QUEUE_FAMILIES: 'stripe', WORKER_HEALTH_PORT: '9092' },
      stdio: [
        'ignore',
        openSync(`${output}/worker.log`, 'w'),
        openSync(`${output}/worker.errors.log`, 'w'),
      ],
    })
  : null;
const storage = spawn(process.execPath, ['src/tests/load/k6/load-storage.mjs'], {
  cwd: repo,
  env: { ...shared, LOAD_STORAGE_PORT: '3004' },
  stdio: [
    'ignore',
    openSync(`${output}/storage.log`, 'w'),
    openSync(`${output}/storage.errors.log`, 'w'),
  ],
});
const authenticatorToken = randomBytes(32).toString('hex');
const authenticator = spawn(process.execPath, ['src/tests/load/k6/load-authenticator.mjs'], {
  cwd: repo,
  env: { ...shared, LOAD_AUTHENTICATOR_TOKEN: authenticatorToken },
  stdio: [
    'ignore',
    openSync(`${output}/authenticator.log`, 'w'),
    openSync(`${output}/authenticator.errors.log`, 'w'),
  ],
});
const mailboxToken = randomBytes(32).toString('hex');
const mailbox = spawn(process.execPath, ['src/tests/load/k6/load-mailbox.mjs'], {
  cwd: repo,
  env: {
    ...shared,
    LOAD_MAILBOX_DATABASE: database,
    LOAD_MAILBOX_TOKEN: mailboxToken,
    LOAD_MAILBOX_EMAIL_PREFIX: 'load-',
  },
  stdio: [
    'ignore',
    openSync(`${output}/mailbox.log`, 'w'),
    openSync(`${output}/mailbox.errors.log`, 'w'),
  ],
});
const api = spawn(process.execPath, ['dist/src/server.js'], {
  cwd: repo,
  env,
  stdio: ['ignore', openSync(`${output}/api.log`, 'w'), openSync(`${output}/api-errors.log`, 'w')],
});
const base = 'http://127.0.0.1:3002';
async function request(path, body) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Captcha-Bypass': 'true' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (response.status !== 200) throw new Error(`Preflight ${path} HTTP ${response.status}`);
  return json.data;
}
try {
  let ready = false;
  for (let i = 0; i < 45; i++) {
    if (
      api.exitCode !== null ||
      mailbox.exitCode !== null ||
      storage.exitCode !== null ||
      authenticator.exitCode !== null ||
      (provider && provider.exitCode !== null) ||
      (worker && worker.exitCode !== null)
    )
      throw new Error('Fixture process exited');
    try {
      const response = await fetch(`${base}/readyz`);
      if (
        response.status === 200 &&
        execFileSync('ss', ['-ltnpH'], { encoding: 'utf8' })
          .split('\n')
          .some((line) => line.includes(':3002 ') && line.includes(`pid=${api.pid},`))
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error('API not ready');
  const adminTokens = [];
  for (const email of shared.GLOBAL_ADMIN_EMAILS.split(',')) {
    const code = await request('/auth/email/send-code', { email });
    const admin = await request('/auth/email/login', { email, code: code.debug_verification_code });
    adminTokens.push(admin.access_token);
  }
  writeFileSync(
    `${output}/runtime.json`,
    JSON.stringify(
      {
        pid: api.pid,
        database,
        pool: Number(env.DATABASE_POOL_MAX),
        admissionRatio: Number(env.OVERLOAD_DB_POOL_SHED_RATIO),
        branch: execFileSync('git', ['branch', '--show-current'], {
          cwd: repo,
          encoding: 'utf8',
        }).trim(),
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
        sourceHasUncommittedChanges:
          execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim()
            .length > 0,
        mailboxLoopback: true,
        workerStarted: Boolean(worker),
        providerMode: providerMode || null,
        liveEmailSent: false,
      },
      null,
      2,
    ),
  );
  const results = [];
  const sourceHashes = {};
  for (const file of [
    'dist/src/server.js',
    'src/tests/load/k6/run-lifecycle.mjs',
    'src/tests/load/k6/load-provider.mjs',
    'src/tests/load/k6/load-provider-preload.mjs',
    ...process.argv.slice(2),
    ...(!process.argv.slice(2).length
      ? [
          ...(providerMode
            ? [
                'billing-provider-lifecycle',
                ...(providerMode === 'contract' ? ['webhook-delivery-lifecycle'] : []),
              ]
            : [
                'auth-security-lifecycle',
                'account-onboarding-lifecycle',
                'tenant-membership-lifecycle',
                'admin',
                'upload-asset-lifecycle',
                'webauthn-lifecycle',
              ]),
        ].map((name) => `src/tests/load/k6/scenarios/${name}.js`)
      : []),
  ])
    sourceHashes[file] = createHash('sha256').update(readFileSync(file)).digest('hex');
  writeFileSync(`${output}/source-hashes.json`, JSON.stringify(sourceHashes, null, 2));
  const paths = process.argv.slice(2);
  const scripts = paths.length
    ? paths.map((path) => {
        if (!/^src\/tests\/load\/k6\/scenarios\/[a-z-]+\.js$/.test(path))
          throw new Error('Invalid scenario path');
        return path.split('/').at(-1).slice(0, -3);
      })
    : providerMode
      ? providerMode === 'sandbox'
        ? ['billing-provider-lifecycle']
        : ['billing-provider-lifecycle', 'webhook-delivery-lifecycle']
      : [
          'auth-security-lifecycle',
          'account-onboarding-lifecycle',
          'tenant-membership-lifecycle',
          'admin',
          'upload-asset-lifecycle',
          'webauthn-lifecycle',
        ];
  for (const script of scripts) {
    const processK6 = spawn(
      'k6',
      [
        'run',
        '--quiet',
        '--no-usage-report',
        '--summary-trend-stats',
        'avg,min,med,max,p(90),p(95),p(99)',
        '--summary-export',
        `${output}/${script}.summary.json`,
        '--out',
        `json=${output}/${script}.samples.json`,
        `src/tests/load/k6/scenarios/${script}.js`,
      ],
      {
        cwd: repo,
        env: {
          ...env,
          BASE_URL: base,
          ADMIN_TOKENS: JSON.stringify(adminTokens),
          LOAD_MAILBOX_URL: 'http://127.0.0.1:3003',
          LOAD_MAILBOX_TOKEN: mailboxToken,
          LOAD_AUTHENTICATOR_URL: 'http://127.0.0.1:3005',
          LOAD_AUTHENTICATOR_TOKEN: authenticatorToken,
          VUS: process.env.VUS || '4',
          ITERATIONS: process.env.ITERATIONS || '5',
        },
        stdio: [
          'ignore',
          openSync(`${output}/${script}.log`, 'w'),
          openSync(`${output}/${script}.errors.log`, 'w'),
        ],
      },
    );
    const exitCode = await new Promise((resolve) => processK6.on('close', resolve));
    let summary = {};
    try {
      summary = JSON.parse(readFileSync(`${output}/${script}.summary.json`));
    } catch {}
    results.push({ script, exitCode, metrics: summary.metrics });
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  }
  if (
    results.some(
      (x) =>
        x.exitCode !== 0 ||
        x.metrics?.checks?.fails > 0 ||
        x.metrics?.checks?.value !== 1 ||
        x.metrics?.http_req_failed?.value !== 0 ||
        !(x.metrics?.http_reqs?.count > 0),
    )
  )
    process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (provider) {
    try {
      const state = await (
        await fetch('http://127.0.0.1:3006/state', {
          headers: { Authorization: `Bearer ${providerToken}` },
        })
      ).json();
      writeFileSync(`${output}/provider-fixture-state.json`, JSON.stringify(state.data, null, 2));
    } catch {}
  }
  try {
    const state = await (await fetch('http://127.0.0.1:3004/__fixture__/state')).json();
    writeFileSync(`${output}/storage-fixture-state.json`, JSON.stringify(state, null, 2));
  } catch {}
  authenticator.kill('SIGTERM');
  storage.kill('SIGTERM');
  api.kill('SIGTERM');
  mailbox.kill('SIGTERM');
  worker?.kill('SIGTERM');
  if (worker)
    await new Promise((resolve) =>
      worker.exitCode !== null ? resolve() : worker.on('close', resolve),
    );
  provider?.kill('SIGTERM');
  await Promise.all([
    new Promise((resolve) =>
      authenticator.exitCode !== null ? resolve() : authenticator.on('close', resolve),
    ),
    new Promise((resolve) =>
      storage.exitCode !== null ? resolve() : storage.on('close', resolve),
    ),
    new Promise((resolve) => (api.exitCode !== null ? resolve() : api.on('close', resolve))),
    new Promise((resolve) =>
      mailbox.exitCode !== null ? resolve() : mailbox.on('close', resolve),
    ),
    ...(provider
      ? [
          new Promise((resolve) =>
            provider.exitCode !== null ? resolve() : provider.on('close', resolve),
          ),
        ]
      : []),
  ]);
  if (provider && provider.exitCode !== 0) process.exitCode = 1;
  writeFileSync(
    `${output}/runtime-stopped.json`,
    JSON.stringify({
      apiStopped: true,
      mailboxStopped: true,
      storageStopped: true,
      authenticatorStopped: true,
      providerMode: providerMode || null,
      providerStopped: provider ? provider.exitCode !== null : null,
      workerStopped: worker ? worker.exitCode !== null : null,
    }),
  );
}
