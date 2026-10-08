import { vi } from 'vitest';
import type { MembershipAdditionalRolesRepository } from '@/domains/tenancy/sub-domains/membership/membership-additional-roles/membership-additional-roles.repository.js';
import type { MembershipRow } from '@/domains/tenancy/sub-domains/membership/membership.types.js';

/**
 * A live `active` membership row with every column the membership service and serializer read
 * (launch ROUTE #4 staff profile, D58 end fields) — for unit suites that mock the repository.
 */
export function membershipRowFixture(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return {
    id: 3,
    public_id: 'mem_public',
    organization_id: 1,
    user_id: 10,
    role_id: 2,
    status: 'active',
    invited_by_user_id: null,
    joined_at: new Date('2026-01-03T00:00:00.000Z'),
    deleted_at: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-02T00:00:00.000Z'),
    staff_number: 1,
    phone: null,
    tone: 'sky',
    working_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    work_starts_at: '09:00:00',
    work_ends_at: '18:00:00',
    commission_percent: '0.00',
    delete_reason: null,
    delete_note: null,
    updated_by_user_id: null,
    display_name: 'Test User',
    ...overrides,
  };
}

/** A stub of the additional-roles repository (D5) holding no extra roles. */
export function emptyMembershipAdditionalRolesRepository(): MembershipAdditionalRolesRepository {
  return {
    listRolePublicIdsByMembershipIds: vi.fn(async () => new Map<number, string[]>()),
    listRoleIdsForMembership: vi.fn().mockResolvedValue([]),
    replaceForMembership: vi.fn().mockResolvedValue(undefined),
  } as unknown as MembershipAdditionalRolesRepository;
}
