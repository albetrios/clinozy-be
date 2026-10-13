/**
 * Load-test prerequisite checker for scenarios/comprehensive-journey.js.
 *
 * Verifies the stack, server config, test data, and caps documented in COMPREHENSIVE-JOURNEY.md,
 * and prints PASS/FAIL with remediation. Exit code is non-zero if any hard prerequisite fails, so it
 * can gate a run:  node src/tests/load/k6/check-prereqs.mjs && k6 run scenarios/comprehensive-journey.js
 *
 * Read-only except for a couple of throwaway logins (which create sessions, regenerated anyway).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import Redis from 'ioredis';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const API = `${BASE_URL}/api/v1`;
const POOL_PATH = resolve(here, 'data/credential-pool.json');
const OVERRIDES_PATH = resolve(here, 'data/loadtest-overrides.env');
const TARGET_VUS = Number(process.env.VUS || '100'); // checks the pool is big enough for this

/** The value `key` has in an env file: `''` for a blank `KEY=` line, `undefined` when absent. */
function readEnvFileLine(path, key) {
  try {
    const line = readFileSync(path, 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${key}=`));
    if (!line) return undefined;
    return line
      .slice(key.length + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  } catch {
    return undefined;
  }
}

function readEnvFileValue(path, key) {
  const value = readEnvFileLine(path, key);
  return value === '' ? undefined : value;
}

// The value the load-test cluster runs with: its process environment (setup-loadtest.sh exports
// the overrides into this checker too), then the overrides file, then the machine-local env file
// the server loads underneath them.
function loadTestSetting(key) {
  return (
    process.env[key] ||
    readEnvFileValue(OVERRIDES_PATH, key) ||
    readEnvFileValue(resolve(repoRoot, '.env.local'), key)
  );
}

const results = [];
const ok = (name, detail) => results.push({ name, pass: true, detail });
const fail = (name, detail, fix) => results.push({ name, pass: false, detail, fix });

// 1. k6
{
  const r = spawnSync('k6', ['version'], { encoding: 'utf8' });
  if (r.status === 0) ok('k6 installed', (r.stdout || '').trim().split('\n')[0]);
  else
    fail(
      'k6 installed',
      'k6 not found',
      'Install k6: https://k6.io/docs/get-started/installation/',
    );
}

// 2. credential pool
let pool = [];
try {
  pool = JSON.parse(readFileSync(POOL_PATH, 'utf8'));
  if (pool.length >= TARGET_VUS)
    ok('credential pool', `${pool.length} users (need ≥ ${TARGET_VUS} for ${TARGET_VUS} VU)`);
  else
    fail(
      'credential pool',
      `${pool.length} users < ${TARGET_VUS} VU (some are MFA-blocked too)`,
      `Seed more: BULK_ORGS=20 BULK_USERS_PER_ORG=12 pnpm db:seed:bulk && pnpm tool:load-test-credential-pool`,
    );
} catch {
  fail('credential pool', `${POOL_PATH} missing`, 'Run: pnpm db:seed:loadtest');
}

// 3. server reachable
let serverUp = false;
try {
  const r = await fetch(`${BASE_URL}/livez`, { signal: AbortSignal.timeout(3000) });
  serverUp = r.status === 200;
  serverUp
    ? ok('server reachable', `${BASE_URL}/livez → 200`)
    : fail(
        'server reachable',
        `/livez → ${r.status}`,
        'Start the loadtest server (see COMPREHENSIVE-JOURNEY.md §4)',
      );
} catch (e) {
  fail(
    'server reachable',
    `${BASE_URL} unreachable (${e.message})`,
    'Start: pnpm build && node dist/src/server.js  (or cluster-run.mjs)',
  );
}

// 4 + 5. captcha fail-open (login → token) + organization-scoped read works
if (serverUp && pool.length) {
  let usable = 0;
  let scopedReadOk = false;
  let mfaBlocked = 0;
  for (const c of pool.slice(0, Math.min(30, pool.length))) {
    try {
      const lr = await fetch(`${API}/auth/login`, {
        method: 'POST',
        // The dev-only CAPTCHA bypass (honored only with CAPTCHA_BYPASS_ALLOWED=true, never in
        // production) — the same header the k6 scenarios send on public auth forms.
        headers: { 'Content-Type': 'application/json', 'X-Captcha-Bypass': 'true' },
        body: JSON.stringify({ email: c.email, password: c.password }),
      });
      const j = await lr.json();
      if (lr.status === 401 && /captcha/i.test(JSON.stringify(j))) {
        fail(
          'captcha fail-open',
          'login blocked by captcha',
          'Set CAPTCHA_PROVIDER=disabled, or keep CAPTCHA on with CAPTCHA_BYPASS_ALLOWED=true (pnpm setup:local --with-captcha sets both); plus RATE_LIMIT_RELAXED_CAPS=true (setup-loadtest.sh writes these) — then restart the server',
        );
        break;
      }
      let t = j?.data?.access_token;
      if (!t) {
        mfaBlocked += 1;
        continue;
      }
      usable += 1;
      if (!scopedReadOk) {
        if (c.organizationPublicId) {
          const sr = await fetch(`${API}/auth/switch-to-organization`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ organization_id: c.organizationPublicId }),
          });
          t = (await sr.json())?.data?.access_token || t;
        }
        const rd = await fetch(`${API}/tenancy/organization/memberships`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        scopedReadOk = rd.status === 200;
      }
    } catch {
      /* keep sampling */
    }
  }
  if (!results.some((r) => r.name === 'captcha fail-open')) {
    usable > 0
      ? ok('captcha fail-open + login', `${usable}/30 sampled usable, ${mfaBlocked} MFA-blocked`)
      : fail(
          'captcha fail-open + login',
          'no sampled user got a token',
          'Check CAPTCHA_PROVIDER=disabled + RATE_LIMIT_RELAXED_CAPS=true + credential pool passwords',
        );
    scopedReadOk
      ? ok('org-scoped read', 'GET /tenancy/organization/memberships → 200')
      : fail(
          'org-scoped read',
          'org read not 200',
          'Check switch-to-organization + organization membership',
        );
    const estUsable = Math.round((usable / Math.min(30, pool.length)) * pool.length);
    if (estUsable < TARGET_VUS)
      fail(
        'usable users for VU target',
        `~${estUsable} usable < ${TARGET_VUS} VU → user-sharing → perm-cache 403s`,
        'Seed more users (≈ VUS / 0.8) so all VUs get a distinct usable user',
      );
    else ok('usable users for VU target', `~${estUsable} usable ≥ ${TARGET_VUS} VU`);
  }
}

// 6. No payment provider: the member chain (RARE=true) subscribes its organization, and only an API
// without STRIPE_SECRET_KEY records that subscription itself. With a key the subscription waits for
// payment and keeps the Free plan's single seat. A blank value is unset (the env loader drops it).
{
  // The loader's order: the process environment, the overrides it exports, the machine-local file.
  const stripeKey =
    process.env.STRIPE_SECRET_KEY ??
    readEnvFileLine(OVERRIDES_PATH, 'STRIPE_SECRET_KEY') ??
    readEnvFileLine(resolve(repoRoot, '.env.local'), 'STRIPE_SECRET_KEY');
  !stripeKey
    ? ok('payment provider off', 'no STRIPE_SECRET_KEY for the load-test cluster')
    : fail(
        'payment provider off',
        'the load-test cluster may run with a STRIPE_SECRET_KEY',
        'Re-run setup-loadtest.sh (it writes STRIPE_SECRET_KEY= to data/loadtest-overrides.env) and restart the cluster',
      );
}

// 7 + 8. Postgres: max_connections + role-cap headroom
// The operator login: row-level security shows the application role no rows without an
// organization context, so the role-cap query below would read 0 on it and always pass.
const dbUrl = loadTestSetting('DATABASE_OPERATOR_URL') || loadTestSetting('DATABASE_URL');
if (dbUrl) {
  const client = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 5_000 });
  client.on('error', () => undefined);
  try {
    await client.connect();
    const mc = Number((await client.query('show max_connections')).rows[0].max_connections);
    mc >= 500
      ? ok('postgres max_connections', `${mc} (≥ 500)`)
      : fail(
          'postgres max_connections',
          `${mc} < 500`,
          'Recreate Postgres with -c max_connections=500 and set POSTGRES_MAX_CONNECTIONS=500',
        );
    // Connection budget the server asserts at boot — catch it here, not at boot:
    //   (API replicas + worker replicas) × DATABASE_POOL_MAX ≤ max_connections − reserved
    const poolMax = Number(loadTestSetting('DATABASE_POOL_MAX') || '10');
    const apiReplicas = Number(loadTestSetting('DEPLOYMENT_API_REPLICA_COUNT') || '1');
    const workerReplicas = Number(loadTestSetting('DEPLOYMENT_WORKER_REPLICA_COUNT') || '1');
    const reserved = Number(loadTestSetting('POSTGRES_RESERVED_CONNECTIONS') || '10');
    const required = (apiReplicas + workerReplicas) * poolMax;
    const available = mc - reserved;
    const fitPool = Math.floor(available / (apiReplicas + workerReplicas));
    required <= available
      ? ok(
          'pg connection budget',
          `(${apiReplicas} API + ${workerReplicas} worker) × pool ${poolMax} = ${required} ≤ ${available}`,
        )
      : fail(
          'pg connection budget',
          `needs ${required} > ${available} (max ${mc} − reserved ${reserved}) → server won't boot`,
          `Set DATABASE_POOL_MAX ≤ ${fitPool} (or raise POSTGRES_MAX_CONNECTIONS / lower replica counts)`,
        );
    const cap = Number(loadTestSetting('MEMBER_ROLE_MAX_PER_ORG') || '50');
    const maxRoles = Number(
      (
        await client.query(
          // Live roles only: a deleted role is kept (restorable) and does not count toward the cap.
          'select coalesce(max(c),0) m from (select organization_id, count(*) c from tenancy.roles where deleted_at is null group by organization_id) z',
        )
      ).rows[0].m,
    );
    maxRoles < cap * 0.7
      ? ok('role-cap headroom', `max ${maxRoles} roles/organization < cap ${cap}`)
      : fail(
          'role-cap headroom',
          `max ${maxRoles} roles/organization near cap ${cap} (leaks?)`,
          'Clean leaked roles — see COMPREHENSIVE-JOURNEY.md §3',
        );
  } catch (e) {
    fail('postgres checks', e.message, 'Ensure Postgres is up and DATABASE_URL is correct');
  } finally {
    await client.end().catch(() => undefined);
  }
} else {
  fail(
    'postgres checks',
    'DATABASE_URL not found',
    'Set DATABASE_OPERATOR_URL (pnpm setup:local writes it) or DATABASE_URL',
  );
}

