import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `tooling/dev/dashboards/mcp.mjs` — the MCP server agents (the be-stack-monitor agent) read the
 * local stack through. Driven end to end: a loopback stand-in for the dashboards proxy serves a
 * Prometheus payload, and the `local_metrics` tool is called over stdio as an MCP client would.
 */
const METRICS = [
  '# TYPE postgres_pool_connections gauge',
  'postgres_pool_connections{pool="primary",state="in_use",environment="local"} 7',
  'postgres_pool_connections{pool="primary",state="idle",environment="local"} 3',
  'postgres_pool_connections{pool="maintenance",state="in_use",environment="local"} 1',
  'postgres_pool_max_connections{pool="primary",environment="local"} 30',
  'postgres_pool_max_connections{pool="maintenance",environment="local"} 10',
  'postgres_pool_waiting{pool="primary",environment="local"} 4',
  'postgres_pool_waiting{pool="maintenance",environment="local"} 0',
  'http_requests_total{method="GET",route="/livez",status_code="200"} 12',
].join('\n');

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

/** A loopback stand-in for the dashboards proxy that serves `METRICS` on `/metrics`. */
async function startProxyStandIn(): Promise<string> {
  const server = createServer((request, response) => {
    response.writeHead(request.url === '/metrics' ? 200 : 404, { 'content-type': 'text/plain' });
    response.end(request.url === '/metrics' ? METRICS : '');
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Calls one tool on the MCP server over stdio and resolves with its text content. */
function callTool({ proxyUrl, toolName }: { proxyUrl: string; toolName: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tooling/dev/dashboards/mcp.mjs'], {
      env: { PATH: process.env.PATH ?? '', DASHBOARDS_PROXY_URL: proxyUrl },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('the MCP server did not answer within 10 s'));
    }, 10_000);
    let buffered = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffered += chunk.toString();
      for (const line of buffered.split('\n')) {
        if (!line.includes('"id":2')) continue;
        clearTimeout(timer);
        child.kill();
        const message = JSON.parse(line) as { result: { content: { text: string }[] } };
        resolve(message.result.content[0]?.text ?? '');
        return;
      }
    });
    const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: toolName, arguments: {} },
    });
  });
}

describe('dashboards MCP: local_metrics', () => {
  it("reports the process's pool in use against its size, and what waits for a connection", async () => {
    const text = await callTool({ proxyUrl: await startProxyStandIn(), toolName: 'local_metrics' });

    // Summed across the process's pools: 7 + 1 in use of 30 + 10; 4 + 0 waiting.
    expect(text).toContain('DB pool in use: 8 / 40');
    expect(text).toContain('DB pool waiting: 4');
    expect(text).toContain('HTTP requests: 12');
  }, 15_000);
});
