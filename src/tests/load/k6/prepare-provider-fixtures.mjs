// Prepares everything `pnpm test:stripe:load` hands the billing-provider lifecycle: a fresh migrated
// scratch database, synthetic tenants (repository test factories) and — with an `sk_test_` key —
// the four-plan Stripe sandbox catalog, reused when present and created once when missing.
// Run as `node --import tsx` with every DATABASE_*URL already pointing at the scratch database.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PLAN_TIERS } from './helpers/plan-tiers.js';

const repo = process.cwd();
const require = createRequire(`${repo}/package.json`);
const [outputDirectory] = process.argv.slice(2);
if (!outputDirectory) throw new Error('Usage: prepare-provider-fixtures.mjs <output directory>');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const migrationUrl = new URL(process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL);
const database = migrationUrl.pathname.slice(1);
if (!(LOCAL_HOSTS.has(migrationUrl.hostname) && /(?:^|_)(load|test)(?:_|$)/.test(database))) {
  throw new Error('Provider fixtures need a local load/test scratch database');
}
// Stable marker for sandbox objects this preparation owns (earlier runs used the same purpose).
const CATALOG_PURPOSE = 'load-validation';

async function recreateDatabase() {
  const serverUrl = new URL(migrationUrl);
  serverUrl.pathname = '/postgres';
  const admin = require('postgres')(serverUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${database}" TEMPLATE template0`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  const code = await new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['db:migrate'], { cwd: repo, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (code !== 0) throw new Error('Scratch database migration failed');
}

/** One synthetic user with an all-permission TEAM organization and its own PERSONAL organization. */
async function createActor(factories) {
  const password = `Provider!${randomBytes(18).toString('hex')}`;
  const { user } = await factories.createTestUserWithPassword({
    email: `provider-${randomBytes(8).toString('hex')}@example.com`,
    password,
    isEmailVerified: true,
    firstName: 'Synthetic',
    lastName: 'Provider',
  });
  const organizations = {};
  for (const type of ['TEAM', 'PERSONAL']) {
    const organization = await factories.createTestOrganization({
      ownerUserId: user.id,
      name: `Synthetic provider ${type}`,
      type,
    });
    const role = await factories.createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: factories.SYSTEM_PERMISSIONS.map((permission) => permission.code),
      createdByUserId: user.id,
    });
    await factories.createMembership({
      userId: user.id,
      organizationId: organization.id,
      roleId: role.id,
      status: 'ACTIVE',
    });
    organizations[type] = organization.public_id;
  }
  return {
    email: user.email,
    password,
    userPublicId: user.public_id,
    organizationPublicId: organizations.TEAM,
    personalOrganizationPublicId: organizations.PERSONAL,
  };
}

async function prepareActors() {
  // Like every entrypoint: env files first (NODE_ENV=local keeps the scratch URLs passed in).
  await import(`${repo}/src/shared/config/load-env-files.ts`);
  const [users, organizations, permissions, reference, connection, operator] = await Promise.all([
    import(`${repo}/src/tests/factories/user.factory.ts`),
    import(`${repo}/src/tests/factories/organization.factory.ts`),
    import(`${repo}/src/domains/tenancy/__tests__/factories/permission.factory.ts`),
    import(`${repo}/src/domains/tenancy/sub-domains/permission/seed/permission.reference.seed.ts`),
    import(`${repo}/src/infrastructure/database/connection.ts`),
    import(`${repo}/src/tests/helpers/operator-database.ts`),
  ]);
  const factories = { ...users, ...organizations, ...permissions, ...reference };
  try {
    await factories.seedAllPermissions();
    // Each lane needs distinct, unsubscribed teams: seven plan/cycle journeys + one foreign tenant.
    const lanes = { sandbox: [], contract: [], k6: [] };
    for (const [lane, size] of [
      ['sandbox', 8],
      ['contract', 8],
      ['k6', 4],
    ]) {
      for (let index = 0; index < size; index++) lanes[lane].push(await createActor(factories));
    }
    return lanes;
  } finally {
    await connection.closeDatabase();
    await operator.getOperatorSql().end({ timeout: 5 });
  }
}

/** Reuses this account's sandbox catalog by metadata; creates only what is missing. */
async function prepareCatalog(key) {
  const Stripe = require('stripe');
  const stripe = new Stripe(key, { timeout: 15_000, maxNetworkRetries: 1 });
  if ((await stripe.balance.retrieve()).livemode !== false)
    throw new Error('Live Stripe prohibited');
  const owned = [];
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.metadata?.purpose === CATALOG_PURPOSE) owned.push(product);
  }
  const products = [];
  for (const tier of PLAN_TIERS) {
    let product = owned
      .filter((candidate) => candidate.name.includes(` ${tier.tier} — `))
      .sort((left, right) => left.created - right.created)[0];
    product ??= await stripe.products.create({
      name: `Load validation ${tier.tier} — Sandbox`,
      description: `Synthetic ${tier.tier} plan with ${tier.seats} included seats. Stripe sandbox only.`,
      metadata: { purpose: CATALOG_PURPOSE },
    });
    const existingPrices = [];
    for await (const price of stripe.prices.list({ product: product.id, active: true, limit: 100 }))
      existingPrices.push(price);
    const prices = [];
    for (const cycle of ['monthly', 'yearly']) {
      if (tier[cycle] === null) continue;
      const interval = cycle === 'monthly' ? 'month' : 'year';
      const matches = (price) =>
        price.unit_amount === tier[cycle] * 100 &&
        price.currency === 'usd' &&
        price.recurring?.interval === interval &&
        price.recurring?.interval_count === 1;
      const price =
        existingPrices.find(matches) ??
        (await stripe.prices.create({
          product: product.id,
          unit_amount: tier[cycle] * 100,
          currency: 'usd',
          recurring: { interval },
        }));
      prices.push({ id: price.id, cycle });
    }
    products.push({
      id: product.id,
      title: product.name,
      description: product.description,
      prices,
    });
  }
  return { realStripeSandbox: true, products };
}

await recreateDatabase();
const actors = await prepareActors();
const files = {
  providerPool: `${outputDirectory}/provider-pool.json`,
  k6Pool: `${outputDirectory}/k6-pool.json`,
  catalog: null,
};
writeFileSync(
  files.providerPool,
  JSON.stringify({ sandbox: actors.sandbox, contract: actors.contract }),
  { mode: 0o600 },
);
writeFileSync(files.k6Pool, JSON.stringify(actors.k6), { mode: 0o600 });
const key = process.env.STRIPE_SECRET_KEY;
if (key?.startsWith('sk_test_')) {
  files.catalog = `${outputDirectory}/catalog.json`;
  writeFileSync(files.catalog, JSON.stringify(await prepareCatalog(key), null, 2), { mode: 0o600 });
}
writeFileSync(`${outputDirectory}/fixtures.json`, JSON.stringify(files, null, 2));
