import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import {
  injectAuthenticated,
  injectUnauthenticated,
} from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { generateTestTokenWithActiveSession } from '@/tests/helpers/test-auth.js';
import { seedRecentStepUpForTestUser } from '@/tests/helpers/test-step-up.helper.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import {
  createSoftwareAuthenticationResponse,
  createSoftwareRegistrationResponse,
  createSoftwareWebauthnCredential,
  type SoftwareWebauthnCredential,
} from '@/tests/helpers/webauthn-authenticator.helper.js';
import { webauthn_credentials } from '@/domains/auth/sub-domains/auth-webauthn/webauthn-credential.schema.js';
import type { FastifyInstance } from 'fastify';

/** The browser origin the passkey ceremonies run on — the `ALLOWED_ORIGINS` entry from `src/tests/setup.ts`. */
const BROWSER_ORIGIN = 'http://localhost:3000';

type CeremonyOptionsBody<Options> = { data: { options: Options; challenge_token: string } };

/**
 * No `@simplewebauthn/server` mocks: a software P-256 authenticator produces real attestations and
 * assertions, so registration and sign-in pass only when the library verifies the challenge, the
 * origin, the relying-party id hash and the ES256 signature for real.
 */
describe('Auth e2e: WebAuthn passkey enrolment and sign-in', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { app: testApplication } = await createTestApp();
    app = testApplication;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function createSignedInUser(email: string) {
    const user = await createTestUser({ email, isEmailVerified: true });
    const { token, sessionPublicId } = await generateTestTokenWithActiveSession(
      app,
      user.public_id,
    );
    return { user, token, sessionPublicId };
  }

  async function requestRegistrationOptions(token: string) {
    const response = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/me/webauthn/register/options'),
      token,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as CeremonyOptionsBody<PublicKeyCredentialCreationOptionsJSON>).data;
  }

  async function registerPasskey(options: {
    token: string;
    credential: SoftwareWebauthnCredential;
  }) {
    const registrationOptions = await requestRegistrationOptions(options.token);
    const payload = {
      challenge_token: registrationOptions.challenge_token,
      response: createSoftwareRegistrationResponse({
        credential: options.credential,
        creationOptions: registrationOptions.options,
        origin: BROWSER_ORIGIN,
      }),
    };
    const response = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/me/webauthn/register/verify'),
      token: options.token,
      headers: { origin: BROWSER_ORIGIN },
      payload,
    });
    return { response, payload, userHandle: registrationOptions.options.user.id };
  }

  async function requestAuthenticationOptions(email: string) {
    const response = await injectUnauthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/webauthn/authenticate/options'),
      payload: { email },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as CeremonyOptionsBody<PublicKeyCredentialRequestOptionsJSON>).data;
  }

  function submitAssertion(payload: { challenge_token: string; response: unknown }) {
    return injectUnauthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/webauthn/authenticate/verify'),
      headers: { origin: BROWSER_ORIGIN },
      payload,
    });
  }

  it('registers a real passkey, signs in with a real assertion, and refuses both replays', async () => {
    const { user, token, sessionPublicId } = await createSignedInUser(
      'webauthn-passkey-flow@example.com',
    );
    await seedRecentStepUpForTestUser(user.public_id, sessionPublicId);
    const credential = createSoftwareWebauthnCredential();

    const registration = await registerPasskey({ token, credential });
    expect(registration.response.statusCode).toBe(200);
    const registerVerifyBody = registration.response.json() as {
      data: { verified: boolean; credential_id: string };
    };
    expect(registerVerifyBody.data.verified).toBe(true);
    expect(registerVerifyBody.data.credential_id).toMatch(/^wac_[a-z0-9]{21}$/);

    // Replaying the identical registration: the challenge was consumed on first use.
    const registrationReplay = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/me/webauthn/register/verify'),
      token,
      headers: { origin: BROWSER_ORIGIN },
      payload: registration.payload,
    });
    expect(registrationReplay.statusCode).toBe(401);

    const listResponse = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath('/auth/me/webauthn/credentials'),
      token,
    });
    expect(listResponse.statusCode).toBe(200);
    const listed = (listResponse.json() as { data: Array<Record<string, unknown>> }).data;
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(registerVerifyBody.data.credential_id);
    expect(listed[0]?.device_type).toBe('singleDevice');
    expect(listed[0]?.transports).toEqual(['internal']);
    for (const keyMaterialField of ['public_key', 'credential_id', 'counter', 'user_id']) {
      expect(listed[0]).not.toHaveProperty(keyMaterialField);
    }

    const authenticationOptions = await requestAuthenticationOptions(user.email);
    expect(authenticationOptions.options.allowCredentials ?? []).toEqual([]);
    const assertionPayload = {
      challenge_token: authenticationOptions.challenge_token,
      response: createSoftwareAuthenticationResponse({
        credential,
        requestOptions: authenticationOptions.options,
        origin: BROWSER_ORIGIN,
        userHandle: registration.userHandle,
      }),
    };
    const signInResponse = await submitAssertion(assertionPayload);
    expect(signInResponse.statusCode).toBe(200);
    const signInBody = signInResponse.json() as { data: { access_token: string } };
    expect(signInBody.data.access_token).toBeTruthy();

    const cookies = signInResponse.headers['set-cookie'];
    const sessionCookie = Array.isArray(cookies)
      ? cookies.find((cookie: string) => cookie.startsWith('session_id='))
      : typeof cookies === 'string' && cookies.startsWith('session_id=')
        ? cookies
        : undefined;
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');

    // The passkey session belongs to the credential's owner.
    const profileResponse = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath('/users/me'),
      token: signInBody.data.access_token,
    });
    expect(profileResponse.statusCode).toBe(200);
    expect((profileResponse.json() as { data: { id: string } }).data.id).toBe(user.public_id);

    // Replaying the identical signed assertion: the challenge was consumed on first use.
    const assertionReplay = await submitAssertion(assertionPayload);
    expect(assertionReplay.statusCode).toBe(401);

    const storedCredentials = await getOperatorDatabase().select().from(webauthn_credentials);
    expect(storedCredentials).toHaveLength(1);
    expect(storedCredentials[0]?.credential_id).toBe(credential.credentialId);
    expect(storedCredentials[0]?.public_id).toBe(registerVerifyBody.data.credential_id);
    expect(storedCredentials[0]?.public_key).toBeTruthy();
    expect(storedCredentials[0]?.counter).toBe(1);
  });

  it('rejects an assertion whose signature does not verify against the stored public key', async () => {
    const { user, token, sessionPublicId } = await createSignedInUser(
      'webauthn-forged-assertion@example.com',
    );
    await seedRecentStepUpForTestUser(user.public_id, sessionPublicId);
    const credential = createSoftwareWebauthnCredential();
    const registration = await registerPasskey({ token, credential });
    expect(registration.response.statusCode).toBe(200);

    // Same credential id, but signed by a different private key.
    const impostor = {
      ...createSoftwareWebauthnCredential(),
      credentialId: credential.credentialId,
    };
    const authenticationOptions = await requestAuthenticationOptions(user.email);
    const forgedResponse = await submitAssertion({
      challenge_token: authenticationOptions.challenge_token,
      response: createSoftwareAuthenticationResponse({
        credential: impostor,
        requestOptions: authenticationOptions.options,
        origin: BROWSER_ORIGIN,
        userHandle: registration.userHandle,
      }),
    });
    expect(forgedResponse.statusCode).toBe(401);
    expect(forgedResponse.headers['set-cookie']).toBeUndefined();

    const storedCredentials = await getOperatorDatabase().select().from(webauthn_credentials);
    expect(storedCredentials[0]?.counter).toBe(0);
  });

  it('rejects ceremonies signed for another origin as client errors, never a 500', async () => {
    const { user, token, sessionPublicId } = await createSignedInUser(
      'webauthn-foreign-origin@example.com',
    );
    await seedRecentStepUpForTestUser(user.public_id, sessionPublicId);
    const foreignOrigin = 'https://attacker.example';

    // The library throws on an origin mismatch; the service must answer 400, not crash.
    const registrationOptions = await requestRegistrationOptions(token);
    const foreignRegistration = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/auth/me/webauthn/register/verify'),
      token,
      headers: { origin: BROWSER_ORIGIN },
      payload: {
        challenge_token: registrationOptions.challenge_token,
        response: createSoftwareRegistrationResponse({
          credential: createSoftwareWebauthnCredential(),
          creationOptions: registrationOptions.options,
          origin: foreignOrigin,
        }),
      },
    });
    expect(foreignRegistration.statusCode).toBe(400);
    expect(await getOperatorDatabase().select().from(webauthn_credentials)).toHaveLength(0);

    await seedRecentStepUpForTestUser(user.public_id, sessionPublicId);
    const credential = createSoftwareWebauthnCredential();
    const registration = await registerPasskey({ token, credential });
    expect(registration.response.statusCode).toBe(200);
    const authenticationOptions = await requestAuthenticationOptions(user.email);
    const foreignAssertion = await submitAssertion({
      challenge_token: authenticationOptions.challenge_token,
      response: createSoftwareAuthenticationResponse({
        credential,
        requestOptions: authenticationOptions.options,
        origin: foreignOrigin,
        userHandle: registration.userHandle,
      }),
    });
    expect(foreignAssertion.statusCode).toBe(401);
    expect(foreignAssertion.headers['set-cookie']).toBeUndefined();
  });

  it('rejects re-registering an already-enrolled passkey with 409 (not a 500)', async () => {
    const { user, token, sessionPublicId } = await createSignedInUser(
      'webauthn-duplicate-credential@example.com',
    );
    const credential = createSoftwareWebauthnCredential();

    // The register ceremony is a step-up-sensitive operation; re-seed each pass so the second
    // attempt is rejected by the unique constraint, not by a stale step-up.
    await seedRecentStepUpForTestUser(user.public_id, sessionPublicId);
    const first = await registerPasskey({ token, credential });
    expect(first.response.statusCode).toBe(200);

    // A fresh challenge re-attesting the same credential, as an authenticator that ignores
    // `excludeCredentials` would.
    await seedRecentStepUpForTestUser(user.public_id, sessionPublicId);
    const second = await registerPasskey({ token, credential });
    expect(second.response.statusCode).toBe(409);

    // The collision must not have written a duplicate row.
    const storedCredentials = await getOperatorDatabase().select().from(webauthn_credentials);
    expect(storedCredentials).toHaveLength(1);
    expect(storedCredentials[0]?.credential_id).toBe(credential.credentialId);
  });
});
