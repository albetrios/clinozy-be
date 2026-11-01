import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerScalarApiReference } from '@/infrastructure/api-reference/scalar-api-reference.js';
import { resetEnvCacheForTests } from '@/shared/config/env.config.js';

/**
 * D-8: `/reference` is unauthenticated when enabled, and it re-read the OpenAPI file from disk on
 * every request. The spec is now read once, at registration: a change to the file after boot is
 * not seen, and a missing file fails registration instead of each request.
 */

function openApiDocument(title: string): string {
  return JSON.stringify({ openapi: '3.0.0', info: { title, version: '1.0.0' }, paths: {} });
}

describe('registerScalarApiReference', () => {
  let directory: string;
  let specPath: string;
  let application: FastifyInstance | undefined;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'api-reference-'));
    specPath = join(directory, 'openapi.json');
    vi.stubEnv('ENABLE_API_REFERENCE', 'true');
    vi.stubEnv('ENABLE_MCP_SERVER', 'false');
    vi.stubEnv('OPENAPI_SPEC_PATH', specPath);
    resetEnvCacheForTests();
  });

  afterEach(async () => {
    await application?.close();
    application = undefined;
    rmSync(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it('serves the spec read at registration, not the file as it is at request time', async () => {
    writeFileSync(specPath, openApiDocument('read-at-registration'));
    application = Fastify({ logger: false });
    await registerScalarApiReference(application);
    await application.ready();

    writeFileSync(specPath, openApiDocument('rewritten-after-boot'));
    rmSync(specPath);

    for (const attempt of [1, 2]) {
      const response = await application.inject({ method: 'GET', url: '/reference/openapi.json' });
      expect(response.statusCode, `request ${attempt}`).toBe(200);
      expect(response.body).toContain('read-at-registration');
      expect(response.body).not.toContain('rewritten-after-boot');
    }
  });

  it('fails registration when the spec file is missing', async () => {
    application = Fastify({ logger: false });
    await expect(registerScalarApiReference(application)).rejects.toThrow(
      /OpenAPI spec not found.*pnpm docs:generate/,
    );
  });
});
