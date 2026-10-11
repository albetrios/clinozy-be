import { NotImplementedError, UnauthorizedError } from '@/shared/errors/index.js';
import { env } from '@/shared/config/env.config.js';
import { DEFAULT_FRONTEND_URL } from '@/shared/constants/index.js';
import { buildOutboundFetchOptions, outboundFetchJson } from '@/infrastructure/outbound/index.js';
import { toOAuthProviderFailure } from '@/domains/auth/sub-domains/auth-method/oauth/providers/oauth-provider-failure.util.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import type { OAuthProfile } from '@/domains/auth/sub-domains/auth-method/oauth/oauth.types.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** The OIDC userinfo fields the sign-in reads. */
type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function getGoogleRedirectUri(): string {
  // The redirect URI is the SPA's provider-specific /callback/google page: the browser
  // lands there with `code`+`state`, and the SPA forwards them to this API's
  // GET /api/v1/auth/oauth/google/callback for the token exchange.
  return (
    env.OAUTH_GOOGLE_REDIRECT_URI ?? `${env.FRONTEND_URL ?? DEFAULT_FRONTEND_URL}/callback/google`
  );
}

/**
 * Builds the Google authorize URL (`https://accounts.google.com/o/oauth2/v2/auth?...`) with the
 * configured client id, callback URI, OIDC scopes, CSRF `state` and the PKCE S256 `code_challenge`.
 * Throws `NotImplementedError` when `OAUTH_GOOGLE_CLIENT_ID` is unset.
 *
 * @remarks
 * Deliberately sends no `prompt` and no `access_type`. Sign-in needs identity only, and nothing
 * here reads a Google refresh token — {@link exchangeGoogleOAuthCode} keeps `access_token` for a
 * single userinfo call and discards the rest. `prompt=consent` (paired with `access_type=offline`
 * to mint that unused refresh token) forced Google's consent screen on every sign-in; that screen
 * is a page the user clicks through, so it stayed in the browser history behind the dashboard and
 * Back from a fresh sign-in landed on Google. Left unset, Google shows UI only when it has to —
 * first-time consent, or several signed-in accounts to choose between — and otherwise completes
 * on HTTP redirects, which add no history entry.
 */
export function buildGoogleOAuthRedirectUrl({
  state,
  codeChallenge,
}: {
  state: string;
  codeChallenge: string;
}): string {
  const clientId = env.OAUTH_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new NotImplementedError('errors:googleOAuthNotConfigured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** Input for {@link exchangeGoogleOAuthCode}: the authorization `code` returned by Google, the PKCE `codeVerifier` bound to the original authorize request, plus an optional request id used for outbound observability. */
export interface ExchangeGoogleOAuthCodeOptions {
  code: string;
  codeVerifier: string;
  requestId?: string;
}

/** Trades the Google authorization code for an access token, fetches the OIDC userinfo response, and returns a normalised {@link OAuthProfile}. Rejects responses whose `email_verified` is not strictly `true` to prevent find-or-link account takeover. Google refusing the code or token is a 401 with a provider-specific i18n key; Google failing (network, timeout, 5xx, a body that is not JSON) is a 503 (`toOAuthProviderFailure`). */
export async function exchangeGoogleOAuthCode(
  options: ExchangeGoogleOAuthCodeOptions,
): Promise<OAuthProfile> {
  const clientId = env.OAUTH_GOOGLE_CLIENT_ID;
  const clientSecret = env.OAUTH_GOOGLE_CLIENT_SECRET;
  if (!(clientId && clientSecret)) {
    throw new NotImplementedError('errors:googleOAuthNotConfigured');
  }

  let tokenData: { access_token?: string };
  try {
    tokenData = await outboundFetchJson<{ access_token?: string }>(
      buildOutboundFetchOptions({
        name: 'oauth-google',
        url: GOOGLE_TOKEN_URL,
        requestId: options.requestId,
        expectedStatus: 200,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: options.code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: getGoogleRedirectUri(),
            grant_type: 'authorization_code',
            code_verifier: options.codeVerifier,
          }),
        },
      }),
    );
  } catch (error) {
    throw toOAuthProviderFailure({ error, rejectedMessageKey: 'errors:googleExchangeFailed' });
  }

  if (!tokenData.access_token) {
    throw new UnauthorizedError('errors:googleTokenMissingAccessToken');
  }

  let userInfo: GoogleUserInfo;
  try {
    userInfo = await outboundFetchJson<GoogleUserInfo>(
      buildOutboundFetchOptions({
        name: 'oauth-google',
        url: GOOGLE_USERINFO_URL,
        requestId: options.requestId,
        expectedStatus: 200,
        init: {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        },
      }),
    );
  } catch (error) {
    throw toOAuthProviderFailure({ error, rejectedMessageKey: 'errors:googleFetchUserFailed' });
  }

  if (!(userInfo.email && userInfo.sub)) {
    throw new UnauthorizedError('errors:googleUserMissingEmailOrSub');
  }

  // Reject accounts whose email Google has not verified: linking by an
  // attacker-controlled unverified address would enable account takeover.
  if (userInfo.email_verified !== true) {
    throw new UnauthorizedError('errors:googleEmailNotVerified');
  }

  return omitUndefined({
    email: userInfo.email,
    name: userInfo.name,
    avatar_url: userInfo.picture,
    provider_user_id: userInfo.sub,
  });
}
