import { describe, expect, it } from 'vitest';
import { serializeMembershipInvitation } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.serializer.js';

const createdAt = new Date('2026-01-01T00:00:00.000Z');

describe('membership-invitation serializer', () => {
  it('serializeMembershipInvitation maps invitation row', () => {
    const expiresAt = new Date('2026-02-01T00:00:00.000Z');
    expect(
      serializeMembershipInvitation(
        {
          public_id: 'inv-public',
          membership_id: 5,
          email: 'invite@example.com',
          expires_at: expiresAt,
          accepted_at: null,
          revoked_at: null,
          created_at: createdAt,
        },
        'mem-public',
      ),
    ).toEqual({
      id: 'inv-public',
      membership_id: 'mem-public',
      email: 'invite@example.com',
      expires_at: expiresAt.toISOString(),
      accepted_at: null,
      revoked_at: null,
      created_at: createdAt.toISOString(),
    });
  });
});
