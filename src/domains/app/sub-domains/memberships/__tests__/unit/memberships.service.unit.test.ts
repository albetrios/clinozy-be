import { describe, expect, it, vi } from 'vitest';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { ValidationError } from '@/shared/errors/index.js';
import { AppMembershipsService } from '@/domains/app/sub-domains/memberships/memberships.service.js';
import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import type { MemberRoleService } from '@/domains/tenancy/sub-domains/member-roles/member-role.service.js';

/** A scope no database work ever reads — every case is refused before one opens. */
const SCOPE = {
  organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaaa',
} as unknown as OrganizationPrincipalDatabaseScope;

/**
 * The app's team list (routes-final §2, ROUTE #126) and role directory (ROUTE #157, D81 (4)): every
 * query the service parses is refused before any database work — the service is built with no
 * repositories, so a case that reached one would fail — and a good one is handed to the tenancy
 * services as it came.
 */
describe('AppMembershipsService', () => {
  const service = new AppMembershipsService({} as never, {} as never);

  it('refuses a list query with an unknown filter (400)', async () => {
    await expect(
      service.list({ scope: SCOPE, query: { not_a_filter: 'x' } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a list limit out of range (400)', async () => {
    await expect(service.list({ scope: SCOPE, query: { limit: '0' } })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses a holds code longer than any permission code (400)', async () => {
    await expect(
      service.list({ scope: SCOPE, query: { holds: 'x'.repeat(101) } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('hands holds to the directory as the permission code (T8)', async () => {
    const listDirectory = vi.fn().mockResolvedValue({
      items: [],
      total: null,
      limit: 20,
      has_more: false,
      next_cursor: null,
    });
    const withDirectory = new AppMembershipsService(
      { listDirectory } as unknown as MembershipService,
      {} as never,
    );
    await withDirectory.list({ scope: SCOPE, query: { holds: 'task:read' } });
    expect(listDirectory).toHaveBeenCalledWith({
      scope: SCOPE,
      query: expect.objectContaining({ holdsPermissionCode: 'task:read', includeEnded: false }),
    });
  });

  it('refuses a roles query with a filter (400) — the directory is paged only', async () => {
    await expect(
      service.listRoles({ scope: SCOPE, query: { q: 'Doctor' } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('shapes each role as a directory entry — no codes, counts or dates', async () => {
    const listDirectory = vi.fn().mockResolvedValue({
      items: [
        {
          id: 7,
          public_id: 'rol_aaaaaaaaaaaaaaaaaaaaa',
          organization_id: 1,
          name: 'Owner',
          description: null,
          is_system: true,
          tone: 'slate',
          is_locked: true,
          deleted_at: null,
          delete_reason: null,
          delete_note: null,
          created_at: new Date('2026-10-01T00:00:00.000Z'),
          updated_at: new Date('2026-10-01T00:00:00.000Z'),
          updated_by_user_id: null,
        },
      ],
      limit: 100,
      has_more: false,
      next_cursor: null,
    });
    const withRoles = new AppMembershipsService(
      {} as never,
      { listDirectory } as unknown as MemberRoleService,
    );
    const page = await withRoles.listRoles({ scope: SCOPE, query: { limit: '100' } });
    expect(listDirectory).toHaveBeenCalledWith({
      scope: SCOPE,
      pagination: { limit: 100, after: undefined },
    });
    expect(page).toEqual({
      items: [
        {
          id: 'rol_aaaaaaaaaaaaaaaaaaaaa',
          name: 'Owner',
          tone: 'slate',
          is_system: true,
          is_locked: true,
        },
      ],
      limit: 100,
      has_more: false,
      next_cursor: null,
    });
  });
});
