import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/node';
import { redactSentryEvent } from '@/infrastructure/observability/sentry/sentry.js';
import { SENSITIVE_REDACTION_PLACEHOLDER } from '@/shared/utils/security/sensitive-redaction.util.js';

describe('redactSentryEvent', () => {
  it('redacts request headers, cookies and body', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        headers: { Authorization: 'Bearer secret', 'content-type': 'application/json' },
        cookies: { session_id: 'sess-123' },
        data: { password: 'hunter2', name: 'visible' },
      },
    };

    const redacted = redactSentryEvent(event);

    expect(redacted.request?.headers?.Authorization).toBe(SENSITIVE_REDACTION_PLACEHOLDER);
    expect(redacted.request?.headers?.['content-type']).toBe('application/json');
    expect(redacted.request?.cookies?.session_id).toBe(SENSITIVE_REDACTION_PLACEHOLDER);
    expect(redacted.request?.data).toEqual({
      password: SENSITIVE_REDACTION_PLACEHOLDER,
      name: 'visible',
    });
  });

  it('strips the query from a 5xx event on a patient search — request.url keeps its path, request.query_string is dropped (SEC-01)', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'Internal Server Error',
      request: {
        method: 'GET',
        url: 'https://api.x.dev/api/v1/app/patients?limit=50&q=Priya%20Sharma',
        query_string: 'limit=50&q=Priya%20Sharma',
      },
    };

    const redacted = redactSentryEvent(event);

    expect(JSON.stringify(redacted)).not.toContain('Priya');
    expect(redacted.request?.url).toBe('https://api.x.dev/api/v1/app/patients');
    expect(redacted.request).not.toHaveProperty('query_string');
    expect(redacted.request?.method).toBe('GET');
  });

  it.each([
    [
      'an absolute URL with a fragment',
      'https://api.x.dev/api/v1/app/leads?q=9876#top',
      'https://api.x.dev/api/v1/app/leads',
    ],
    ['a relative URL', '/api/v1/app/appointments?q=%23123', '/api/v1/app/appointments'],
    [
      'a secret-bearing query',
      'https://api.example.com/v1/items?raw_key=sk_live',
      'https://api.example.com/v1/items',
    ],
    ['a fragment alone', '/api/v1/app/patients#q=Priya', '/api/v1/app/patients'],
    ['a URL without a query', '/api/v1/app/patients', '/api/v1/app/patients'],
  ])('strips the query and the fragment from request.url — %s (SEC-01)', (_label, url, path) => {
    const redacted = redactSentryEvent({ type: undefined, request: { url } });

    expect(redacted.request?.url).toBe(path);
  });

  it('redacts breadcrumbs, extras, and contexts', () => {
    const event: ErrorEvent = {
      type: undefined,
      breadcrumbs: [
        {
          data: { 'X-Api-Key': 'k-123', route: '/readyz' },
        },
      ],
      extra: { api_key: 'secret', count: 2 },
      contexts: {
        request: { headers: { cookie: 'session=zzz' } },
      },
    };

    const redacted = redactSentryEvent(event);

    expect(redacted.breadcrumbs?.[0]?.data?.['X-Api-Key']).toBe(SENSITIVE_REDACTION_PLACEHOLDER);
    expect(redacted.breadcrumbs?.[0]?.data?.route).toBe('/readyz');
    expect(redacted.extra?.api_key).toBe(SENSITIVE_REDACTION_PLACEHOLDER);
    expect(redacted.extra?.count).toBe(2);
    expect(redacted.contexts?.request).toEqual({
      headers: { cookie: SENSITIVE_REDACTION_PLACEHOLDER },
    });
  });
});
