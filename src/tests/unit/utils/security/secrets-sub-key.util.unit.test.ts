import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { env } from '@/shared/config/env.config.js';
import { deriveSecretsSubKey } from '@/shared/utils/security/secrets-sub-key.util.js';

/** The derivation each caller used before sharing this helper — the keys must not change. */
function previousDerivation(label: string): Buffer {
  return createHash('sha256').update(`${label}:${env.SECRETS_ENCRYPTION_KEY}`).digest();
}

describe('deriveSecretsSubKey', () => {
  // Stored verification-code hashes and issued refresh secrets were derived with these exact
  // labels; a different key would invalidate every one of them.
  it.each(['verification-code-pepper', 'refresh-secret-mac'])(
    'derives the same key as before for %s',
    (label) => {
      expect(deriveSecretsSubKey(label).equals(previousDerivation(label))).toBe(true);
    },
  );

  it('keeps labels domain-separated and memoizes per label', () => {
    const pepper = deriveSecretsSubKey('verification-code-pepper');
    expect(pepper.equals(deriveSecretsSubKey('refresh-secret-mac'))).toBe(false);
    expect(deriveSecretsSubKey('verification-code-pepper')).toBe(pepper);
  });
});
