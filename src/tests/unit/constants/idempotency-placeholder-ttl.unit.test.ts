import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_PLACEHOLDER_MAX_HOLD_SECONDS,
  IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS,
  IDEMPOTENCY_PLACEHOLDER_TTL_SECONDS,
} from '@/shared/constants/ttl.constants.js';

describe('idempotency placeholder claim window', () => {
  it('keeps a 60 second claim, a 20 second refresh, and a 10 minute max hold', () => {
    expect(IDEMPOTENCY_PLACEHOLDER_TTL_SECONDS).toBe(60);
    expect(IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS).toBe(20_000);
    expect(IDEMPOTENCY_PLACEHOLDER_MAX_HOLD_SECONDS).toBe(600);
  });

  it('declares the 60 second claim as its own literal', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/shared/constants/ttl.constants.ts'),
      'utf8',
    );
    expect(source).toMatch(/export const IDEMPOTENCY_PLACEHOLDER_TTL_SECONDS = 60;/);
    expect(source).not.toContain('resolveIdempotencyPlaceholderTtlSeconds');
  });
});
