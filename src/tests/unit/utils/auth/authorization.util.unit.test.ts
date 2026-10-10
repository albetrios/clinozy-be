import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '@/shared/errors/index.js';
import { GLOBAL_ROLES } from '@/shared/constants/index.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

vi.mock('@/domains/tenancy/sub-domains/permission/authorization.service.js', () => ({
  resolveUserOrganizationPermissions: vi.fn(),
}));
// The organization MFA policy is read through Redis + Postgres; the unit lane has neither.
vi.mock(
  '@/domains/tenancy/sub-domains/organization/organization-settings/organization-mfa-policy.js',
  () => ({
    organizationRequiresMfa: vi.fn().mockResolvedValue(false),
  }),
);

import { resolveUserOrganizationPermissions } from '@/domains/tenancy/sub-domains/permission/authorization.service.js';
import { organizationRequiresMfa } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-mfa-policy.js';
import {
  requireOrganizationPermission,
  requireRole,
} from '@/shared/utils/auth/authorization.util.js';
import { attachPrincipalScope } from '@/tests/helpers/principal-scope.helper.js';

const mockedResolvePermissions = vi.mocked(resolveUserOrganizationPermissions);
const mockedOrganizationRequiresMfa = vi.mocked(organizationRequiresMfa);

function mockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return attachPrincipalScope({
    auth: {
      kind: 'user' as const,
      userId: 'user-1',
      role: GLOBAL_ROLES.USER,
      organizationPublicId: 'org-public',
    },
    params: {},
    ...overrides,
  }) as FastifyRequest;
}

const mockReply = {} as FastifyReply;

