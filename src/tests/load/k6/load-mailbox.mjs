import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import postgres from 'postgres';
import dotenv from 'dotenv';

/** Loopback-only test mailbox: reads committed email links from an explicitly selected scratch database. */
const local = existsSync('.env.local') ? dotenv.parse(readFileSync('.env.local')) : {};
const environment = { ...local, ...process.env };
const databaseUrl = new URL(environment.DATABASE_OPERATOR_URL || environment.DATABASE_URL);
const authorization = process.env.LOAD_MAILBOX_TOKEN;
const allowedEmailPrefix = process.env.LOAD_MAILBOX_EMAIL_PREFIX;
if (
  process.env.TEST_MODE !== 'true' ||
  !process.env.LOAD_MAILBOX_DATABASE ||
  !authorization ||
  authorization.length < 32 ||
  !allowedEmailPrefix
)
  throw new Error(
    'Explicit TEST_MODE, scratch database, email prefix and mailbox authorization required',
  );
// Never allow this credential-bearing helper to select the normal application database.
if (
  !/(?:^|_)(load|test)(?:_|$)/.test(process.env.LOAD_MAILBOX_DATABASE) ||
  databaseUrl.pathname.slice(1) === process.env.LOAD_MAILBOX_DATABASE
)
  throw new Error('Mailbox database must differ from configured application database');
databaseUrl.pathname = `/${process.env.LOAD_MAILBOX_DATABASE}`;
const database = postgres(databaseUrl.toString(), { max: 2 });
function findMailToken({ rows, kind, invitationId }) {
  for (const row of rows) {
    for (const match of row.html.matchAll(/href="([^"]+)"/g)) {
      const link = new URL(
        match[1]
          .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, entity) =>
            String.fromCodePoint(
              Number.parseInt(
                entity.startsWith('x') ? entity.slice(1) : entity,
                entity.startsWith('x') ? 16 : 10,
              ),
            ),
          )
          .replaceAll('&amp;', '&'),
      );
      if (
        kind === 'invitation' &&
        !(invitationId && link.pathname.endsWith(`/accept-invite/${invitationId}`))
      )
        continue;
      if (kind === 'password-reset' && !link.pathname.endsWith('/auth/password/reset')) continue;
      const token = link.searchParams.get('token');
      if (token) {
        return token;
      }
    }
  }
  return null;
}
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  try {
    if (
      !['GET', 'POST'].includes(request.method) ||
      request.headers.authorization !== `Bearer ${authorization}`
    ) {
      response.writeHead(403).end('{}');
      return;
    }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'POST' && url.pathname === '/team-plan') {
      const organizationId = url.searchParams.get('organization_id');
      const [organization] =
        await database`SELECT id FROM tenancy.organizations WHERE public_id=${organizationId} AND slug LIKE 'load-team-%' AND deleted_at IS NULL`;
      const [plan] =
        await database`SELECT id FROM billing.plans WHERE is_active=true AND (included_seats IS NULL OR included_seats >= 2) ORDER BY id LIMIT 1`;
      if (!(organization && plan)) {
        response.writeHead(400).end('{}');
        return;
      }
      await database.begin(async (transaction) => {
        await transaction`SELECT set_config('app.current_organization_public_id', ${organizationId}, true)`;
        await transaction`INSERT INTO billing.subscriptions (public_id, organization_id, plan_id, billing_cycle, status, current_period_start, current_period_end, provider, provider_subscription_id) VALUES (${`sub_${randomBytes(16).toString('hex').slice(0, 21)}`}, ${organization.id}, ${plan.id}, 'MONTHLY', 'ACTIVE', now(), now() + interval '30 days', NULL, NULL)`;
      });
      response.end(JSON.stringify({ data: { localSubscriptionFixture: true } }));
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(400).end('{}');
      return;
    }
    const email = url.searchParams.get('email');
    const invitationId = url.searchParams.get('invitation_id');
    const kind = url.searchParams.get('kind');
    if (
      !(email?.startsWith(allowedEmailPrefix) && ['invitation', 'password-reset'].includes(kind))
    ) {
      response.writeHead(400).end('{}');
      return;
    }
    const rows =
      await database`SELECT html FROM auth.mail_outbox WHERE to_addresses @> ${database.json([email])}::jsonb ORDER BY created_at DESC, id DESC LIMIT 20`;
    const token = findMailToken({ rows, kind, invitationId });
    if (token) {
      response.end(JSON.stringify({ data: { token } }));
      return;
    }
    response.writeHead(404).end('{}');
  } catch {
    response.writeHead(500).end('{}');
  }
});
server.listen(Number(process.env.LOAD_MAILBOX_PORT || '3003'), '127.0.0.1');
async function close() {
  server.close();
  await database.end();
}
process.once('SIGTERM', close);
process.once('SIGINT', close);
