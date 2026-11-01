import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMcpSdk, registerMcpRouteHandlers } from '@/infrastructure/mcp/mcp-server.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';

/**
 * The MCP route handlers end to end on a bare Fastify app, with the real SDK:
 * - D-9: the per-request server and transport are both closed when the response closes;
 * - C-3: `call_api` injects the normalised path the policy checked, so a dot segment (raw or
 *   percent-encoded) cannot walk out of `/api/v1/` to a route the policy never allowed.
 */

const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

function callApiRequest(path: string): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'call_api', arguments: { method: 'GET', path } },
  };
}

function toolText(body: string): string {
  const parsed = JSON.parse(body) as { result?: { content?: { text?: string }[] } };
  return parsed.result?.content?.[0]?.text ?? '';
}

describe('MCP route handlers', () => {
  let app: FastifyInstance;
  const hiddenRouteHits = vi.fn();

  beforeEach(async () => {
    hiddenRouteHits.mockReset();
    app = Fastify();
    app.get('/internal/hidden', async () => {
      hiddenRouteHits();
      return { hidden: true };
    });
    app.get('/api/v1/visible', async () => ({ visible: true }));
    await registerMcpRouteHandlers({ app, options: { name: 'test', version: '0.0.0' } });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('closes the per-request transport and server when the response closes (D-9)', async () => {
    const sdk = await loadMcpSdk();
    const transportClose = vi.spyOn(sdk.StreamableHTTPServerTransport.prototype, 'close');
    const serverClose = vi.spyOn(sdk.McpServer.prototype, 'close');

    const response = await app.inject({
      method: 'POST',
      url: testApiPath('/mcp'),
      headers: MCP_HEADERS,
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    });
    expect(response.statusCode).toBe(200);

    await vi.waitFor(() => {
      expect(transportClose).toHaveBeenCalled();
      expect(serverClose).toHaveBeenCalledTimes(1);
    });
  });

  it('calls an allowed /api/v1/ path through call_api', async () => {
    const response = await app.inject({
      method: 'POST',
      url: testApiPath('/mcp'),
      headers: MCP_HEADERS,
      payload: callApiRequest('/api/v1/visible'),
    });
    const text = toolText(response.body);
    expect(JSON.parse(text)).toMatchObject({ statusCode: 200, body: '{"visible":true}' });
  });

  it.each([
    '/api/v1/../internal/hidden',
    '/api/v1/%2e%2e/internal/hidden',
    '/api/v1/%2E%2e/internal/hidden',
    '/api/v1/.%2e/internal/hidden',
    '/api/v1/visible/../../../internal/hidden',
  ])('refuses the traversal %s and never reaches the hidden route (C-3)', async (path) => {
    const response = await app.inject({
      method: 'POST',
      url: testApiPath('/mcp'),
      headers: MCP_HEADERS,
      payload: callApiRequest(path),
    });
    expect(toolText(response.body)).toMatch(/without dot segments/);
    expect(hiddenRouteHits).not.toHaveBeenCalled();
  });
});
