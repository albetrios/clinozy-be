import { describe, expect, it } from 'vitest';
import { serializeMembership } from '@/domains/tenancy/sub-domains/membership/membership.serializer.js';
import type { MembershipRow } from '@/domains/tenancy/sub-domains/membership/membership.types.js';
import { membershipRowFixture } from '@/domains/tenancy/__tests__/factories/membership-row.factory.js';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');
const user = {
  id: 'user-public',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
  avatar_url: 'https://signed.example.com/avatar.png',
};
const access = { role_ids: ['role-main', 'role-extra'], branch_ids: ['brn-vesu'] };

/** The serializer's options for a row, as a non-owner unless said otherwise. */
function serialize(
  row: MembershipRow,
  overrides: Partial<Parameters<typeof serializeMembership>[0]> = {},
) {
  return serializeMembership({
    row,
    organization_public_id: 'org-public',
    user,
    invitation: null,
    access,
    is_owner: false,
    ...overrides,
  });
}

/** A live membership row with the dates and profile this suite asserts on. */
function membershipRow(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return membershipRowFixture({
    public_id: 'mem-public',
    joined_at: null,
    created_at: createdAt,
    updated_at: updatedAt,
    display_name: 'Jane Doe',
    staff_number: 12,
    working_days: ['mon', 'tue'],
    work_starts_at: '10:00:00',
    work_ends_at: '19:00:00',
    commission_percent: '10.00',
    ...overrides,
  });
}

describe('membership serializer', () => {
  it('serializeMembership maps null joined_at and a null invitation (active row)', () => {
    expect(serialize(membershipRow())).toMatchObject({
      status: 'active',
      is_owner: false,
      joined_at: null,
      invitation: null,
      ended_at: null,
      end_reason: null,
    });
  });

  it('emits public ids, the role and branch lists and never the internal sequential ids', () => {
    const joinedAt = new Date('2026-01-03T00:00:00.000Z');
    const serialized = serialize(membershipRow({ joined_at: joinedAt }));

    expect(serialized).toEqual({
      id: 'mem-public',
      user_id: 'user-public',
      organization_id: 'org-public',
      status: 'active',
      is_owner: false,
      joined_at: joinedAt.toISOString(),
      created_at: createdAt.toISOString(),
      updated_at: updatedAt.toISOString(),
      user,
      invitation: null,
      display_name: 'Jane Doe',
      ended_at: null,
      end_reason: null,
      staff_number: 12,
      phone: null,
      tone: 'sky',
      role_ids: ['role-main', 'role-extra'],
      branch_ids: ['brn-vesu'],
      working_days: ['mon', 'tue'],
      work_starts_at: '10:00',
      work_ends_at: '19:00',
      commission_percent: 10,
    });
    // The flat user id mirrors the embedded public id; the internal bigserial ids never appear.
    expect(serialized.user_id).toBe('user-public');
    expect(JSON.stringify(serialized)).not.toContain('"role_id"');
  });

  it('embeds the live invitation ref on an invited row (id + ISO expires_at)', () => {
    const expiresAt = new Date('2026-02-01T00:00:00.000Z');
    const serialized = serialize(membershipRow({ status: 'invited' }), {
      invitation: { public_id: 'inv-public', expires_at: expiresAt },
    });
    expect(serialized.invitation).toEqual({
      id: 'inv-public',
      expires_at: expiresAt.toISOString(),
    });
    expect(serialized.user.email).toBe('jane@example.com');
  });

  it('an ended member carries when and why it ended (D58)', () => {
    const endedAt = new Date('2026-03-01T00:00:00.000Z');
    const serialized = serialize(membershipRow({ deleted_at: endedAt, delete_reason: 'left' }));
    expect(serialized.ended_at).toBe(endedAt.toISOString());
    expect(serialized.end_reason).toBe('left');
  });

  it("names the organization's owner (launch D81 (4))", () => {
    expect(serialize(membershipRow(), { is_owner: true }).is_owner).toBe(true);
  });
});
