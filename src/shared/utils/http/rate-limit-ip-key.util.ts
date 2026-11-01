import { normalizeIP } from '@fastify/rate-limit';
import { RATE_LIMIT_IPV6_SUBNET_PREFIX_LENGTH } from '@/shared/constants/security.constants.js';

/**
 * The rate-limit bucket identity of a client address — what every IP-keyed limiter keys on.
 *
 * @remarks
 * - **Algorithm:** an IPv4 address is kept as-is; an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`)
 *   becomes its IPv4 form; any other IPv6 address is masked to its
 *   {@link RATE_LIMIT_IPV6_SUBNET_PREFIX_LENGTH}-bit prefix and written in canonical form
 *   (`2001:db8:1:2::`). Delegates to `@fastify/rate-limit`'s own `normalizeIP`, the function its
 *   default key generator uses — the keyGenerators here replaced that default and lost the masking.
 * - **Failure modes:** none — a value that is not an IPv6 address is returned lower-cased.
 * - **Side effects:** none.
 * - **Notes:** D-3 — a single customer site holds a whole /64 (2^64 addresses), so keying on the
 *   full IPv6 address gave one caller an unbounded number of buckets: every per-IP cap (global,
 *   strict public, failed logins, failed authentication) was bypassed by rotating the low 64 bits.
 */
export function rateLimitIpKey(ipAddress: string): string {
  return normalizeIP(ipAddress, RATE_LIMIT_IPV6_SUBNET_PREFIX_LENGTH);
}
