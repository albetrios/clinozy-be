import { describe, expect, it } from 'vitest';
import { serializeAuthMeContext } from '@/domains/auth/auth-me-context.serializer.js';
import type { AuthMeContextData } from '@/domains/auth/auth-me-context.types.js';
import type { OrganizationOutput } from '@/domains/tenancy/sub-domains/organization/organization.types.js';

const organization = (id: string, type: 'PERSONAL' | 'TEAM'): OrganizationOutput => ({
  id,
  name: `Org ${id}`,
  slug: type === 'TEAM' ? `org-${id}` : null,
  type,
  status: 'ACTIVE',
  owner_user_id: 'usr_1',
  logo_url: null,
  specialties: ['skin'],
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
});

const baseData = (overrides: Partial<AuthMeContextData> = {}): AuthMeContextData => ({
  user: {
    id: 'usr_1',
    email: 'a@b.com',
    is_email_verified: true,
    is_mfa_enabled: false,
    first_name: 'A',
    last_name: 'B',
    job_title: null,
    avatar_url: null,
    presence: 'online',
    status: 'ACTIVE',
    onboarding_completed: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  activeOrganization: organization('org_active', 'TEAM'),
  planAccess: { state: 'active', graceEndsAt: null },
  membershipId: 'mem_active',
  myPermissions: ['organization:read', 'membership:manage'],
  myRoleIds: ['rol_admin'],
  myRoles: [{ id: 'rol_admin', name: 'Admin', tone: 'slate', is_system: true }],
  globalRole: null,
  ...overrides,
});

describe('serializeAuthMeContext', () => {
  it('passes through user, active organization, permissions, and global role', () => {
    const output = serializeAuthMeContext(baseData());
    expect(output.user.id).toBe('usr_1');
    expect(output.active_organization?.id).toBe('org_active');
    expect(output.my_permissions).toEqual(['organization:read', 'membership:manage']);
    expect(output.global_role).toBeNull();
  });

  it("passes through the caller's membership id and named roles (launch ROUTE #156)", () => {
    const output = serializeAuthMeContext(baseData());
    expect(output.membership_id).toBe('mem_active');
    expect(output.my_role_ids).toEqual(['rol_admin']);
    expect(output.my_roles).toEqual([
      { id: 'rol_admin', name: 'Admin', tone: 'slate', is_system: true },
    ]);
  });

  // The switcher list moved to `GET /users/me/organizations`, which pages.
  // Embedded here it was a flat array with no cursor, filled by a
  // default-paginated read — a caller in more than 25 organizations was
  // silently truncated with no way to ask for the rest.
  it('does not carry the organization list', () => {
    const output = serializeAuthMeContext(baseData());
    expect(output).not.toHaveProperty('organizations');
  });

  it('adds plan_access to the active organization, grace_ends_at in ISO 8601 (owner decision D3)', () => {
    expect(serializeAuthMeContext(baseData()).active_organization?.plan_access).toEqual({
      state: 'active',
      grace_ends_at: null,
    });
    const graceEndsAt = new Date('2026-10-31T09:30:00.000Z');
    for (const state of ['grace', 'read_only'] as const) {
      const output = serializeAuthMeContext(baseData({ planAccess: { state, graceEndsAt } }));
      expect(output.active_organization?.plan_access).toEqual({
        state,
        grace_ends_at: '2026-10-31T09:30:00.000Z',
      });
      expect(output.active_organization?.id).toBe('org_active');
    }
  });

  it('reads plan_access active when none was resolved for the active organization', () => {
    const output = serializeAuthMeContext(baseData({ planAccess: null }));
    expect(output.active_organization?.plan_access).toEqual({
      state: 'active',
      grace_ends_at: null,
    });
  });

  it('serializes a caller with no active organization', () => {
    const output = serializeAuthMeContext(
      baseData({
        activeOrganization: null,
        planAccess: null,
        membershipId: null,
        myPermissions: [],
        myRoleIds: [],
        myRoles: [],
      }),
    );
    expect(output.active_organization).toBeNull();
    expect(output.membership_id).toBeNull();
    expect(output.my_permissions).toEqual([]);
    expect(output.my_roles).toEqual([]);
  });
});
