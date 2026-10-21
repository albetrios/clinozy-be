import { isDisposableEmail as isDisposableEmailFromPackage } from 'disposable-email-domains-js';
import { getEnv } from '@/shared/config/env.config.js';

const DISPOSABLE_EMAIL_MESSAGE = 'Disposable or temporary email addresses are not allowed';

/**
 * Returns true when BLOCK_DISPOSABLE_EMAIL is true (default) and the email is
 * from a known disposable/temporary domain. Set BLOCK_DISPOSABLE_EMAIL=false
 * to allow disposable emails (e.g. when you need to use them).
 */
export function isDisposableEmailBlocked(email: string): boolean {
  if (!getEnv().BLOCK_DISPOSABLE_EMAIL) return false;
  return isDisposableEmailFromPackage(email);
}

/**
 * Domains that can never receive mail: the documentation domains (RFC 2606 §3) and the reserved
 * top-level names (RFC 2606 §2, RFC 6761). A subdomain of one is reserved too.
 */
const RESERVED_EMAIL_DOMAINS = [
  'example.com',
  'example.net',
  'example.org',
  'example',
  'test',
  'invalid',
  'localhost',
];

/**
 * Returns true when the address is on a reserved domain (`example.com`, `*.test`, …) that can
 * never receive mail — the domain seeded and test accounts use. Case-insensitive; a trailing dot
 * on the domain is ignored.
 */
export function isReservedEmailDomain(email: string): boolean {
  const domain = email
    .slice(email.lastIndexOf('@') + 1)
    .toLowerCase()
    .replace(/\.$/, '');
  return RESERVED_EMAIL_DOMAINS.some(
    (reservedDomain) => domain === reservedDomain || domain.endsWith(`.${reservedDomain}`),
  );
}

export { DISPOSABLE_EMAIL_MESSAGE };
