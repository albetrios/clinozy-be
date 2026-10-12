import { describe, expect, it } from 'vitest';
import {
  attachInvitationTokenEcho,
  serializeMembershipInvitation,
} from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.serializer.js';

const createdAt = new Date('2026-01-01T00:00:00.000Z');

describe('membership-invitation serializer', () => {
  it('serializeMembershipInvitation maps invitation row', () => {
    const expiresAt = new Date('2026-02-01T00:00:00.000Z');
    expect(
      serializeMembershipInvitation({
        row: {
          public_id: 'inv-public',
          membership_id: 5,
          email: 'invite@example.com',
          expires_at: expiresAt,
          accepted_at: null,
          revoked_at: null,
          created_at: createdAt,
        },
        membership_public_id: 'mem-public',
      }),
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

  describe('attachInvitationTokenEcho (ROUTE #164)', () => {
    const membership = {
      id: 'mem-public',
      invitation: { id: 'inv-public', expires_at: '2026-02-01T00:00:00.000Z' },
    };

    it("puts the issued invitation's debug token on the embedded invitation", () => {
      expect(
        attachInvitationTokenEcho({ membership, issued: { debug_invitation_token: 'raw-token' } }),
      ).toEqual({
        id: 'mem-public',
        invitation: {
          id: 'inv-public',
          expires_at: '2026-02-01T00:00:00.000Z',
          debug_invitation_token: 'raw-token',
        },
      });
    });

    it('returns the membership unchanged when the echo is off', () => {
      expect(attachInvitationTokenEcho({ membership, issued: {} })).toBe(membership);
    });

    it('returns the membership unchanged when it has no live invitation', () => {
      const active = { id: 'mem-public', invitation: null };
      expect(
        attachInvitationTokenEcho({
          membership: active,
          issued: { debug_invitation_token: 'raw-token' },
        }),
      ).toBe(active);
    });
  });
});
