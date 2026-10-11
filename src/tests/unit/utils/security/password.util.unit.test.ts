import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/shared/utils/security/password.util.js';

describe('password.util', () => {
  it('hashes and verifies with Argon2id', async () => {
    const hash = await hashPassword('SecurePass123!');
    expect(hash).toMatch(/^\$argon2id\$/);
    const result = await verifyPassword({ plaintext: 'SecurePass123!', storedHash: hash });
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(false);
  });

  it('rejects wrong password for Argon2 hash', async () => {
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword({ plaintext: 'wrong-password', storedHash: hash });
    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });

  it('rejects non-Argon2 stored hashes without invoking argon2 verify', async () => {
    const result = await verifyPassword({
      plaintext: 'any-password',
      storedHash: '$2b$10$notargon2hashvalue',
    });
    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });
});
