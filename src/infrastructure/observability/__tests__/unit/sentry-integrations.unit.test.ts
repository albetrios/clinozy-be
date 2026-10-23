import { describe, expect, it, vi } from 'vitest';
import type { ErrorEvent, NodeOptions } from '@sentry/node';

/** A transaction event, as `beforeSendTransaction` receives it (`@sentry/node` exports no name for it). */
type TransactionEvent = Parameters<NonNullable<NodeOptions['beforeSendTransaction']>>[0];

/**
 * What `initSentry` hands `Sentry.init`: the integrations it installs and the data it collects.
 */
const sentryMocks = vi.hoisted(() => ({
  init: vi.fn(),
  httpIntegration: vi.fn(() => ({ name: 'Http' })),
  fastifyIntegration: vi.fn(() => ({ name: 'Fastify' })),
  postgresJsIntegration: vi.fn(() => ({ name: 'PostgresJs' })),
  postgresIntegration: vi.fn(() => ({ name: 'Postgres' })),
  redisIntegration: vi.fn(() => ({ name: 'Redis' })),
}));

vi.mock('@sentry/node', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...sentryMocks,
}));

vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: vi.fn(() => ({ name: 'ProfilingIntegration' })),
}));

vi.mock('@/shared/config/env.config.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/config/env.config.js')>();
  return {
    ...original,
    env: {
      ...original.env,
      SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
      SENTRY_TRACES_SAMPLE_RATE: 0.1,
      SENTRY_PROFILE_SAMPLE_RATE: 0,
    },
  };
});

/** The options of the one `Sentry.init` call (`initSentry` runs once per process). */
interface InitOptions {
  integrations: Array<{ name: string }>;
  dataCollection: { urlQueryParams: unknown };
  beforeSend: (event: ErrorEvent) => ErrorEvent | null;
  beforeSendTransaction: (event: TransactionEvent) => TransactionEvent | null;
}

/** What the one `initSentry()` call built: its `Sentry.init` options and its database integrations. */
interface Initialization {
  options: InitOptions;
  postgresIntegrationCalls: number;
  postgresJsIntegrationCalls: number;
}

let initialization: Promise<Initialization> | undefined;

/**
 * Runs `initSentry()` once and keeps what it built: it initializes once per process, and Vitest
 * clears mock calls before every test (`clearMocks`), so a later test reads this snapshot.
 */
function initialize(): Promise<Initialization> {
  initialization ??= (async () => {
    const { initSentry } = await import('@/infrastructure/observability/sentry/sentry.js');
    initSentry();
    return {
      options: sentryMocks.init.mock.calls[0]?.[0] as InitOptions,
      postgresIntegrationCalls: sentryMocks.postgresIntegration.mock.calls.length,
      postgresJsIntegrationCalls: sentryMocks.postgresJsIntegration.mock.calls.length,
    };
  })();
  return initialization;
}

/** The options of the one `Sentry.init` call. */
async function initOptions(): Promise<InitOptions> {
  return (await initialize()).options;
}

/** A patient search's URL, as a request that answered 5xx carries it. */
const SEARCH_URL = 'https://api.x.dev/api/v1/app/patients?limit=50&q=Priya%20Sharma';

describe('initSentry integrations', () => {
  /**
   * Database spans come from the integration for the driver this service uses — node-postgres
   * (`pg`), so `postgresIntegration`. An integration for another driver instruments nothing, and
   * no trace shows a query.
   */
  it('instruments node-postgres — the driver in use — when tracing is on', async () => {
    const { options, postgresIntegrationCalls, postgresJsIntegrationCalls } = await initialize();

    expect(postgresIntegrationCalls).toBe(1);
    expect(postgresJsIntegrationCalls).toBe(0);
    expect(options.integrations.map((integration) => integration.name)).toContain('Postgres');
    expect(options.integrations.map((integration) => integration.name)).not.toContain('PostgresJs');
  });
});

describe('initSentry — no query string reaches Sentry (SEC-01)', () => {
  it('collects no URL query parameter — dataCollection.urlQueryParams is false (SEC-01)', async () => {
    const options = await initOptions();

    expect(options.dataCollection.urlQueryParams).toBe(false);
  });

  it('beforeSend strips the query from a 5xx event on a patient search (SEC-01)', async () => {
    const { beforeSend } = await initOptions();

    const sent = beforeSend({
      type: undefined,
      message: 'Internal Server Error',
      request: { method: 'GET', url: SEARCH_URL, query_string: 'limit=50&q=Priya%20Sharma' },
    });

    expect(JSON.stringify(sent)).not.toContain('Priya');
    expect(sent?.request?.url).toBe('https://api.x.dev/api/v1/app/patients');
  });

  it('beforeSendTransaction strips the query from the request of a kept 5xx transaction (SEC-01)', async () => {
    const { beforeSendTransaction } = await initOptions();

    const sent = beforeSendTransaction({
      type: 'transaction',
      transaction: 'GET /api/v1/app/patients',
      tags: { 'http.response.status_code': 503 },
      start_timestamp: 1,
      timestamp: 2,
      request: { method: 'GET', url: SEARCH_URL, query_string: 'limit=50&q=Priya%20Sharma' },
    });

    expect(sent).not.toBeNull();
    expect(JSON.stringify(sent)).not.toContain('Priya');
    expect(sent?.request?.url).toBe('https://api.x.dev/api/v1/app/patients');
  });
});
