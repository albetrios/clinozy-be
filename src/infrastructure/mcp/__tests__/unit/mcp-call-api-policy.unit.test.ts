import { describe, expect, it } from 'vitest';
import { evaluateCallApiPolicy } from '@/infrastructure/mcp/mcp-capabilities.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';

/**
 * R14: the MCP `call_api` tool is an admin-authority in-process API proxy. `evaluateCallApiPolicy`
 * consolidates every gate it enforces — the `/api/v1/` (+ health) path gate, the read-only-by-
 * default method restriction, and the optional operator path-prefix allowlist.
 */
describe('evaluateCallApiPolicy (R14)', () => {
  const base = { allowMutations: false, allowedPathPrefixes: [] as string[] };

  it('allows GET to /api/v1/ paths by default', () => {
    expect(evaluateCallApiPolicy({ ...base, method: 'GET', path: '/api/v1/audit/logs' })).toEqual({
      allowed: true,
      url: testApiPath('/audit/logs'),
    });
  });

  it('allows GET to the health endpoints', () => {
    expect(evaluateCallApiPolicy({ ...base, method: 'GET', path: '/livez' })).toEqual({
      allowed: true,
      url: '/livez',
    });
    expect(evaluateCallApiPolicy({ ...base, method: 'GET', path: '/readyz' })).toEqual({
      allowed: true,
      url: '/readyz',
    });
  });

  it('rejects paths outside the allowed roots', () => {
    const result = evaluateCallApiPolicy({ ...base, method: 'GET', path: '/internal/secrets' });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.message).toMatch(/must start with \/api\/v1\//);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'rejects %s by default (read-only unless MCP_CALL_API_ALLOW_MUTATIONS)',
    (method) => {
      const result = evaluateCallApiPolicy({
        ...base,
        method,
        path: '/api/v1/tenancy/organization',
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed)
        expect(result.message).toMatch(/read-only unless MCP_CALL_API_ALLOW_MUTATIONS/);
    },
  );

  it('allows mutating methods only when allowMutations is true', () => {
    expect(
      evaluateCallApiPolicy({
        ...base,
        allowMutations: true,
        method: 'DELETE',
        path: '/api/v1/tenancy/organization',
      }),
    ).toEqual({ allowed: true, url: testApiPath('/tenancy/organization') });
  });

  it('enforces the optional path-prefix allowlist when configured', () => {
    const allowedPathPrefixes = ['/api/v1/audit/'];
    expect(
      evaluateCallApiPolicy({
        allowMutations: false,
        allowedPathPrefixes,
        method: 'GET',
        path: '/api/v1/audit/logs',
      }),
    ).toEqual({ allowed: true, url: testApiPath('/audit/logs') });

    const blocked = evaluateCallApiPolicy({
      allowMutations: false,
      allowedPathPrefixes,
      method: 'GET',
      path: '/api/v1/billing/subscriptions',
    });
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.message).toMatch(/allowlist/);
  });

  it.each([
    '/api/v1/../admin/queues',
    '/api/v1/audit/../../admin/queues',
    '/api/v1/%2e%2e/admin/queues',
    '/api/v1/%2E%2E/admin/queues',
    '/api/v1/.%2e/admin/queues',
    '/api/v1/%2e./admin/queues',
    '/api/v1/./audit/logs',
    '/api/v1/%2e/audit/logs',
    '/api/v1/audit/..',
    '/api/v1/x%2f..%2fadmin',
    '/api/v1/x%5c..%5cadmin',
    '/api/v1\\..\\admin',
    '/api/v1/.\t./admin/queues',
    '//evil.example/api/v1/audit/logs',
    'api/v1/audit/logs',
  ])('rejects the dot-segment or separator trick %s (C-3)', (path) => {
    const result = evaluateCallApiPolicy({ ...base, method: 'GET', path });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.message).toMatch(/without dot segments/);
  });

  it('checks the allowlist against the normalised path, so a traversal cannot leave the prefix (C-3)', () => {
    const allowedPathPrefixes = ['/api/v1/audit/'];
    for (const path of [
      '/api/v1/audit/../billing/subscriptions',
      '/api/v1/audit/%2e%2e/billing/subscriptions',
    ]) {
      expect(
        evaluateCallApiPolicy({ allowMutations: false, allowedPathPrefixes, method: 'GET', path })
          .allowed,
      ).toBe(false);
    }
  });

  it('keeps the query string and screens only the path part', () => {
    expect(
      evaluateCallApiPolicy({ ...base, method: 'GET', path: '/api/v1/audit/logs?next=../x%2Fy' }),
    ).toEqual({ allowed: true, url: testApiPath('/audit/logs?next=../x%2Fy') });
  });
});