// 9. Redis reachable from the HOST (the server connects via REDIS_URL, not in-container).
// OrbStack/Docker can leave the port-forward half-open while the container stays healthy —
// `docker exec redis-cli ping` would still PONG, but the server fails to boot with
// ioredis "Connection is closed". Probe exactly the way the app does.
{
  const redisUrl = loadTestSetting('REDIS_URL') || 'redis://localhost:6379';
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    reconnectOnError: () => false,
    lazyConnect: true,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    pong === 'PONG'
      ? ok('redis reachable', `${redisUrl} → PONG`)
      : fail(
          'redis reachable',
          `unexpected ping reply: ${pong}`,
          'Restart Redis: docker compose restart redis',
        );
  } catch (e) {
    fail(
      'redis reachable',
      `${redisUrl} host port-forward closed (${e.message})`,
      'Forward half-open — restart the container: docker compose restart redis (an in-container ping still PONGs, so check from the host)',
    );
  } finally {
    client.disconnect();
  }
}

// ---- report ----
// biome-ignore lint/suspicious/noConsole: This CLI script reports prerequisite status to stdout.
console.log('\nLoad-test prerequisites:\n');
let hardFail = 0;
for (const r of results) {
  // biome-ignore lint/suspicious/noConsole: This CLI script reports prerequisite status to stdout.
  console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  if (!r.pass) {
    hardFail += 1;
    // biome-ignore lint/suspicious/noConsole: This CLI script reports remediation guidance to stdout.
    if (r.fix) console.log(`      → ${r.fix}`);
  }
}
// biome-ignore lint/suspicious/noConsole: This CLI script reports final prerequisite status to stdout.
console.log(
  hardFail === 0
    ? `\n✅ All prerequisites met — ready to run (VUS=${TARGET_VUS}).\n`
    : `\n❌ ${hardFail} prerequisite(s) failed — fix the above before running.\n`,
);
process.exit(hardFail === 0 ? 0 : 1);
