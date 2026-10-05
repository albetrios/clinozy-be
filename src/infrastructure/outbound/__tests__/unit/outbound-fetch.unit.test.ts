import { describe, it, expect, vi } from 'vitest';
import { outboundFetch, outboundFetchJson } from '@/infrastructure/outbound/outbound-fetch.js';
import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';

describe('outboundFetch', () => {
  it('forwards X-Request-Id when requestId is provided', async () => {
    const fetchImplementation = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Headers;
      expect(headers.get('X-Request-Id')).toBe('req-abc-123');
      return new Response('{}', { status: 200 });
    });

    await outboundFetch({
      name: 'oauth-github',
      url: 'https://example.com/token',
      requestId: 'req-abc-123',
      expectedStatus: 200,
      fetchImplementation,
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('throws ExternalServiceError for unexpected HTTP status', async () => {
    const fetchImplementation = vi.fn(async () => new Response('bad', { status: 502 }));

    const rejection = outboundFetch({
      name: 'oauth-google',
      url: 'https://example.com/token',
      expectedStatus: 200,
      fetchImplementation,
    });

    await expect(rejection).rejects.toMatchObject({
      integration: 'oauth-google',
      category: 'http_5xx',
      status: 502,
    });
    await expect(rejection).rejects.toBeInstanceOf(ExternalServiceError);
  });
});

describe('outboundFetchJson', () => {
  it('returns the parsed JSON body', async () => {
    const fetchImplementation = vi.fn(
      async () => new Response('{"access_token":"token-value"}', { status: 200 }),
    );

    await expect(
      outboundFetchJson<{ access_token: string }>({
        name: 'oauth-google',
        url: 'https://example.com/token',
        expectedStatus: 200,
        fetchImplementation,
      }),
    ).resolves.toEqual({ access_token: 'token-value' });
  });

  it('turns a body that is not JSON into an ExternalServiceError, not a raw SyntaxError', async () => {
    const fetchImplementation = vi.fn(
      async () => new Response('<html>maintenance</html>', { status: 200 }),
    );

    const rejection = outboundFetchJson({
      name: 'oauth-github',
      url: 'https://example.com/user',
      expectedStatus: 200,
      fetchImplementation,
    });

    await expect(rejection).rejects.toBeInstanceOf(ExternalServiceError);
    await expect(rejection).rejects.toMatchObject({
      integration: 'oauth-github',
      statusCode: 503,
    });
  });

  it('classifies an unexpected status before reading the body', async () => {
    const fetchImplementation = vi.fn(async () => new Response('bad', { status: 401 }));

    await expect(
      outboundFetchJson({
        name: 'oauth-google',
        url: 'https://example.com/userinfo',
        expectedStatus: 200,
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ category: 'http_4xx', status: 401 });
  });
});
