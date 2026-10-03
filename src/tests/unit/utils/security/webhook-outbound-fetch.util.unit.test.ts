import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

vi.mock('node:http', () => ({
  request: vi.fn(),
}));

vi.mock('node:https', () => ({
  request: vi.fn(),
}));

const mockedLookup = vi.mocked(lookup);
const mockedHttpRequest = vi.mocked(httpRequest);
const mockedHttpsRequest = vi.mocked(httpsRequest);

function mockDnsLookupAll(addresses: Array<{ address: string; family: 4 | 6 }>): void {
  mockedLookup.mockResolvedValue(addresses as unknown as Awaited<ReturnType<typeof lookup>>);
}

describe('webhook-outbound-fetch.util', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockedLookup.mockReset();
    mockedHttpRequest.mockReset();
    mockedHttpsRequest.mockReset();
  });

  it('resolveAndPinWebhookUrl returns pinned public IPv4 and port', async () => {
    mockDnsLookupAll([{ address: '93.184.216.34', family: 4 }]);
    const { resolveAndPinWebhookUrl } = await import(
      '@/shared/utils/security/webhook-outbound-fetch.util.js'
    );
    const resolution = await resolveAndPinWebhookUrl('https://hooks.example.com/path');
    expect(resolution.pinnedAddress).toBe('93.184.216.34');
    expect(resolution.port).toBe(443);
    expect(resolution.parsed.hostname).toBe('hooks.example.com');
    expect(mockedLookup).toHaveBeenCalledOnce();
  });

  it('rejects hostname not on WEBHOOK_URL_ALLOWLIST when configured', async () => {
    vi.stubEnv('WEBHOOK_URL_ALLOWLIST', 'allowed.example.com');
    mockDnsLookupAll([{ address: '93.184.216.34', family: 4 }]);
    const { resolveAndPinWebhookUrl } = await import(
      '@/shared/utils/security/webhook-outbound-fetch.util.js'
    );
    await expect(resolveAndPinWebhookUrl('https://evil.example/hook')).rejects.toMatchObject({
      messageKey: 'errors:webhookUrlNotAllowed',
    });
  });

  it('rejects subdomains of an allowlist entry that has no wildcard prefix', async () => {
    vi.stubEnv('WEBHOOK_URL_ALLOWLIST', 'allowed.example.com');
    mockDnsLookupAll([{ address: '93.184.216.34', family: 4 }]);
    const { resolveAndPinWebhookUrl } = await import(
      '@/shared/utils/security/webhook-outbound-fetch.util.js'
    );
    await expect(
      resolveAndPinWebhookUrl('https://hooks.allowed.example.com/path'),
    ).rejects.toMatchObject({ messageKey: 'errors:webhookUrlNotAllowed' });
  });

  it('allows subdomains when the allowlist entry uses explicit wildcard syntax (*.domain)', async () => {
    vi.stubEnv('WEBHOOK_URL_ALLOWLIST', '*.allowed.example.com');
    mockDnsLookupAll([{ address: '93.184.216.34', family: 4 }]);
    const { resolveAndPinWebhookUrl } = await import(
      '@/shared/utils/security/webhook-outbound-fetch.util.js'
    );
    await expect(
      resolveAndPinWebhookUrl('https://hooks.allowed.example.com/path'),
    ).resolves.toMatchObject({ pinnedAddress: '93.184.216.34' });
  });

  it('rejects the apex domain itself when the allowlist entry is a wildcard', async () => {
    vi.stubEnv('WEBHOOK_URL_ALLOWLIST', '*.allowed.example.com');
    mockDnsLookupAll([{ address: '93.184.216.34', family: 4 }]);
    const { resolveAndPinWebhookUrl } = await import(
      '@/shared/utils/security/webhook-outbound-fetch.util.js'
    );
    await expect(resolveAndPinWebhookUrl('https://allowed.example.com/path')).rejects.toMatchObject(
      { messageKey: 'errors:webhookUrlNotAllowed' },
    );
  });

  it('createPinnedWebhookFetch connects to pinned IP (no second DNS lookup on fetch)', async () => {
    mockDnsLookupAll([{ address: '93.184.216.34', family: 4 }]);

    let capturedHost: string | undefined;
    mockedHttpsRequest.mockImplementation(((options, responseCallback) => {
      const requestOptions = options as RequestOptions;
      capturedHost = requestOptions.host ?? undefined;
      const response = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        on: (event: string, handler: (chunk?: Buffer) => void) => {
          if (event === 'data') handler(Buffer.from(''));
          if (event === 'end') handler();
        },
      } as IncomingMessage;
      (responseCallback as (response: IncomingMessage) => void)(response);
      return { on: vi.fn(), end: vi.fn() } as unknown as ReturnType<typeof httpsRequest>;
    }) as typeof httpsRequest);

    const { createPinnedWebhookFetch } = await import(
      '@/shared/utils/security/webhook-outbound-fetch.util.js'
    );
    const pinnedFetch = await createPinnedWebhookFetch('https://hooks.example.com/deliver');
    await pinnedFetch('https://hooks.example.com/deliver', { method: 'POST', body: '{}' });

    expect(capturedHost).toBe('93.184.216.34');
    expect(mockedLookup).toHaveBeenCalledOnce();
  });

  it('aborts and rejects when the response body exceeds the 64 KB ceiling', async () => {
    mockDnsLookupAll([{ address: '93.184.216.34', family: 4 }]);

    const destroy = vi.fn();
    mockedHttpsRequest.mockImplementation(((options, responseCallback) => {
      void (options as RequestOptions);
      const oversizedChunk = Buffer.alloc(65 * 1024, 0x61);
      // Defer like real Node so `const request = httpsRequest(...)` is assigned before the
      // response callback (which references `request.destroy()`) runs.
      setImmediate(() => {
        const response = {
          statusCode: 200,
          statusMessage: 'OK',
          headers: {},
          on: (event: string, handler: (chunk?: Buffer) => void) => {
            if (event === 'data') handler(oversizedChunk);
            if (event === 'end') handler();
          },
        } as IncomingMessage;
        (responseCallback as (response: IncomingMessage) => void)(response);
      });
      return { on: vi.fn(), end: vi.fn(), destroy } as unknown as ReturnType<typeof httpsRequest>;
    }) as typeof httpsRequest);

    const { createPinnedWebhookFetch } = await import(
      '@/shared/utils/security/webhook-outbound-fetch.util.js'
    );
    const pinnedFetch = await createPinnedWebhookFetch('https://hooks.example.com/deliver');

    await expect(
      pinnedFetch('https://hooks.example.com/deliver', { method: 'POST', body: '{}' }),
    ).rejects.toThrow(/response_too_large/);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('does not re-resolve DNS when lookup would return private IP on a second query', async () => {
    let lookupCount = 0;
    mockedLookup.mockImplementation(async () => {
      lookupCount += 1;
      if (lookupCount === 1) {
        return [{ address: '93.184.216.34', family: 4 }] as unknown as Awaited<
          ReturnType<typeof lookup>
        >;
      }
      return [{ address: '10.0.0.1', family: 4 }] as unknown as Awaited<ReturnType<typeof lookup>>;
    });

    let capturedHost: string | undefined;
    mockedHttpsRequest.mockImplementation(((options, responseCallback) => {
      const requestOptions = options as RequestOptions;
      capturedHost = requestOptions.host ?? undefined;
      const response = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        on: (event: string, handler: (chunk?: Buffer) => void) => {
          if (event === 'data') handler(Buffer.from(''));
          if (event === 'end') handler();
        },
      } as IncomingMessage;
      (responseCallback as (response: IncomingMessage) => void)(response);
      return { on: vi.fn(), end: vi.fn() } as unknown as ReturnType<typeof httpsRequest>;
    }) as typeof httpsRequest);

    const { createPinnedWebhookFetch } = await import(
      '@/shared/utils/security/webhook-outbound-fetch.util.js'
    );
    const pinnedFetch = await createPinnedWebhookFetch('https://rebind.example/hook');
    await pinnedFetch('https://rebind.example/hook', { method: 'POST', body: '{}' });

    expect(capturedHost).toBe('93.184.216.34');
    expect(lookupCount).toBe(1);
  });

  describe('response conversion never throws out of the response listeners', () => {
    type ResponseEvent = ['data', Buffer] | ['end'] | ['error', Error] | ['close'];

    /**
     * Delivers the response AFTER the promise executor returned (setImmediate), exactly like real
     * Node — a throw from a listener would then escape the promise and reach the process-wide
     * fatal handler instead of rejecting the fetch.
     */
    function mockTargetResponse(options: {
      statusCode: number;
      headers?: Record<string, string>;
      events: ResponseEvent[];
    }): void {
      mockDnsLookupAll([{ address: '93.184.216.34', family: 4 }]);
      mockedHttpsRequest.mockImplementation(((_options, responseCallback) => {
        const listeners = new Map<string, (argument?: Buffer | Error) => void>();
        setImmediate(() => {
          const response = {
            statusCode: options.statusCode,
            statusMessage: '',
            headers: options.headers ?? {},
            on: (event: string, handler: (argument?: Buffer | Error) => void) => {
              listeners.set(event, handler);
            },
          } as unknown as IncomingMessage;
          (responseCallback as (response: IncomingMessage) => void)(response);
          for (const [event, argument] of options.events) listeners.get(event)?.(argument);
        });
        return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() } as unknown as ReturnType<
          typeof httpsRequest
        >;
      }) as typeof httpsRequest);
    }

    async function deliver(): Promise<Response> {
      const { createPinnedWebhookFetch } = await import(
        '@/shared/utils/security/webhook-outbound-fetch.util.js'
      );
      const pinnedFetch = await createPinnedWebhookFetch('https://hooks.example.com/deliver');
      return pinnedFetch('https://hooks.example.com/deliver', { method: 'POST', body: '{}' });
    }

    it.each([204, 205, 304])('resolves an empty %s with a null body', async (statusCode) => {
      mockTargetResponse({ statusCode, events: [['end'], ['close']] });
      const response = await deliver();
      expect(response.status).toBe(statusCode);
      expect(response.body).toBeNull();
    });

    it('keeps the body of an ordinary 200', async () => {
      mockTargetResponse({ statusCode: 200, events: [['data', Buffer.from('ok')], ['end']] });
      const response = await deliver();
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('ok');
    });

    it('rejects a status Response cannot represent', async () => {
      mockTargetResponse({ statusCode: 600, events: [['end']] });
      await expect(deliver()).rejects.toThrow('webhook.fetch.invalid_response');
    });

    it('rejects a header value Headers refuses', async () => {
      mockTargetResponse({
        statusCode: 200,
        headers: { 'x-bad': 'line\nbreak' },
        events: [['end']],
      });
      await expect(deliver()).rejects.toThrow('webhook.fetch.invalid_response');
    });

    it('rejects when the response stream errors', async () => {
      mockTargetResponse({ statusCode: 200, events: [['error', new Error('socket reset')]] });
      await expect(deliver()).rejects.toThrow('socket reset');
    });

    it('rejects when the connection closes before the body ends', async () => {
      mockTargetResponse({ statusCode: 200, events: [['data', Buffer.from('par')], ['close']] });
      await expect(deliver()).rejects.toThrow('webhook.fetch.connection_closed');
    });

    it('converts headers and a null-body status without the network', async () => {
      const { toWebhookFetchResponse } = await import(
        '@/shared/utils/security/webhook-outbound-fetch.util.js'
      );
      const response = toWebhookFetchResponse({
        statusCode: 204,
        statusMessage: 'No Content',
        headers: { 'set-cookie': ['a=1', 'b=2'], 'x-request-id': 'abc' },
        body: Buffer.alloc(0),
      });
      expect(response.status).toBe(204);
      expect(response.body).toBeNull();
      expect(response.headers.get('x-request-id')).toBe('abc');
    });
  });
});
