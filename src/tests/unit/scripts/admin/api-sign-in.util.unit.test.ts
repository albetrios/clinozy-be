import { verify } from 'otplib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signInOverApi } from '@/scripts/admin/api-sign-in.util.js';

/**
 * A-2 follow-up: `tool:admin-token` signs in as a platform admin, whose password login answers
 * `mfa_required`. The sign-in completes `POST /auth/mfa/login` with a TOTP code from the account's
 * secret, and retries once on the next time step when the code was just used by another tool.
 */
const SECRET = 'MFSG22LOFV2G623FNYWWS3TUMVTXEYLUNFXW4LLGNF4HI5LSMU'; // gitleaks:allow
const API_PREFIX = 'http://127.0.0.1:3000/api/v1';

function answer(status: number, data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const mfaChallenge = () => answer(200, { mfa_required: true, mfa_session_token: 'mst_1' });

describe('signInOverApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns the access token of a password-only sign-in', async () => {
    const fetchMock = vi.fn(async () => answer(200, { access_token: 'token-password' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      signInOverApi({ apiPrefix: API_PREFIX, email: 'a@example.com', password: 'p' }),
    ).resolves.toBe('token-password');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('completes an MFA challenge with a TOTP code the secret verifies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mfaChallenge())
      .mockResolvedValueOnce(answer(200, { access_token: 'token-mfa' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      signInOverApi({
        apiPrefix: API_PREFIX,
        email: 'ops@example.com',
        password: 'p',
        totpSecret: SECRET,
      }),
    ).resolves.toBe('token-mfa');

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(`${API_PREFIX}/auth/mfa/login`);
    const body = JSON.parse(String(init.body)) as { mfa_session_token: string; totp_code: string };
    expect(body.mfa_session_token).toBe('mst_1');
    expect((await verify({ secret: SECRET, token: body.totp_code })).valid).toBe(true);
  });

  it('retries once on the next time step when the code is refused', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mfaChallenge())
      .mockResolvedValueOnce(answer(401, {}))
      .mockResolvedValueOnce(mfaChallenge())
      .mockResolvedValueOnce(answer(200, { access_token: 'token-retried' }));
    vi.stubGlobal('fetch', fetchMock);

    const signIn = signInOverApi({
      apiPrefix: API_PREFIX,
      email: 'ops@example.com',
      password: 'p',
      totpSecret: SECRET,
    });
    await vi.advanceTimersByTimeAsync(31_000);

    await expect(signIn).resolves.toBe('token-retried');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('stops instead of returning a token when the MFA challenge has no secret', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mfaChallenge()),
    );
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(
        signInOverApi({ apiPrefix: API_PREFIX, email: 'ops@example.com', password: 'p' }),
      ).rejects.toThrow('process.exit');
      expect(exit).toHaveBeenCalledWith(1);
      expect(String(error.mock.calls[0]?.[0])).toContain('ADMIN_TOTP_SECRET');
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
  });
});
