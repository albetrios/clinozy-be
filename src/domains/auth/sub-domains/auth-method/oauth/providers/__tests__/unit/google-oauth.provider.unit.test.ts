import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';
import { ServiceUnavailableError, UnauthorizedError } from '@/shared/errors/index.js';
import {
  buildGoogleOAuthRedirectUrl,
  exchangeGoogleOAuthCode,
} from '@/domains/auth/sub-domains/auth-method/oauth/providers/google-oauth.provider.js';

vi.mock('@/shared/config/env.config.js', async () => {
  const actual = await vi.importActual<typeof import('@/shared/config/env.config.js')>(
    '@/shared/config/env.config.js',
  );
  return {
    ...actual,
    env: {
      ...actual.env,
      OAUTH_GOOGLE_CLIENT_ID: 'google-client-id',
      OAUTH_GOOGLE_CLIENT_SECRET: 'google-client-secret',
      OAUTH_GOOGLE_REDIRECT_URI: 'https://app.example/callback/google',
    },
  };
});

const outboundFetchJson = vi.fn();

vi.mock('@/infrastructure/outbound/index.js', () => ({
  outboundFetchJson: (...args: unknown[]) => outboundFetchJson(...args),
  buildOutboundFetchOptions: (options: unknown) => options,
}));

/** What `outboundFetch*` throws for a provider answer outside the expected status. */
function providerAnswered(status: number): ExternalServiceError {
  return new ExternalServiceError({
    integration: 'oauth-google',
    category: status >= 500 ? 'http_5xx' : 'http_4xx',
    status,
  });
}

/** What `outboundFetch*` throws when the provider cannot be reached. */
function providerUnreachable(): ExternalServiceError {
  return new ExternalServiceError({ integration: 'oauth-google', category: 'network' });
}

describe('exchangeGoogleOAuthCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds an authorize URL carrying the PKCE S256 code_challenge', () => {
    const url = new URL(buildGoogleOAuthRedirectUrl('state-token', 'the-code-challenge'));
    expect(url.searchParams.get('state')).toBe('state-token');
    expect(url.searchParams.get('code_challenge')).toBe('the-code-challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  // Sign-in only needs identity (`openid email profile`), and nothing in this codebase reads a
  // Google refresh token — the exchange keeps `access_token` for one userinfo call and drops the
  // rest. `prompt=consent` + `access_type=offline` bought nothing and cost a Google consent screen
  // on EVERY sign-in. That screen is a real page the user clicks through, so it stayed in the
  // browser history behind the dashboard, and Back from a fresh sign-in landed on Google. Without
  // a forced prompt, Google shows UI only when it must (first consent, several signed-in accounts)
  // and otherwise completes on HTTP redirects, which leave no history entry.
  it('does not force a consent screen or request offline access', () => {
    const url = new URL(buildGoogleOAuthRedirectUrl('state-token', 'the-code-challenge'));
    expect(url.searchParams.has('prompt')).toBe(false);
    expect(url.searchParams.has('access_type')).toBe(false);
    // Identity scopes only — the reason offline access was never needed.
    expect(url.searchParams.get('scope')).toBe('openid email profile');
  });

  it('returns a normalised profile when Google reports a verified email', async () => {
    outboundFetchJson
      .mockResolvedValueOnce({ access_token: 'google-access-token' })
      .mockResolvedValueOnce({
        sub: 'google-sub-123',
        email: 'user@example.com',
        email_verified: true,
        name: 'Example User',
        picture: 'https://example.com/avatar.png',
      });

    const profile = await exchangeGoogleOAuthCode({ code: 'auth-code', codeVerifier: 'verifier' });

    expect(profile).toEqual({
      email: 'user@example.com',
      name: 'Example User',
      avatar_url: 'https://example.com/avatar.png',
      provider_user_id: 'google-sub-123',
    });

    const tokenRequest = outboundFetchJson.mock.calls[0]?.[0] as {
      init: { body: URLSearchParams };
    };
    expect(tokenRequest.init.body.get('code_verifier')).toBe('verifier');
  });

  it('rejects when email_verified is false (account-takeover guard)', async () => {
    outboundFetchJson
      .mockResolvedValueOnce({ access_token: 'google-access-token' })
      .mockResolvedValueOnce({
        sub: 'attacker-sub',
        email: 'victim@example.com',
        email_verified: false,
        name: 'Attacker',
      });

    const error = await exchangeGoogleOAuthCode({
      code: 'auth-code',
      codeVerifier: 'verifier',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toMatchObject({ messageKey: 'errors:googleEmailNotVerified' });
  });

  it('rejects when email_verified is absent (defaults to unverified)', async () => {
    outboundFetchJson
      .mockResolvedValueOnce({ access_token: 'google-access-token' })
      .mockResolvedValueOnce({ sub: 'google-sub-456', email: 'victim@example.com' });

    await expect(
      exchangeGoogleOAuthCode({ code: 'auth-code', codeVerifier: 'verifier' }),
    ).rejects.toMatchObject({
      messageKey: 'errors:googleEmailNotVerified',
    });
  });

  it('answers 401 when Google refuses the authorization code', async () => {
    outboundFetchJson.mockRejectedValueOnce(providerAnswered(400));

    const error = await exchangeGoogleOAuthCode({
      code: 'expired-code',
      codeVerifier: 'verifier',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toMatchObject({ messageKey: 'errors:googleExchangeFailed' });
  });

  it('answers 401 when Google refuses the access token on userinfo', async () => {
    outboundFetchJson
      .mockResolvedValueOnce({ access_token: 'google-access-token' })
      .mockRejectedValueOnce(providerAnswered(401));

    await expect(
      exchangeGoogleOAuthCode({ code: 'auth-code', codeVerifier: 'verifier' }),
    ).rejects.toMatchObject({ statusCode: 401, messageKey: 'errors:googleFetchUserFailed' });
  });

  it.each([
    ['unreachable', providerUnreachable()],
    ['failing with a 5xx', providerAnswered(502)],
    ['throttling with a 429', providerAnswered(429)],
  ])('answers 503 when Google is %s — the user did nothing wrong', async (_label, failure) => {
    outboundFetchJson.mockRejectedValueOnce(failure);

    const error = await exchangeGoogleOAuthCode({
      code: 'auth-code',
      codeVerifier: 'verifier',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error).toMatchObject({
      statusCode: 503,
      messageKey: 'errors:oauthProviderUnavailable',
    });
  });

  it('answers 503 when userinfo fails after a good token exchange', async () => {
    outboundFetchJson
      .mockResolvedValueOnce({ access_token: 'google-access-token' })
      .mockRejectedValueOnce(providerUnreachable());

    await expect(
      exchangeGoogleOAuthCode({ code: 'auth-code', codeVerifier: 'verifier' }),
    ).rejects.toMatchObject({ statusCode: 503, messageKey: 'errors:oauthProviderUnavailable' });
  });
});