describe('authorization.util', () => {
  beforeEach(() => {
    mockedResolvePermissions.mockReset();
    mockedOrganizationRequiresMfa.mockReset().mockResolvedValue(false);
  });

  describe('requireRole', () => {
    it('allows user with matching global role', async () => {
      const handler = requireRole(GLOBAL_ROLES.USER);
      await expect(
        handler(
          mockRequest({
            auth: { kind: 'user' as const, userId: 'user-1', role: GLOBAL_ROLES.USER },
          }),
          mockReply,
        ),
      ).resolves.toBeUndefined();
    });

    it('throws ForbiddenError when role is not allowed', async () => {
      const handler = requireRole(GLOBAL_ROLES.SUPER_ADMIN);
      await expect(
        handler(
          mockRequest({
            auth: { kind: 'user' as const, userId: 'user-1', role: GLOBAL_ROLES.USER },
          }),
          mockReply,
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws UnauthorizedError when not authenticated', async () => {
      const handler = requireRole(GLOBAL_ROLES.USER);
      await expect(handler(mockRequest({ auth: null }), mockReply)).rejects.toThrow(
        UnauthorizedError,
      );
    });
  });

  describe('requireOrganizationPermission', () => {
    it('allows when user has required permission', async () => {
      mockedResolvePermissions.mockResolvedValue(['membership:read', 'membership:manage']);
      const handler = requireOrganizationPermission('membership:manage');
      await expect(handler(mockRequest(), mockReply)).resolves.toBeUndefined();
      expect(mockedResolvePermissions).toHaveBeenCalledWith('user-1', 'org-public');
    });

    it('throws ForbiddenError when permission is missing', async () => {
      mockedResolvePermissions.mockResolvedValue(['membership:read']);
      const handler = requireOrganizationPermission('membership:manage');
      await expect(handler(mockRequest(), mockReply)).rejects.toThrow(ForbiddenError);
    });

    describe('organizations whose security policy requires MFA', () => {
      it('refuses a member whose session has not proved a second factor (reason mfa_required)', async () => {
        mockedResolvePermissions.mockResolvedValue(['membership:manage']);
        mockedOrganizationRequiresMfa.mockResolvedValue(true);
        const handler = requireOrganizationPermission('membership:manage');

        await expect(handler(mockRequest(), mockReply)).rejects.toMatchObject({
          statusCode: 403,
          messageKey: 'errors:organizationRequiresMfa',
          reason: 'mfa_required',
        });
        expect(mockedOrganizationRequiresMfa).toHaveBeenCalledWith('org-public');
      });

      it('admits an MFA-verified member without looking the policy up', async () => {
        mockedResolvePermissions.mockResolvedValue(['membership:manage']);
        mockedOrganizationRequiresMfa.mockResolvedValue(true);
        const handler = requireOrganizationPermission('membership:manage');
        const request = mockRequest({
          auth: {
            kind: 'user' as const,
            userId: 'user-1',
            role: GLOBAL_ROLES.USER,
            organizationPublicId: 'org-public',
            mfaVerified: true,
          },
        });

        await expect(handler(request, mockReply)).resolves.toBeUndefined();
        expect(mockedOrganizationRequiresMfa).not.toHaveBeenCalled();
      });

      it('gives a non-member the ordinary 403, before (and without) any MFA lookup', async () => {
        mockedResolvePermissions.mockResolvedValue([]);
        mockedOrganizationRequiresMfa.mockResolvedValue(true);
        const handler = requireOrganizationPermission('membership:manage');

        await expect(handler(mockRequest(), mockReply)).rejects.toMatchObject({
          messageKey: 'errors:insufficientOrganizationPermissions',
          reason: 'missing_permission',
        });
        expect(mockedOrganizationRequiresMfa).not.toHaveBeenCalled();
      });
    });

    it('throws ForbiddenError when the token carries no active organization', async () => {
      const handler = requireOrganizationPermission('membership:read');
      await expect(
        handler(
          mockRequest({
            auth: { kind: 'user' as const, userId: 'user-1', role: GLOBAL_ROLES.USER },
          }),
          mockReply,
        ),
      ).rejects.toThrow(ForbiddenError);
      expect(mockedResolvePermissions).not.toHaveBeenCalled();
    });

    it('ignores an organization_id path parameter — the token claim is the only source', async () => {
      mockedResolvePermissions.mockResolvedValue(['membership:read']);
      const handler = requireOrganizationPermission('membership:read');
      const pathParameters: Record<string, string> = { organization_id: 'org-from-path' };
      await expect(
        handler(mockRequest({ params: pathParameters }), mockReply),
      ).resolves.toBeUndefined();
      expect(mockedResolvePermissions).toHaveBeenCalledWith('user-1', 'org-public');
    });

    it('resolves the organization from the token claim', async () => {
      mockedResolvePermissions.mockResolvedValue(['membership:read']);
      const handler = requireOrganizationPermission('membership:read');
      await expect(
        handler(
          mockRequest({
            params: {},
            auth: {
              kind: 'user' as const,
              userId: 'user-1',
              role: GLOBAL_ROLES.USER,
              organizationPublicId: 'org-from-claim',
            },
          }),
          mockReply,
        ),
      ).resolves.toBeUndefined();
      expect(mockedResolvePermissions).toHaveBeenCalledWith('user-1', 'org-from-claim');
    });

    it('throws UnauthorizedError when not authenticated', async () => {
      const handler = requireOrganizationPermission('membership:read');
      await expect(handler(mockRequest({ auth: null }), mockReply)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('allows an API key scoped to the matching organization', async () => {
      const handler = requireOrganizationPermission('membership:read');
      const request = mockRequest({
        auth: {
          kind: 'apiKey' as const,
          apiKeyPublicId: 'key-1',
          apiKeyScopes: ['membership:read'],
          organizationPublicId: 'org-public',
        },
      } as Partial<FastifyRequest>);
      await expect(handler(request, mockReply)).resolves.toBeUndefined();
    });

    it('scopes an API key to its own claim organization and passes when scoped', async () => {
      // The organization resolves to the key's pinned `organizationPublicId` (the claim).
      const handler = requireOrganizationPermission('membership:read');
      const request = mockRequest({
        params: {} as Record<string, string>,
        auth: {
          kind: 'apiKey' as const,
          apiKeyPublicId: 'key-1',
          apiKeyScopes: ['membership:read'],
          organizationPublicId: 'org-keypinned00000000z',
        },
      } as Partial<FastifyRequest>);
      await expect(handler(request, mockReply)).resolves.toBeUndefined();
    });

    it('rejects an API key whose scope lacks the permission', async () => {
      const handler = requireOrganizationPermission('membership:manage');
      const request = mockRequest({
        params: {} as Record<string, string>,
        auth: {
          kind: 'apiKey' as const,
          apiKeyPublicId: 'key-1',
          apiKeyScopes: ['membership:read'], // read only — lacks manage
          organizationPublicId: 'org-keypinned00000000z',
        },
      } as Partial<FastifyRequest>);
      await expect(handler(request, mockReply)).rejects.toThrow(ForbiddenError);
      // Launch D83 (6): the route gate names the cause like the service-level checks do.
      await expect(handler(request, mockReply)).rejects.toMatchObject({
        reason: 'missing_permission',
      });
    });

    it('fails closed when an API-key principal carries an empty organization', async () => {
      const handler = requireOrganizationPermission('membership:read');
      const request = mockRequest({
        auth: {
          kind: 'apiKey' as const,
          apiKeyPublicId: 'key-1',
          apiKeyScopes: ['membership:read'],
          organizationPublicId: '',
        },
      } as Partial<FastifyRequest>);
      await expect(handler(request, mockReply)).rejects.toThrow(ForbiddenError);
    });
  });
});
