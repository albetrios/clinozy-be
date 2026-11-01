/**
 * Auth-MFA seed primitive — enroll a known TOTP factor for a seeded account (the local demo
 * platform admin). Domain-owned; used by `src/scripts/seed/ensure-demo-admin.ts`.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { auth_methods } from '@/domains/auth/sub-domains/auth-method/auth-method.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  decryptFieldSecret,
  encryptFieldSecret,
} from '@/shared/utils/security/field-secret-encryption.util.js';

/** The method type a TOTP factor is stored under in `auth.auth_methods` (what MFA login reads). */
const TOTP_METHOD_TYPE = 'MFA_TOTP';

/** Whether a stored encrypted secret decrypts to `secret` (an unreadable one does not). */
function storesSecret({
  encryptedSecret,
  secret,
}: {
  encryptedSecret: string | null;
  secret: string;
}) {
  if (encryptedSecret === null) return false;
  try {
    return decryptFieldSecret(encryptedSecret) === secret;
  } catch {
    return false;
  }
}

/**
 * Ensures `userId` has exactly one active TOTP factor holding `secret`, the shape a real
 * enrollment leaves (`auth.auth_methods`, `method_type = 'MFA_TOTP'`, the secret encrypted with
 * `SECRETS_ENCRYPTION_KEY`), so a password sign-in answers `mfa_required` and `POST
 * /auth/mfa/login` accepts a code computed from `secret`.
 *
 * @remarks
 * - **Algorithm:** reads the user's active TOTP factors; when one already decrypts to `secret`,
 *   changes nothing; otherwise revokes them (one active TOTP factor per user, as a re-enrollment
 *   does) and inserts a verified factor with the encrypted secret.
 * - **Failure modes:** throws when `SECRETS_ENCRYPTION_KEY` is missing (encryption) or the insert
 *   fails.
 * - **Side effects:** writes `auth.auth_methods`. The caller flips `users.is_mfa_enabled`.
 * - **Notes:** local and test databases only — the caller (`ensureDemoAdmin`) refuses any other.
 */
export async function seedTotpFactor({
  userId,
  secret,
}: {
  userId: number;
  secret: string;
}): Promise<void> {
  const database = getRequestDatabase();
  const activeFactors = await database
    .select({ id: auth_methods.id, encrypted_secret: auth_methods.encrypted_secret })
    .from(auth_methods)
    .where(
      and(
        eq(auth_methods.user_id, userId),
        eq(auth_methods.method_type, TOTP_METHOD_TYPE),
        isNull(auth_methods.revoked_at),
      ),
    );
  if (
    activeFactors.length === 1 &&
    storesSecret({ encryptedSecret: activeFactors[0]?.encrypted_secret ?? null, secret })
  ) {
    return;
  }

  if (activeFactors.length > 0) {
    await database
      .update(auth_methods)
      .set({ revoked_at: new Date() })
      .where(
        and(
          eq(auth_methods.user_id, userId),
          eq(auth_methods.method_type, TOTP_METHOD_TYPE),
          isNull(auth_methods.revoked_at),
        ),
      );
  }

  await database.insert(auth_methods).values({
    public_id: generatePublicId('authMethod'),
    user_id: userId,
    method_type: TOTP_METHOD_TYPE,
    encrypted_secret: encryptFieldSecret(secret),
    is_primary: false,
    verified_at: new Date(),
    created_by_user_id: userId,
  });
}
