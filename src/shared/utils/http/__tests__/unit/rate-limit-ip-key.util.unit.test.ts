import { describe, expect, it } from 'vitest';
import { rateLimitIpKey } from '@/shared/utils/http/rate-limit-ip-key.util.js';

/**
 * D-3 — one customer site holds a whole IPv6 /64, so an IP-keyed limiter must bucket on the /64,
 * not on the full address the caller can rotate at will.
 */
describe('rateLimitIpKey', () => {
  it('keeps an IPv4 address as it is', () => {
    expect(rateLimitIpKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('turns an IPv4-mapped IPv6 address into its IPv4 form', () => {
    expect(rateLimitIpKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('masks an IPv6 address to its /64', () => {
    expect(rateLimitIpKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::');
  });

  it('puts every address of one /64 in the same bucket', () => {
    const keys = new Set(
      ['2001:db8:1:2::1', '2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:DB8:1:2:0:0:0:abcd'].map(
        (address) => rateLimitIpKey(address),
      ),
    );
    expect(keys).toEqual(new Set(['2001:db8:1:2::']));
  });

  it('keeps neighbouring /64s apart', () => {
    expect(rateLimitIpKey('2001:db8:1:2::1')).not.toBe(rateLimitIpKey('2001:db8:1:3::1'));
  });
});
