import { afterEach, describe, it, expect, vi } from 'vitest';
import { resetEnvCacheForTests } from '@/shared/config/env.config.js';
import {
  isBearerTokenValid,
  isMetricsScrapeTokenPresented,
} from '@/shared/utils/security/bearer-token.util.js';

describe('bearer-token.util', () => {
  it('returns true for a header with the matching Bearer scheme and token', () => {
    expect(
      isBearerTokenValid({
        authorizationHeader: 'Bearer s3cret-token',
        expectedBearerToken: 's3cret-token',
      }),
    ).toBe(true);
  });

  it('returns false when the authorization header is missing', () => {
    expect(
      isBearerTokenValid({ expectedBearerToken: 's3cret-token', authorizationHeader: undefined }),
    ).toBe(false);
  });

  it('returns false for an empty authorization header', () => {
    expect(
      isBearerTokenValid({ authorizationHeader: '', expectedBearerToken: 's3cret-token' }),
    ).toBe(false);
  });

  it('returns false when the scheme is not Bearer', () => {
    expect(
      isBearerTokenValid({
        authorizationHeader: 'Basic s3cret-token',
        expectedBearerToken: 's3cret-token',
      }),
    ).toBe(false);
  });

  it('returns false when scheme casing differs (case-sensitive)', () => {
    expect(
      isBearerTokenValid({
        authorizationHeader: 'bearer s3cret-token',
        expectedBearerToken: 's3cret-token',
      }),
    ).toBe(false);
  });

  it('returns false when the token differs from the expected token', () => {
    expect(
      isBearerTokenValid({
        authorizationHeader: 'Bearer wrong-token',
        expectedBearerToken: 's3cret-token',
      }),
    ).toBe(false);
  });

  it('returns false when only the prefix matches', () => {
    expect(
      isBearerTokenValid({ authorizationHeader: 'Bearer ', expectedBearerToken: 's3cret-token' }),
    ).toBe(false);
  });

  it('returns false when token is appended with trailing characters', () => {
    expect(
      isBearerTokenValid({
        authorizationHeader: 'Bearer s3cret-token-extra',
        expectedBearerToken: 's3cret-token',
      }),
    ).toBe(false);
  });

  it('returns false when token has leading whitespace before scheme', () => {
    expect(
      isBearerTokenValid({
        authorizationHeader: ' Bearer s3cret-token',
        expectedBearerToken: 's3cret-token',
      }),
    ).toBe(false);
  });
});

describe('isMetricsScrapeTokenPresented', () => {
  const token = 'scrape-token-scrape-token-scrape-token';

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it('accepts exactly the configured METRICS_SCRAPE_TOKEN as a Bearer header', () => {
    vi.stubEnv('METRICS_SCRAPE_TOKEN', token);
    resetEnvCacheForTests();
    expect(isMetricsScrapeTokenPresented(`Bearer ${token}`)).toBe(true);
    expect(isMetricsScrapeTokenPresented(`Bearer ${token}x`)).toBe(false);
    expect(isMetricsScrapeTokenPresented(undefined)).toBe(false);
  });

  it('refuses every request when no scrape token is configured', () => {
    vi.stubEnv('METRICS_ENABLED', 'false');
    vi.stubEnv('METRICS_SCRAPE_TOKEN', undefined);
    resetEnvCacheForTests();
    expect(isMetricsScrapeTokenPresented('Bearer ')).toBe(false);
    expect(isMetricsScrapeTokenPresented(undefined)).toBe(false);
  });
});
