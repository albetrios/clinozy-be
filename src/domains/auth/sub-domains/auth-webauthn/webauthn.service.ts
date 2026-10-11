import type { Redis } from 'ioredis';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { MAX_WEBAUTHN_CREDENTIALS_PER_USER } from '@/shared/constants/security.constants.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/shared/errors/index.js';
import { isPostgresUniqueViolation } from '@/shared/utils/infrastructure/postgres-error.util.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  assertEmailVerifiedForCredentialEnrollment,
  assertUserAccountActive,
} from '@/shared/utils/auth/account-status.util.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { AuthSessionService } from '@/domains/auth/sub-domains/auth-session/auth-session.service.js';
import type { AuthMethodService } from '@/domains/auth/sub-domains/auth-method/auth-method.service.js';
import type { WebauthnCredentialRepository } from './webauthn-credential.repository.js';
import { serializeWebauthnCredentialList } from './webauthn.serializer.js';
import type { OrganizationSettingsService } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.service.js';
import type { MfaService } from '@/domains/auth/sub-domains/auth-mfa/auth-mfa.service.js';
import {
  completeFirstFactorAuth,
  type FirstFactorAuthResult,
} from '@/domains/auth/shared/complete-first-factor-auth.js';
import { consumeWebauthnChallenge, createWebauthnChallenge } from './webauthn-challenge.js';
import {
  resolveWebauthnExpectedOrigin,
  resolveWebauthnRelyingPartyId,
  resolveWebauthnRelyingPartyName,
} from './webauthn.config.js';
import {
  validateWebauthnAuthenticateOptions,
  validateWebauthnAuthenticateVerify,
  validateWebauthnRegisterVerify,
} from './webauthn.validator.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';

/**
 * Result envelope returned by {@link WebauthnService.generateRegistrationOptions}.
 *
 * @remarks
 * - **Algorithm:** wraps the raw `@simplewebauthn/server` registration options
 *   plus the opaque `challenge_token` that the client must echo back at verify time.
 * - **Failure modes:** purely a shape; consumers should treat `options` as opaque.
 * - **Side effects:** none.
 * - **Notes:** the `challenge_token` indexes a Redis-stored challenge with a short TTL.
 */
export type WebauthnRegisterOptionsResult = {
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
  challenge_token: string;
};

/**
 * Result envelope returned by {@link WebauthnService.generateAuthenticationOptions}.
 *
 * @remarks
 * - **Algorithm:** wraps the raw `@simplewebauthn/server` authentication options plus
 *   the opaque `challenge_token` paired with the user's pending challenge in Redis.
 * - **Failure modes:** purely a shape; consumers should treat `options` as opaque.
 * - **Side effects:** none.
 * - **Notes:** the `challenge_token` is consumed once at verify time and bound to the
 *   originating user via {@link consumeWebauthnChallenge}.
 */
export type WebauthnAuthenticateOptionsResult = {
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
  challenge_token: string;
};

/**
 * Passkey (WebAuthn) enrollment and login orchestrator.
 *
 * @remarks
 * - **Algorithm:** uses `@simplewebauthn/server` to produce registration and
 *   authentication options, persists the challenge in Redis via
 *   {@link createWebauthnChallenge}, and on verify consumes the challenge via
 *   {@link consumeWebauthnChallenge}. Registration stores the new credential in
 *   {@link webauthn_credentials}; authentication validates the assertion, bumps
 *   the stored signature counter via {@link WebauthnCredentialRepository.updateCounter},
 *   and mints a JWT + session.
 * - **Failure modes:** mismatched challenge user, replayed/forged assertions, or
 *   counter regression surface as `UnauthorizedError` or `ValidationError` with
 *   WebAuthn-specific i18n keys (`errors:webauthnInvalidChallenge`,
 *   `errors:webauthnAuthenticationFailed`, `errors:webauthnCredentialNotFound`, …). The
 *   `authenticate/options` step never reveals account existence: every email gets the same
 *   options (discoverable credentials, no `allowCredentials`); only the challenge owner differs.
 * - **Side effects:** writes to {@link webauthn_credentials} (`createCredential`,
 *   `updateCounter`), to `auth.sessions` via {@link AuthSessionService.createSessionForUser},
 *   and to Redis (`webauthn:challenge:*`). Signs an RS256 JWT on successful login.
 * - **Notes:** RP ID and expected origin are resolved at call time from
 *   `WEBAUTHN_RP_ID` / `ALLOWED_ORIGINS` so the same binary serves multiple environments.
 */
export class WebauthnService {
  constructor(
    private readonly userService: UserService,
    private readonly authSessionService: AuthSessionService,
    private readonly credentialRepository: WebauthnCredentialRepository,
    private readonly redis: Redis,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly mfaService: MfaService,
    private readonly authMethodService: AuthMethodService,
  ) {}

