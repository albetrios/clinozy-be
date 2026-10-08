import { describe, expect, it } from 'vitest';
import { smokeFetch } from '@/tests/smoke/helpers/smoke-client.js';

describe('Smoke: health', () => {
  it('GET /livez returns 200', async () => {
    await smokeFetch('/livez', { expectStatus: 200 });
  });

  it('requires PostgreSQL and distinguishes explicit optional Redis degradation', async () => {
    const allowOptionalRedisDegradation =
      process.env.SMOKE_ALLOW_OPTIONAL_REDIS_DEGRADED === 'true';
    const response = await smokeFetch('/readyz', {
      expectStatus: allowOptionalRedisDegradation ? [200, 503] : 200,
    });
    const body = (await response.json()) as {
      status: string;
      database: string;
      redis: string;
      bullmq: string;
    };
    // Required PostgreSQL never becomes optional because another dependency is down.
    expect(body.database).toBe('connected');
    if (response.status === 503) {
      expect(allowOptionalRedisDegradation).toBe(true);
      expect(body.status).toBe('error');
      expect(['connected', 'unavailable']).toContain(body.redis);
      expect(['connected', 'unavailable']).toContain(body.bullmq);
      expect(body.redis === 'unavailable' || body.bullmq === 'unavailable').toBe(true);
    } else {
      expect(body.status).toBe('ok');
      expect(body.redis).toBe('connected');
      expect(body.bullmq).toBe('connected');
    }
  });
});
