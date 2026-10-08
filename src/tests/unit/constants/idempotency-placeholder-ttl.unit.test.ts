import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_PLACEHOLDER_TTL_BUFFER_SECONDS,
  MILLISECONDS_PER_SECOND,
  resolveIdempotencyPlaceholderTtlSeconds,
  THIRTY_SECONDS_MS,
} from '@/shared/constants/ttl.constants.js';

describe('resolveIdempotencyPlaceholderTtlSeconds', () => {
  it('outlives the default request timeout by the buffer', () => {
    expect(resolveIdempotencyPlaceholderTtlSeconds(THIRTY_SECONDS_MS)).toBe(
      THIRTY_SECONDS_MS / MILLISECONDS_PER_SECOND + IDEMPOTENCY_PLACEHOLDER_TTL_BUFFER_SECONDS,
    );
  });

  it('outlives a 10 minute request timeout', () => {
    const tenMinutesMs = 600_000;
    expect(resolveIdempotencyPlaceholderTtlSeconds(tenMinutesMs)).toBe(
      600 + IDEMPOTENCY_PLACEHOLDER_TTL_BUFFER_SECONDS,
    );
  });

  it('rounds a fractional second up before adding the buffer', () => {
    expect(resolveIdempotencyPlaceholderTtlSeconds(1_001)).toBe(
      2 + IDEMPOTENCY_PLACEHOLDER_TTL_BUFFER_SECONDS,
    );
  });
});
