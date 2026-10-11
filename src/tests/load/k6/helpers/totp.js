import crypto from 'k6/crypto';

/** Generates an RFC 6238 SHA-1 TOTP from the enrollment secret, like an authenticator app. */
export function totpCode(secret, epochMilliseconds = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of secret.toUpperCase().replace(/=+$/, '')) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 enrollment secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const counter = new ArrayBuffer(8);
  const view = new DataView(counter);
  const step = Math.floor(epochMilliseconds / 30000);
  view.setUint32(0, Math.floor(step / 4294967296));
  view.setUint32(4, step >>> 0);
  const digest = new Uint8Array(
    crypto.hmac('sha1', new Uint8Array(bytes).buffer, counter, 'binary'),
  );
  const offset = digest[digest.length - 1] & 15;
  const truncated =
    ((digest[offset] & 127) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(truncated % 1000000).padStart(6, '0');
}
