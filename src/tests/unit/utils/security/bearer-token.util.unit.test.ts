import { describe, it, expect } from 'vitest';
import { isBearerTokenValid } from '@/shared/utils/security/bearer-token.util.js';

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
