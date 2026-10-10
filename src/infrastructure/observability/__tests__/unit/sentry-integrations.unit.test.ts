import { describe, expect, it, vi } from 'vitest';

/**
 * Database spans come from the integration for the driver this service uses — postgres.js. The
 * `pg` integration (`postgresIntegration`) was wired before and instrumented nothing, so no trace
 * ever showed a query.
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

describe('initSentry integrations', () => {
  it('instruments postgres.js — the driver in use — when tracing is on', async () => {
    const { initSentry } = await import('@/infrastructure/observability/sentry/sentry.js');

    initSentry();

    expect(sentryMocks.postgresJsIntegration).toHaveBeenCalledOnce();
    expect(sentryMocks.postgresIntegration).not.toHaveBeenCalled();
    const [options] = sentryMocks.init.mock.calls[0] as [{ integrations: Array<{ name: string }> }];
    expect(options.integrations.map((integration) => integration.name)).toContain('PostgresJs');
  });
});
