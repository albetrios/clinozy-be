import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';
import { ServiceUnavailableError, UnauthorizedError } from '@/shared/errors/index.js';
import {
  buildGitHubOAuthRedirectUrl,
  exchangeGitHubOAuthCode,
} from '@/domains/auth/sub-domains/auth-method/oauth/providers/github-oauth.provider.js';

vi.mock('@/shared/config/env.config.js', async () => {
  const actual = await vi.importActual<typeof import('@/shared/config/env.config.js')>(
    '@/shared/config/env.config.js',
  );
  return {
    ...actual,
    env: {
      ...actual.env,
      OAUTH_GITHUB_CLIENT_ID: 'github-client-id',
      OAUTH_GITHUB_CLIENT_SECRET: 'github-client-secret',
      OAUTH_GITHUB_REDIRECT_URI: 'https://app.example/callback/github',
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
    integration: 'oauth-github',
    category: status >= 500 ? 'http_5xx' : 'http_4xx',
    status,
  });
}

/** What `outboundFetch*` throws when the provider cannot be reached. */
function providerUnreachable(): ExternalServiceError {
  return new ExternalServiceError({ integration: 'oauth-github', category: 'network' });
}

describe('exchangeGitHubOAuthCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds an authorize URL carrying the PKCE S256 code_challenge', () => {
    const url = new URL(
      buildGitHubOAuthRedirectUrl({ state: 'state-token', codeChallenge: 'the-code-challenge' }),
    );
    expect(url.searchParams.get('state')).toBe('state-token');
    expect(url.searchParams.get('code_challenge')).toBe('the-code-challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('returns a normalised profile using the primary verified email', async () => {
    outboundFetchJson
      .mockResolvedValueOnce({ access_token: 'github-access-token' })
      .mockResolvedValueOnce({
        id: 4242,
        name: 'Octo Cat',
        avatar_url: 'https://github.example/a.png',
      })
      .mockResolvedValueOnce([
        { email: 'secondary@example.com', primary: false, verified: true },
        { email: 'octo@example.com', primary: true, verified: true },
      ]);

    const profile = await exchangeGitHubOAuthCode({ code: 'auth-code', codeVerifier: 'verifier' });

    expect(profile).toEqual({
      email: 'octo@example.com',
      name: 'Octo Cat',
      avatar_url: 'https://github.example/a.png',
      provider_user_id: '4242',
    });

    const tokenRequest = outboundFetchJson.mock.calls[0]?.[0] as { init: { body: string } };
    expect(JSON.parse(tokenRequest.init.body).code_verifier).toBe('verifier');
  });

  it('rejects when the primary email is not verified (no unverified fallback)', async () => {
    outboundFetchJson
      .mockResolvedValueOnce({ access_token: 'github-access-token' })
      .mockResolvedValueOnce({ id: 99, name: 'Attacker' })
      .mockResolvedValueOnce([{ email: 'victim@example.com', primary: true, verified: false }]);

    const error = await exchangeGitHubOAuthCode({
      code: 'auth-code',
      codeVerifier: 'verifier',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toMatchObject({ messageKey: 'errors:githubUserMissingVerifiedEmail' });
  });

  it('does not fall back to an unverified non-primary email', async () => {
    outboundFetchJson
      .mockResolvedValueOnce({ access_token: 'github-access-token' })
      .mockResolvedValueOnce({ id: 7, name: 'Attacker' })
      .mockResolvedValueOnce([{ email: 'victim@example.com', primary: false, verified: false }]);

    await expect(
      exchangeGitHubOAuthCode({ code: 'auth-code', codeVerifier: 'verifier' }),
    ).rejects.toMatchObject({
      messageKey: 'errors:githubUserMissingVerifiedEmail',
    });
  });

  it('answers 401 when GitHub refuses the code (an `error` in a 200 body)', async () => {
    outboundFetchJson.mockResolvedValueOnce({ error: 'bad_verification_code' });

    await expect(
      exchangeGitHubOAuthCode({ code: 'expired-code', codeVerifier: 'verifier' }),
    ).rejects.toMatchObject({ statusCode: 401, messageKey: 'errors:githubTokenMissing' });
  });

  it.each([
    ['unreachable', providerUnreachable()],
    ['failing with a 5xx', providerAnswered(503)],
  ])('answers 503 when GitHub is %s during the token exchange', async (_label, failure) => {
    outboundFetchJson.mockRejectedValueOnce(failure);

    const error = await exchangeGitHubOAuthCode({
      code: 'auth-code',
      codeVerifier: 'verifier',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error).toMatchObject({ messageKey: 'errors:oauthProviderUnavailable' });
  });

  it('answers 401 (no verified email) when GitHub refuses the email list', async () => {
    outboundFetchJson
      .mockResolvedValueOnce({ access_token: 'github-access-token' })
      .mockResolvedValueOnce({ id: 4242, name: 'Octo Cat' })
      .mockRejectedValueOnce(providerAnswered(403));

    await expect(
      exchangeGitHubOAuthCode({ code: 'auth-code', codeVerifier: 'verifier' }),
    ).rejects.toMatchObject({
      statusCode: 401,
      messageKey: 'errors:githubUserMissingVerifiedEmail',
    });
  });

  it('answers 503 when the email list fails — not a misleading "no verified email"', async () => {
    outboundFetchJson
      .mockResolvedValueOnce({ access_token: 'github-access-token' })
      .mockResolvedValueOnce({ id: 4242, name: 'Octo Cat' })
      .mockRejectedValueOnce(providerAnswered(502));

    await expect(
      exchangeGitHubOAuthCode({ code: 'auth-code', codeVerifier: 'verifier' }),
    ).rejects.toMatchObject({ statusCode: 503, messageKey: 'errors:oauthProviderUnavailable' });
  });
});
