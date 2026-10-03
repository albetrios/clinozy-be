import { createHash } from 'node:crypto';
import { env } from '@/shared/config/env.config.js';

const subKeys = new Map<string, Buffer>();

/**
 * A domain-separated sub-key of `SECRETS_ENCRYPTION_KEY`: `sha256("<label>:<key>")`, memoized per
 * label. Each use of the master secret (the verification-code pepper, refresh-secret issuance MACs)
 * takes its own label, so no two uses share key material.
 *
 * @remarks
 * - **Derived lazily**, not at module load, so importing a caller never depends on env being
 *   validated first.
 * - **Labels are part of the key:** changing one invalidates every value derived with it (stored
 *   verification-code hashes, issued refresh secrets) — keep existing labels byte-identical.
 */
export function deriveSecretsSubKey(label: string): Buffer {
  let subKey = subKeys.get(label);
  if (!subKey) {
    subKey = createHash('sha256').update(`${label}:${env.SECRETS_ENCRYPTION_KEY}`).digest();
    subKeys.set(label, subKey);
  }
  return subKey;
}
