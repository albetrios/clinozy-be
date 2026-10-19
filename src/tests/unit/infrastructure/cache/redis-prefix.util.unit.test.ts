import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetEnvCacheForTests } from '@/shared/config/env.config.js';
import { resolveRedisKeyPrefix } from '@/infrastructure/cache/redis-prefix.util.js';
import { REDIS_KEY_PREFIX_STEM } from '@/shared/constants/project-identity.constants.js';

/** The worker's harness prefix (`<stem>:worker-<n>:test:`, src/tests/setup.ts), restored after each case. */
const HARNESS_PREFIX = process.env.REDIS_KEY_PREFIX;

describe('resolveRedisKeyPrefix', () => {
  beforeEach(() => {
    delete process.env.REDIS_KEY_PREFIX;
    process.env.NODE_ENV = 'development';
    resetEnvCacheForTests();
  });

  afterEach(() => {
    // Restore the harness prefix so other suites stay isolated.
    process.env.REDIS_KEY_PREFIX = HARNESS_PREFIX;
    process.env.NODE_ENV = 'development';
    resetEnvCacheForTests();
  });

  it('defaults to <product>:<NODE_ENV>: from the identity stem when REDIS_KEY_PREFIX is unset', () => {
    // The stem is generated from the identity manifest — a hardcoded product name here survived a
    // rename once and kept every key under the old name.
    expect(resolveRedisKeyPrefix()).toBe(`${REDIS_KEY_PREFIX_STEM}:development:`);
  });

  it('uses the full environment name, never an abbreviation', () => {
    process.env.NODE_ENV = 'local';
    resetEnvCacheForTests();
    expect(resolveRedisKeyPrefix()).toBe(`${REDIS_KEY_PREFIX_STEM}:local:`);
  });

  it('uses REDIS_KEY_PREFIX override and ensures trailing colon', () => {
    process.env.REDIS_KEY_PREFIX = 'myapp:preview-123';
    expect(resolveRedisKeyPrefix()).toBe('myapp:preview-123:');
  });
});
