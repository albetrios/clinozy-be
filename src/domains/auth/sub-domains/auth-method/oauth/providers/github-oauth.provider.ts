import { NotImplementedError, UnauthorizedError } from '@/shared/errors/index.js';
import { env } from '@/shared/config/env.config.js';
import { DEFAULT_FRONTEND_URL } from '@/shared/constants/index.js';
import { buildOutboundFetchOptions, outboundFetchJson } from '@/infrastructure/outbound/index.js';
import {
  isOAuthProviderRejection,
  toOAuthProviderFailure,
} from '@/domains/auth/sub-domains/auth-method/oauth/providers/oauth-provider-failure.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import type { OAuthProfile } from '@/domains/auth/sub-domains/auth-method/oauth/oauth.types.js';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

/** The token endpoint's answer: GitHub reports a refused code as `error` in a 200 body. */
type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
};

/** The profile fields the sign-in reads. */
type GitHubUser = {
  id?: number;
  name?: string;
  avatar_url?: string;
};

/** One entry of `GET /user/emails`. */
type GitHubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

function getGitHubRedirectUri(): string {
  // The redirect URI is the SPA's provider-specific /callback/github page: the browser
  // lands there with `code`+`state`, and the SPA forwards them to this API's
  // GET /api/v1/auth/oauth/github/callback for the token exchange.
  return (
    env.OAUTH_GITHUB_REDIRECT_URI ?? `${env.FRONTEND_URL ?? DEFAULT_FRONTEND_URL}/callback/github`
  );
}

/** Builds the GitHub authorize URL (`https://github.com/login/oauth/authorize?...`) with the configured client id, callback URI, scopes (`read:user user:email`), CSRF `state`, and the PKCE S256 `code_challenge`. Throws `NotImplementedError` when `OAUTH_GITHUB_CLIENT_ID` is unset. */
export function buildGitHubOAuthRedirectUrl(state: string, codeChallenge: string): string {
  const clientId = env.OAUTH_GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new NotImplementedError('errors:githubOAuthNotConfigured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGitHubRedirectUri(),
    scope: 'read:user user:email',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

/** Input for {@link exchangeGitHubOAuthCode}: the authorization `code` returned by GitHub, the PKCE `codeVerifier` bound to the original authorize request, plus an optional request id used for outbound observability. */
export interface ExchangeGitHubOAuthCodeOptions {
  code: string;
  codeVerifier: string;
  requestId?: string;
}

/** Trades the GitHub authorization code for an access token, then fetches the user profile and requires a primary + verified email from the emails endpoint before returning a normalised {@link OAuthProfile}. Unverified or non-primary addresses are rejected to prevent find-or-link account takeover. GitHub refusing the code or token is a 401 with a provider-specific i18n key; GitHub failing (network, timeout, 5xx, a body that is not JSON) is a 503 (`toOAuthProviderFailure`). */
export async function exchangeGitHubOAuthCode(
  options: ExchangeGitHubOAuthCodeOptions,
): Promise<OAuthProfile> {
  const clientId = env.OAUTH_GITHUB_CLIENT_ID;
  const clientSecret = env.OAUTH_GITHUB_CLIENT_SECRET;
  if (!(clientId && clientSecret)) {
    throw new NotImplementedError('errors:githubOAuthNotConfigured');
  }

  let tokenData: GitHubTokenResponse;
  try {
    tokenData = await outboundFetchJson<GitHubTokenResponse>(
      buildOutboundFetchOptions({
        name: 'oauth-github',
        url: GITHUB_TOKEN_URL,
        requestId: options.requestId,
        expectedStatus: 200,
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: options.code,
            code_verifier: options.codeVerifier,
          }),
        },
      }),
    );
  } catch (error) {
    throw toOAuthProviderFailure({ error, rejectedMessageKey: 'errors:githubExchangeFailed' });
  }

  if (tokenData.error || !tokenData.access_token) {
    throw new UnauthorizedError(
      'errors:githubTokenMissing',
      undefined,
      tokenData.error ?? 'GitHub token response missing access_token',
    );
  }

  const authorizedInit = {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
    },
  };

  let userInfo: GitHubUser;
  try {
    userInfo = await outboundFetchJson<GitHubUser>(
      buildOutboundFetchOptions({
        name: 'oauth-github',
        url: GITHUB_USER_URL,
        requestId: options.requestId,
        expectedStatus: 200,
        init: authorizedInit,
      }),
    );
  } catch (error) {
    throw toOAuthProviderFailure({ error, rejectedMessageKey: 'errors:githubFetchUserFailed' });
  }

  // Always resolve the email from the dedicated emails endpoint and require a
  // primary + verified address. The top-level `user.email` field and any
  // unverified fallback are intentionally ignored: linking by an
  // attacker-controlled unverified address would enable account takeover.
  let emails: GitHubEmail[] = [];
  try {
    emails = await outboundFetchJson<GitHubEmail[]>(
      buildOutboundFetchOptions({
        name: 'oauth-github',
        url: GITHUB_EMAILS_URL,
        requestId: options.requestId,
        expectedStatus: 200,
        init: authorizedInit,
      }),
    );
  } catch (error) {
    // GitHub refusing the list (e.g. the token lacks `user:email`) leaves no verified email —
    // the guard below answers 401. GitHub failing is a 503, not a misleading 401.
    if (!isOAuthProviderRejection(error)) {
      throw toOAuthProviderFailure({ error, rejectedMessageKey: 'errors:githubFetchUserFailed' });
    }
  }
  const primaryVerifiedEmail = Array.isArray(emails)
    ? emails.find((emailRecord) => emailRecord.primary && emailRecord.verified)?.email
    : undefined;

  if (!(primaryVerifiedEmail && userInfo.id)) {
    throw new UnauthorizedError('errors:githubUserMissingVerifiedEmail');
  }

  const email = primaryVerifiedEmail;

  return omitUndefined({
    email,
    name: userInfo.name,
    avatar_url: userInfo.avatar_url,
    provider_user_id: String(userInfo.id),
  });
}