  async generateRegistrationOptions(userPublicId: string): Promise<WebauthnRegisterOptionsResult> {
    const user = await this.userService.requireUserRecordByPublicId(userPublicId);
    if (!user) {
      throw new UnauthorizedError('errors:userNotFound');
    }
    // Pre-hijacking guard: an unverified (e.g. attacker-pre-registered) account must not seed a
    // passkey that would survive the real owner's password-reset recovery (sec — account
    // pre-hijacking, Trojan-credential variant).
    assertEmailVerifiedForCredentialEnrollment(user);

    const existingCredentials = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: user.public_id }),
      callback: () => this.credentialRepository.listActiveByUserId(user.id),
    });
    const relyingPartyId = resolveWebauthnRelyingPartyId();
    const options = await generateRegistrationOptions({
      rpName: resolveWebauthnRelyingPartyName(),
      rpID: relyingPartyId,
      userName: user.email,
      userDisplayName: user.email,
      userID: Buffer.from(user.public_id, 'utf8'),
      attestationType: 'none',
      excludeCredentials: existingCredentials.map((credential) => ({
        id: credential.credential_id,
        transports: credential.transports as string[],
      })),
      authenticatorSelection: {
        // Discoverable credentials only: passkey sign-in sends no per-account credential list
        // (see generateAuthenticationOptions), so every passkey must be findable by the
        // authenticator on its own.
        residentKey: 'required',
        // sec-r4-A2: align with the verify-time requirement (verifyRegistrationResponse
        // calls with requireUserVerification: true). Setting 'preferred' here let a
        // UV-incapable authenticator (no biometric / PIN) finish the registration
        // round-trip and produce a credential that could NEVER authenticate — the
        // verify step would always fail. 'required' surfaces UV capability as a hard
        // requirement at enrollment time instead of after the credential is minted.
        userVerification: 'required',
      },
    });

    const challengeToken = await createWebauthnChallenge({
      redis: this.redis,
      kind: 'registration',
      userPublicId: user.public_id,
      challenge: options.challenge,
    });

    return { options, challenge_token: challengeToken };
  }

  async verifyRegistration({
    userPublicId,
    body,
    requestOrigin,
  }: {
    userPublicId: string;
    body: unknown;
    requestOrigin?: string | undefined;
  }): Promise<{ verified: boolean; credential_id: string }> {
    const parsed = validateWebauthnRegisterVerify(body);
    const challenge = await consumeWebauthnChallenge({
      redis: this.redis,
      challengeToken: parsed.challenge_token,
      expectedKind: 'registration',
    });
    if (challenge.user_public_id !== userPublicId) {
      throw new UnauthorizedError('errors:webauthnInvalidChallenge');
    }

    const user = await this.userService.requireUserRecordByPublicId(userPublicId);
    if (!user) {
      throw new UnauthorizedError('errors:userNotFound');
    }

    const expectedOrigin = resolveWebauthnExpectedOrigin(requestOrigin);
    // @simplewebauthn throws (rather than returning verified: false) on a mismatched origin,
    // RP ID or challenge and on a malformed attestation — a client fault, never a 500.
    const verification = await verifyRegistrationResponse({
      response: parsed.response as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin,
      expectedRPID: resolveWebauthnRelyingPartyId(),
      requireUserVerification: true,
    }).catch(() => {
      throw new ValidationError('errors:webauthnRegistrationFailed');
    });

    if (!(verification.verified && verification.registrationInfo)) {
      throw new ValidationError('errors:webauthnRegistrationFailed');
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    let created: Awaited<ReturnType<WebauthnCredentialRepository['createCredential']>>;
    try {
      created = await withAppDatabaseContext({
        scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: user.public_id }),
        callback: async () => {
          // Serialize the count + insert under a per-user advisory lock so concurrent registrations
          // cannot both pass the cap check and overshoot MAX_WEBAUTHN_CREDENTIALS_PER_USER. The xact
          // lock auto-releases at commit.
          await this.credentialRepository.acquireCreationQuotaLock(user.id);
          const activeCount = await this.credentialRepository.countActiveByUserId(user.id);
          if (activeCount >= MAX_WEBAUTHN_CREDENTIALS_PER_USER) {
            throw new ConflictError('errors:webauthnCredentialMaxReached', {
              max: MAX_WEBAUTHN_CREDENTIALS_PER_USER,
            });
          }
          return this.credentialRepository.createCredential({
            user_id: user.id,
            credential_id: credential.id,
            public_key: Buffer.from(credential.publicKey).toString('base64url'),
            counter: credential.counter,
            device_type: credentialDeviceType,
            backed_up: credentialBackedUp,
            transports: credential.transports ?? [],
          });
        },
      });
    } catch (error) {
      // This passkey is already enrolled (webauthn_credentials_credential_id_unique).
      // excludeCredentials is only a client-side hint, so a replayed/forced registration
      // can still collide — surface a clean 409 rather than an unhandled 500.
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictError('errors:webauthnCredentialExists');
      }
      throw error;
    }

    return { verified: true, credential_id: created.public_id };
  }

  async generateAuthenticationOptions(body: unknown): Promise<WebauthnAuthenticateOptionsResult> {
    const parsed = validateWebauthnAuthenticateOptions(body);
    // `email` is required at the DTO layer (sec-A finding #24).
    const user = await this.userService.findByEmail(parsed.email);
    // Anti-enumeration (timing): the response below is identical for every email, but a KNOWN
    // email would otherwise incur an extra user-context credential query that an unknown email
    // skips — a measurable timing oracle. Run the SAME user-context lookup on both paths; an
    // unknown/credential-less email uses a non-resolvable synthetic context (the RLS policy +
    // `user_id = 0` filter return zero rows), so the DB work matches.
    const lookupUserPublicId = user?.public_id ?? `decoy:${generatePublicId('authMethod')}`;
    const lookupUserId = user?.id ?? 0;
    const credentials = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: lookupUserPublicId }),
      callback: () => this.credentialRepository.listActiveByUserId(lookupUserId),
    });

    // Anti-enumeration: the options carry NO per-account data. Listing the account's credentials
    // (allowCredentials) leaked enrollment — a real account returned every stored credential with
    // its transports, a decoy exactly one — so sign-in uses discoverable credentials (registration
    // requires them) and every email gets the same shape: a challenge, the RP id and the
    // user-verification requirement. The email only decides who the challenge is bound to: the
    // account when it has passkeys, otherwise a non-resolvable synthetic owner, so a verify
    // against a decoy fails like any other mismatch. Verification still requires the asserted
    // credential to belong to the challenged user (and its userHandle to match).
    const options = await generateAuthenticationOptions({
      rpID: resolveWebauthnRelyingPartyId(),
      // sec-r4-A2: verifyAuthenticationResponse requires user verification, so the
      // options round-trip must also require it. 'preferred' let UV-incapable
      // authenticators round-trip successfully and then always fail verify.
      userVerification: 'required',
    });

    const challengeOwnerPublicId =
      user && credentials.length > 0 ? user.public_id : `decoy:${generatePublicId('authMethod')}`;
    const challengeToken = await createWebauthnChallenge({
      redis: this.redis,
      kind: 'authentication',
      userPublicId: challengeOwnerPublicId,
      challenge: options.challenge,
    });

    return { options, challenge_token: challengeToken };
  }

  async verifyAuthentication({
    body,
    ipAddress,
    requestOrigin,
    userAgent,
  }: {
    body: unknown;
    ipAddress: string;
    requestOrigin?: string | undefined;
    userAgent?: string | undefined;
  }): Promise<FirstFactorAuthResult> {
    const parsed = validateWebauthnAuthenticateVerify(body);
    const challenge = await consumeWebauthnChallenge({
      redis: this.redis,
      challengeToken: parsed.challenge_token,
      expectedKind: 'authentication',
    });

    const response = parsed.response as AuthenticationResponseJSON;
    // Defense-in-depth: when the authenticator returns a `userHandle` (resident/discoverable
    // credentials), it MUST decode to the challenged user's public id — registration sets
    // `userID = utf8(public_id)`. The credential↔user binding is enforced below by the id-scoped
    // lookup + signature, so this is not load-bearing today; it pins the invariant so a future
    // usernameless flow that resolves the user FROM `userHandle` cannot regress into account confusion.
    const assertedUserHandle = response.response.userHandle;
    if (
      assertedUserHandle !== undefined &&
      Buffer.from(assertedUserHandle, 'base64url').toString('utf8') !== challenge.user_public_id
    ) {
      throw new UnauthorizedError('errors:webauthnInvalidChallenge');
    }
    // The challenge binds this assertion to a user; auth.webauthn_credentials is FORCE RLS keyed on
    // app.current_user_public_id, so look the credential up inside that user's context.
    const storedCredential = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: challenge.user_public_id }),
      callback: () => this.credentialRepository.findActiveByCredentialId(response.id),
    });
    if (storedCredential?.user_id === undefined) {
      throw new UnauthorizedError('errors:webauthnCredentialNotFound');
    }

    const user = await this.userService.requireUserRecordByPublicId(challenge.user_public_id);
    if (!user || user.id !== storedCredential.user_id) {
      throw new UnauthorizedError('errors:webauthnInvalidChallenge');
    }
    // sec-U1: also rejects soft-deleted users.
    assertUserAccountActive({ status: user.status, deleted_at: user.deleted_at });

    const expectedOrigin = resolveWebauthnExpectedOrigin(requestOrigin);
    // As at registration: a thrown verification (origin, RP ID, challenge, malformed assertion)
    // is the same failed sign-in as `verified: false`.
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin,
      expectedRPID: resolveWebauthnRelyingPartyId(),
      requireUserVerification: true,
      credential: {
        id: storedCredential.credential_id,
        publicKey: Buffer.from(storedCredential.public_key, 'base64url'),
        counter: storedCredential.counter,
        transports: storedCredential.transports as string[],
      },
    }).catch(() => {
      throw new UnauthorizedError('errors:webauthnAuthenticationFailed');
    });

    if (!verification.verified) {
      throw new UnauthorizedError('errors:webauthnAuthenticationFailed');
    }

    const { newCounter } = verification.authenticationInfo;
    await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: user.public_id }),
      callback: () =>
        this.credentialRepository.updateCounter(storedCredential.credential_id, newCounter),
    });

    return completeFirstFactorAuth({
      user: {
        id: user.id,
        public_id: user.public_id,
        email: user.email,
        status: user.status,
        is_email_verified: user.is_email_verified,
        is_mfa_enabled: user.is_mfa_enabled,
      },
      ipAddress,
      userAgent,
      organizationSettingsService: this.organizationSettingsService,
      mfaService: this.mfaService,
      authSessionService: this.authSessionService,
      // Non-pinned path: self-heal a missing personal organization into the token (item #5).
      ensurePersonalOrganizationOnMiss: true,
    });
  }

  /**
   * Lists the authenticated user's active (non-revoked) passkeys for the management UI.
   *
   * @remarks
   * - **Algorithm:** resolves the user record, then reads active credentials under the owner DB
   *   context and projects each through {@link serializeWebauthnCredentialList}.
   * - **Failure modes:** `UnauthorizedError` when the user record is missing.
   * - **Side effects:** transient owner-scoped DB context only.
   * - **Notes:** sec-r5-M3 — never emits credential material, the raw WebAuthn `credential_id`
   *   blob, or internal ids; the external `id` is the opaque `wac_` public id.
   */
  async listCredentials(userPublicId: string) {
    const user = await this.userService.requireUserRecordByPublicId(userPublicId);
    if (!user) {
      throw new UnauthorizedError('errors:userNotFound');
    }
    const rows = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: user.public_id }),
      callback: () => this.credentialRepository.listActiveByUserId(user.id),
    });
    return serializeWebauthnCredentialList(rows);
  }

  /**
   * Revokes one of the authenticated user's passkeys by its public id, refusing to remove the
   * user's last remaining login credential.
   *
   * @remarks
   * - **Algorithm:** under the owner DB context, takes the shared per-user credential-mutation
   *   advisory lock (the same one `deleteMfa` uses, so concurrent passkey/MFA mutations serialize),
   *   resolves the target passkey by public id, and — when it is the only active passkey — refuses
   *   the revoke unless the user retains a login-capable auth method
   *   ({@link AuthMethodService.hasLoginCapableMethod}). Otherwise soft-revokes via
   *   {@link WebauthnCredentialRepository.revokeByUserId} (sets `revoked_at`).
   * - **Failure modes:** `UnauthorizedError` (missing user), `NotFoundError` (no such owned active
   *   passkey), `ConflictError` (`errors:webauthnCannotRevokeLastCredential`) when the revoke would
   *   strip a passkey-only user of every login credential.
   * - **Side effects:** writes `revoked_at` on the credential row; the partial unique index keeps the
   *   raw `credential_id` re-registrable afterwards.
   * - **Notes:** sec-r5-M3 — wires the previously-orphaned `revokeByUserId`. A user with a password /
   *   OAuth / email-code method may remove every passkey.
   */
  async revokeCredential({
    userPublicId,
    credentialPublicId,
  }: {
    userPublicId: string;
    credentialPublicId: string;
  }): Promise<void> {
    const user = await this.userService.requireUserRecordByPublicId(userPublicId);
    if (!user) {
      throw new UnauthorizedError('errors:userNotFound');
    }
    await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: user.public_id }),
      callback: async () => {
        // Serialize concurrent credential mutations for this user so the "is this the last
        // login credential?" check + revoke cannot interleave with a sibling passkey/MFA delete.
        await this.authMethodService.acquireCredentialMutationLock(user.id);
        const active = await this.credentialRepository.listActiveByUserId(user.id);
        const target = active.find((credential) => credential.public_id === credentialPublicId);
        if (!target) {
          throw new NotFoundError('Passkey');
        }
        if (active.length <= 1) {
          const hasOtherLoginMethod = await this.authMethodService.hasLoginCapableMethod(
            user.public_id,
          );
          if (!hasOtherLoginMethod) {
            throw new ConflictError('errors:webauthnCannotRevokeLastCredential');
          }
        }
        await this.credentialRepository.revokeByUserId(user.id, target.id);
      },
    });
  }
}
