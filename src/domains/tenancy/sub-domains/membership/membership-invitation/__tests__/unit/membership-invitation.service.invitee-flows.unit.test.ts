import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/domains/tenancy/sub-domains/permission/permission-cache.service.js', () => ({
  invalidatePermissions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/events/event-bus.js', () => ({
  eventBus: {
    emit: vi.fn().mockResolvedValue(undefined),
    emitStrict: vi.fn().mockResolvedValue(undefined),
  },
  buildDomainEvent: ({
    type,
    payload,
    options,
  }: {
    type: string;
    payload: unknown;
    options?: { requestId?: string } | undefined;
  }) => ({
    type,
    payload,
    timestamp: new Date(),
    ...(options?.requestId !== undefined ? { requestId: options.requestId } : {}),
  }),
}));

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Blanket maintenance passthrough: services this suite touches (directly or via
    // cross-domain imports) may enter maintenance contexts (tombstoning, admin reads) —
    // the real wrapper opens a database.transaction() and CI's unit lane has no Postgres.
    withMaintenanceDatabaseContext: vi.fn(
      async ({ callback }: { callback: () => Promise<unknown> }) => callback(),
    ),
    withAppDatabaseContext: vi.fn(async ({ callback }: { callback: () => Promise<unknown> }) =>
      callback(),
    ),
  };
});

vi.mock(
  '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.token.js',
  () => ({
    generateInvitationToken: vi.fn().mockReturnValue('raw-token-abc123'),
    hashInvitationToken: vi.fn().mockReturnValue('hashed-token-abc123'),
  }),
);

import { NotFoundError, ValidationError } from '@/shared/errors/index.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { MembershipInvitationService } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.service.js';
import { MEMBERSHIP_INVITATION_EVENT } from '@/domains/tenancy/sub-domains/membership/membership-invitation/events/membership-invitation.events.js';
import { MEMBERSHIP_EVENT } from '@/domains/tenancy/sub-domains/membership/events/membership.events.js';
import { eventBus } from '@/core/events/event-bus.js';
import type { ObjectStoragePort } from '@/infrastructure/storage/object-storage.port.js';
import type { OrganizationRepository } from '@/domains/tenancy/sub-domains/organization/organization.repository.js';
import type { MembershipRepository } from '@/domains/tenancy/sub-domains/membership/membership.repository.js';
import type { MembershipInvitationRepository } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.repository.js';
import type { UserService } from '@/domains/user/user.service.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
  type OrganizationPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';

const now = new Date('2026-06-01T00:00:00.000Z');
const futureDate = new Date('2026-06-15T00:00:00.000Z');
const pastDate = new Date('2026-05-01T00:00:00.000Z');
const organization = { id: 1, public_id: 'org_public_abc', name: 'Test Org' };
const membership = { id: 10, public_id: 'mem_public_xyz', organization_id: 1, user_id: 5 };
const lookup = {
  organization_public_id: 'org_public_abc',
  organization_id: 1,
  membership_id: 10,
  membership_public_id: 'mem_public_xyz',
};

function makeInvitationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    public_id: 'inv_public_123',
    membership_id: 10,
    email: 'invitee@example.com',
    token_hash: 'hashed-token-abc123',
    invited_by_user_id: 2,
    expires_at: futureDate,
    accepted_at: null,
    revoked_at: null,
    created_at: now,
    ...overrides,
  };
}

/** One of the signed-in person's pending invitations as the SECURITY DEFINER read returns it. */
function makePendingRow(overrides: Record<string, unknown> = {}) {
  return {
    invitation_id: 100,
    invitation_public_id: 'inv_public_123',
    organization_public_id: 'org_public_abc',
    organization_name: 'Test Org',
    organization_slug: 'test-org',
    organization_logo_url: null,
    membership_public_id: 'mem_public_xyz',
    role_names: ['Doctor'],
    inviter_name: 'Asha Mehta',
    expires_at: futureDate,
    created_at: now,
    ...overrides,
  };
}

const verifiedInvitee = {
  id: 5,
  public_id: 'user_public_id',
  email: 'invitee@example.com',
  first_name: 'Ira',
  last_name: 'Nair',
  is_email_verified: true,
};

describe('MembershipInvitationService — the invitee flows (launch D84) and the decline notice', () => {
  const organizationRepository = {
    findByPublicId: vi.fn().mockResolvedValue(organization),
    resolveUserPublicIdByInternalId: vi.fn().mockResolvedValue('user_public_id'),
  } as unknown as OrganizationRepository;

  const membershipRepository = {
    findById: vi.fn().mockResolvedValue(membership),
    findByPublicId: vi.fn().mockResolvedValue(membership),
    activateForInvitationAccept: vi.fn().mockResolvedValue(membership),
    findUserIdsWithPermission: vi.fn().mockResolvedValue([]),
    findByUserAndOrganization: vi.fn().mockResolvedValue(null),
  } as unknown as MembershipRepository;

  const invitationRepository = {
    findByPublicId: vi.fn().mockResolvedValue(makeInvitationRow()),
    lookupOrganizationByInvitationPublicId: vi.fn().mockResolvedValue(lookup),
    accept: vi.fn().mockResolvedValue(makeInvitationRow({ accepted_at: now })),
    revoke: vi.fn().mockResolvedValue(makeInvitationRow({ revoked_at: now })),
    resend: vi.fn().mockResolvedValue(makeInvitationRow()),
    findLatestByMembershipId: vi.fn().mockResolvedValue(makeInvitationRow()),
    listPendingForEmail: vi.fn().mockResolvedValue({
      items: [makePendingRow()],
      limit: 5,
      has_more: false,
      next_cursor: null,
    }),
  } as unknown as MembershipInvitationRepository;

  const userService = {
    requireUserRecordByPublicId: vi.fn().mockResolvedValue(verifiedInvitee),
    findById: vi.fn().mockResolvedValue({
      id: 2,
      first_name: 'Asha',
      last_name: 'Mehta',
      email: 'asha@example.com',
    }),
  } as unknown as UserService;

  const organizationSettingsService = {
    resolveDefaultLocaleForOrganization: vi.fn().mockResolvedValue('es'),
  };

  const objectStorage = {
    createPresignedDownloadUrl: vi.fn().mockResolvedValue('https://signed.example.com/logo'),
  } as unknown as ObjectStoragePort;

  const service = new MembershipInvitationService(
    organizationRepository,
    membershipRepository,
    invitationRepository,
    userService,
    undefined,
    organizationSettingsService,
  );

  /** The container's wiring: logos presigned and the accept's membership event emitted. */
  const membershipEvents = { emitMembershipEvents: vi.fn().mockResolvedValue([]) };
  const wiredService = new MembershipInvitationService(
    organizationRepository,
    membershipRepository,
    invitationRepository,
    userService,
    objectStorage,
    organizationSettingsService,
  );
  wiredService.wireMembershipEvents(membershipEvents);

  /** A harness without the user service: no inviter can be named. */
  const serviceWithoutUsers = new MembershipInvitationService(
    organizationRepository,
    membershipRepository,
    invitationRepository,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    // Pin the clock so the fixed `expires_at` fixtures never lapse against the real wall clock.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    vi.mocked(organizationRepository.findByPublicId).mockResolvedValue(organization as never);
    vi.mocked(membershipRepository.activateForInvitationAccept).mockResolvedValue(
      membership as never,
    );
    vi.mocked(membershipRepository.findByPublicId).mockResolvedValue(membership as never);
    vi.mocked(membershipRepository.findUserIdsWithPermission).mockResolvedValue([]);
    vi.mocked(membershipRepository.findByUserAndOrganization).mockResolvedValue(null);
    vi.mocked(invitationRepository.findByPublicId).mockResolvedValue(makeInvitationRow() as never);
    vi.mocked(invitationRepository.lookupOrganizationByInvitationPublicId).mockResolvedValue(
      lookup as never,
    );
    vi.mocked(invitationRepository.accept).mockResolvedValue(
      makeInvitationRow({ accepted_at: now }) as never,
    );
    vi.mocked(invitationRepository.revoke).mockResolvedValue(
      makeInvitationRow({ revoked_at: now }) as never,
    );
    vi.mocked(invitationRepository.resend).mockResolvedValue(makeInvitationRow() as never);
    vi.mocked(invitationRepository.findLatestByMembershipId).mockResolvedValue(
      makeInvitationRow() as never,
    );
    vi.mocked(invitationRepository.listPendingForEmail).mockResolvedValue({
      items: [makePendingRow()],
      limit: 5,
      has_more: false,
      next_cursor: null,
    });
    vi.mocked(userService.requireUserRecordByPublicId).mockResolvedValue(verifiedInvitee as never);
    vi.mocked(organizationSettingsService.resolveDefaultLocaleForOrganization).mockResolvedValue(
      'es',
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('accept — when the one-shot UPDATE matches nothing', () => {
    const acceptInput = {
      invitation_public_id: 'inv_public_123',
      body: { token: 'raw-token-abc123' },
      actingUserPublicId: 'user_public_id',
    };

    it.each([
      ['a 404 when the row vanished', null, { name: 'NotFoundError' }],
      [
        'invitation_revoked when it was revoked meanwhile',
        makeInvitationRow({ revoked_at: now }),
        { name: 'ValidationError', reason: 'invitation_revoked' },
      ],
      [
        'invitation_already_accepted when a concurrent accept won',
        makeInvitationRow({ accepted_at: now }),
        { name: 'ValidationError', reason: 'invitation_already_accepted' },
      ],
      [
        'invitation_expired when it lapsed meanwhile',
        makeInvitationRow({ expires_at: pastDate }),
        { name: 'ValidationError', reason: 'invitation_expired' },
      ],
      [
        'an invalid token when the row is still open (the hash did not match)',
        makeInvitationRow(),
        {
          name: 'ValidationError',
          messageKey: 'errors:validation.invalidToken',
          errors: [{ field: 'token', messageKey: 'errors:validation.invalidToken' }],
        },
      ],
    ])('re-reads the row and answers %s', async (_label, current, expected) => {
      vi.mocked(invitationRepository.accept).mockResolvedValueOnce(null);
      vi.mocked(invitationRepository.findByPublicId)
        .mockResolvedValueOnce(makeInvitationRow() as never)
        .mockResolvedValueOnce(current as never);
      await expect(service.accept(acceptInput)).rejects.toMatchObject(expected);
      expect(invitationRepository.findByPublicId).toHaveBeenCalledTimes(2);
      expect(membershipRepository.activateForInvitationAccept).not.toHaveBeenCalled();
    });
  });

  describe('accept — the wired membership event', () => {
    const acceptInput = {
      invitation_public_id: 'inv_public_123',
      body: { token: 'raw-token-abc123' },
      actingUserPublicId: 'user_public_id',
    };

    it('announces the activated membership through the membership service, in the organization', async () => {
      await wiredService.accept(acceptInput);
      expect(membershipEvents.emitMembershipEvents).toHaveBeenCalledWith({
        type: MEMBERSHIP_EVENT.UPDATED,
        memberships: [membership],
        organization,
      });
    });

    it('emits nothing when the organization cannot be read', async () => {
      vi.mocked(organizationRepository.findByPublicId).mockResolvedValue(null);
      await wiredService.accept(acceptInput);
      expect(membershipEvents.emitMembershipEvents).not.toHaveBeenCalled();
    });

    it('emits nothing in a harness without the port', async () => {
      await service.accept(acceptInput);
      expect(membershipEvents.emitMembershipEvents).not.toHaveBeenCalled();
    });
  });

  describe('accept — the invite-accepted notice (item #10)', () => {
    const acceptInput = {
      invitation_public_id: 'inv_public_123',
      body: { token: 'raw-token-abc123' },
      actingUserPublicId: 'user_public_id',
    };

    it("tells the members who can add members, minus the invitee, in the organization's language", async () => {
      vi.mocked(membershipRepository.findUserIdsWithPermission).mockResolvedValueOnce([5, 7]);
      await service.accept(acceptInput);
      expect(membershipRepository.findUserIdsWithPermission).toHaveBeenCalledWith(
        1,
        'membership:create',
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MEMBERSHIP_INVITATION_EVENT.ACCEPTED,
          payload: {
            recipient_user_ids: [7],
            organization_id: 1,
            organization_name: 'Test Org',
            invitee_name: 'Ira Nair',
            locale: 'es',
          },
        }),
      );
    });

    it('tells nobody when the invitee is the only one who could add members', async () => {
      vi.mocked(membershipRepository.findUserIdsWithPermission).mockResolvedValueOnce([5]);
      await service.accept(acceptInput);
      expect(eventBus.emit).not.toHaveBeenCalled();
      expect(organizationRepository.findByPublicId).not.toHaveBeenCalled();
    });

    it('names no organization when it cannot be read', async () => {
      vi.mocked(membershipRepository.findUserIdsWithPermission).mockResolvedValueOnce([7]);
      vi.mocked(organizationRepository.findByPublicId).mockResolvedValueOnce(null);
      await service.accept(acceptInput);
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ organization_name: '' }),
        }),
      );
    });

    it('logs and swallows a notice failure so the accept stands', async () => {
      const failure = new Error('recipients unavailable');
      vi.mocked(membershipRepository.findUserIdsWithPermission).mockRejectedValueOnce(failure);
      const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      try {
        const result = await service.accept(acceptInput);
        expect(result).toMatchObject({ id: 'inv_public_123', organization_id: 'org_public_abc' });
        expect(errorLog).toHaveBeenCalledWith(
          { err: failure, invitationPublicId: 'inv_public_123' },
          'membership_invitation.accept.notify_failed',
        );
        expect(eventBus.emit).not.toHaveBeenCalled();
      } finally {
        errorLog.mockRestore();
      }
    });
  });

  describe('the signed-in person behind an invitee call', () => {
    it('is a configuration failure in a harness without the user service', async () => {
      await expect(
        serviceWithoutUsers.listMine({ query: { limit: 5 }, actingUserPublicId: 'user_public_id' }),
      ).rejects.toThrow('UserService is not configured on MembershipInvitationService');
      expect(invitationRepository.listPendingForEmail).not.toHaveBeenCalled();
    });
  });

  describe('resendForMembership — the inviter the email names', () => {
    const resendInput = { membership_public_id: 'mem_public_xyz', body: { expires_in_days: 7 } };
    const managerScope = PRINCIPAL_SCOPE.REQUEST({
      userPublicId: 'manager_public',
      organizationPublicId: 'org_public_abc',
    }) as OrganizationPrincipalDatabaseScope;

    it('names the member who resends by their full name', async () => {
      vi.mocked(userService.requireUserRecordByPublicId).mockResolvedValueOnce({
        id: 8,
        public_id: 'manager_public',
        email: 'mia@example.com',
        first_name: 'Mia',
        last_name: 'Chen',
        is_email_verified: true,
      } as never);
      await service.resendForMembership({ ...resendInput, scope: managerScope });
      expect(userService.requireUserRecordByPublicId).toHaveBeenCalledWith('manager_public');
      const [event] = vi.mocked(eventBus.emitStrict).mock.calls[0] ?? [];
      expect(event?.payload).toMatchObject({ inviter_name: 'Mia Chen' });
    });

    it('falls back to their email when they have no name', async () => {
      vi.mocked(userService.requireUserRecordByPublicId).mockResolvedValueOnce({
        id: 8,
        public_id: 'manager_public',
        email: 'mia@example.com',
        first_name: null,
        last_name: null,
        is_email_verified: true,
      } as never);
      await service.resendForMembership({ ...resendInput, scope: managerScope });
      const [event] = vi.mocked(eventBus.emitStrict).mock.calls[0] ?? [];
      expect(event?.payload).toMatchObject({ inviter_name: 'mia@example.com' });
    });

    it('names nobody for an API-key caller (no user on the scope)', async () => {
      await service.resendForMembership({
        ...resendInput,
        scope: PRINCIPAL_SCOPE.REQUEST({
          organizationPublicId: 'org_public_abc',
        }) as OrganizationPrincipalDatabaseScope,
      });
      expect(userService.requireUserRecordByPublicId).not.toHaveBeenCalled();
      const [event] = vi.mocked(eventBus.emitStrict).mock.calls[0] ?? [];
      expect(event?.payload).toMatchObject({ inviter_name: '' });
    });

    it('names nobody when the user record is gone, or without the user service', async () => {
      vi.mocked(userService.requireUserRecordByPublicId).mockResolvedValueOnce(null as never);
      await service.resendForMembership({ ...resendInput, scope: managerScope });
      await serviceWithoutUsers.resendForMembership({ ...resendInput, scope: managerScope });
      const payloads = vi.mocked(eventBus.emitStrict).mock.calls.map(([event]) => event.payload);
      expect(payloads).toHaveLength(2);
      expect(payloads[0]).toMatchObject({ inviter_name: '' });
      expect(payloads[1]).toMatchObject({ inviter_name: '' });
      expect(userService.requireUserRecordByPublicId).toHaveBeenCalledTimes(1);
    });
  });

  describe('listMine (ROUTE #172)', () => {
    it("reads the verified person's pending invitations by their lowercased email, in their own context", async () => {
      vi.mocked(userService.requireUserRecordByPublicId).mockResolvedValueOnce({
        ...verifiedInvitee,
        email: 'Invitee@Example.com',
      } as never);
      const result = await service.listMine({
        query: { limit: 5, after: 'cursor_after' },
        actingUserPublicId: 'user_public_id',
      });
      expect(withAppDatabaseContext).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({ userPublicId: 'user_public_id' }),
        }),
      );
      expect(invitationRepository.listPendingForEmail).toHaveBeenCalledWith('invitee@example.com', {
        limit: 5,
        after: 'cursor_after',
      });
      expect(result).toEqual({
        items: [
          {
            id: 'inv_public_123',
            organization: {
              id: 'org_public_abc',
              name: 'Test Org',
              slug: 'test-org',
              logo_url: null,
            },
            role_names: ['Doctor'],
            inviter_name: 'Asha Mehta',
            expires_at: '2026-06-15T00:00:00.000Z',
            created_at: '2026-06-01T00:00:00.000Z',
          },
        ],
        limit: 5,
        has_more: false,
        next_cursor: null,
      });
    });

    it('omits an absent cursor from the page request', async () => {
      await service.listMine({ query: { limit: 5 }, actingUserPublicId: 'user_public_id' });
      expect(invitationRepository.listPendingForEmail).toHaveBeenCalledWith('invitee@example.com', {
        limit: 5,
      });
    });

    it('reads none for an unverified email, without touching the database', async () => {
      vi.mocked(userService.requireUserRecordByPublicId).mockResolvedValueOnce({
        ...verifiedInvitee,
        is_email_verified: false,
      } as never);
      const result = await service.listMine({
        query: { limit: 7 },
        actingUserPublicId: 'user_public_id',
      });
      expect(result).toEqual({ items: [], limit: 7, has_more: false, next_cursor: null });
      expect(invitationRepository.listPendingForEmail).not.toHaveBeenCalled();
      expect(withAppDatabaseContext).not.toHaveBeenCalled();
    });

    it('presigns a stored clinic logo and passes an absolute one through when storage is wired', async () => {
      vi.mocked(invitationRepository.listPendingForEmail).mockResolvedValueOnce({
        items: [
          makePendingRow({ organization_logo_url: 'logos/clinic.png' }),
          makePendingRow({
            invitation_public_id: 'inv_public_456',
            organization_logo_url: 'https://cdn.example.com/logo.png',
          }),
          makePendingRow({ invitation_public_id: 'inv_public_789' }),
        ],
        limit: 5,
        has_more: true,
        next_cursor: 'cursor_next',
      } as never);
      const result = await wiredService.listMine({
        query: { limit: 5 },
        actingUserPublicId: 'user_public_id',
      });
      expect(objectStorage.createPresignedDownloadUrl).toHaveBeenCalledTimes(1);
      expect(objectStorage.createPresignedDownloadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'logos/clinic.png' }),
      );
      expect(result.items.map((item) => item.organization.logo_url)).toEqual([
        'https://signed.example.com/logo',
        'https://cdn.example.com/logo.png',
        null,
      ]);
      expect(result).toMatchObject({ has_more: true, next_cursor: 'cursor_next' });
    });

    it('leaves a stored logo key unsigned without storage wired', async () => {
      vi.mocked(invitationRepository.listPendingForEmail).mockResolvedValueOnce({
        items: [makePendingRow({ organization_logo_url: 'logos/clinic.png' })],
        limit: 5,
        has_more: false,
        next_cursor: null,
      } as never);
      const result = await service.listMine({
        query: { limit: 5 },
        actingUserPublicId: 'user_public_id',
      });
      expect(result.items[0]?.organization.logo_url).toBeNull();
      expect(objectStorage.createPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('refuses a bad query before resolving the caller', async () => {
      await expect(
        service.listMine({ query: { limit: 0 }, actingUserPublicId: 'user_public_id' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(userService.requireUserRecordByPublicId).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the login is gone', async () => {
      vi.mocked(userService.requireUserRecordByPublicId).mockResolvedValueOnce(null as never);
      await expect(
        service.listMine({ query: { limit: 5 }, actingUserPublicId: 'user_gone' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('revokeForInvitee (ROUTE #174 — the invitation half of declining)', () => {
    it('revokes an open invitation whose email matches the invitee, case aside', async () => {
      const revoked = makeInvitationRow({ revoked_at: now });
      vi.mocked(invitationRepository.revoke).mockResolvedValueOnce(revoked as never);
      const result = await service.revokeForInvitee({
        invitation_public_id: 'inv_public_123',
        inviteeEmail: 'INVITEE@Example.com',
      });
      expect(invitationRepository.findByPublicId).toHaveBeenCalledWith('inv_public_123');
      expect(invitationRepository.revoke).toHaveBeenCalledWith('inv_public_123');
      expect(result).toBe(revoked);
    });

    it('lets an expired invitation be declined too (it frees the seat at once)', async () => {
      vi.mocked(invitationRepository.findByPublicId).mockResolvedValueOnce(
        makeInvitationRow({ expires_at: pastDate }) as never,
      );
      await service.revokeForInvitee({
        invitation_public_id: 'inv_public_123',
        inviteeEmail: 'invitee@example.com',
      });
      expect(invitationRepository.revoke).toHaveBeenCalledWith('inv_public_123');
    });

    it('throws NotFoundError for an unknown invitation', async () => {
      vi.mocked(invitationRepository.findByPublicId).mockResolvedValueOnce(null);
      await expect(
        service.revokeForInvitee({
          invitation_public_id: 'inv_missing',
          inviteeEmail: 'invitee@example.com',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(invitationRepository.revoke).not.toHaveBeenCalled();
    });

    it("forbids anyone but the invited email's owner", async () => {
      await expect(
        service.revokeForInvitee({
          invitation_public_id: 'inv_public_123',
          inviteeEmail: 'someone.else@example.com',
        }),
      ).rejects.toMatchObject({
        name: 'ForbiddenError',
        messageKey: 'errors:invitationEmailMismatch',
      });
      expect(invitationRepository.revoke).not.toHaveBeenCalled();
    });

    it.each([
      ['already revoked', makeInvitationRow({ revoked_at: now }), 'invitation_revoked'],
      ['already accepted', makeInvitationRow({ accepted_at: now }), 'invitation_already_accepted'],
    ])('refuses an invitation %s', async (_label, row, reason) => {
      vi.mocked(invitationRepository.findByPublicId).mockResolvedValueOnce(row as never);
      await expect(
        service.revokeForInvitee({
          invitation_public_id: 'inv_public_123',
          inviteeEmail: 'invitee@example.com',
        }),
      ).rejects.toMatchObject({ name: 'ValidationError', reason });
      expect(invitationRepository.revoke).not.toHaveBeenCalled();
    });

    it('answers invitation_already_accepted when a concurrent accept won the one-shot revoke', async () => {
      vi.mocked(invitationRepository.revoke).mockResolvedValueOnce(null);
      await expect(
        service.revokeForInvitee({
          invitation_public_id: 'inv_public_123',
          inviteeEmail: 'invitee@example.com',
        }),
      ).rejects.toMatchObject({
        name: 'ValidationError',
        messageKey: 'errors:validation.invitationAlreadyAccepted',
        reason: 'invitation_already_accepted',
      });
    });
  });

  describe('revokeExpiredForMembership (ROUTE #175 — the invitation half of the sweep)', () => {
    const expiredBefore = new Date('2026-05-20T00:00:00.000Z');

    it('revokes the latest invitation when it is open and expired before the cut-off', async () => {
      vi.mocked(invitationRepository.findLatestByMembershipId).mockResolvedValueOnce(
        makeInvitationRow({ expires_at: pastDate }) as never,
      );
      const revoked = makeInvitationRow({ expires_at: pastDate, revoked_at: now });
      vi.mocked(invitationRepository.revoke).mockResolvedValueOnce(revoked as never);
      const result = await service.revokeExpiredForMembership({
        membership_id: 10,
        expiredBefore,
      });
      expect(invitationRepository.findLatestByMembershipId).toHaveBeenCalledWith(10);
      expect(invitationRepository.revoke).toHaveBeenCalledWith('inv_public_123', { expiredBefore });
      expect(result).toBe(revoked);
    });

    it.each([
      ['no invitation at all', null],
      ['an accepted invitation', makeInvitationRow({ expires_at: pastDate, accepted_at: now })],
      [
        'an already revoked invitation',
        makeInvitationRow({ expires_at: pastDate, revoked_at: now }),
      ],
      [
        'an invitation expiring exactly at the cut-off',
        makeInvitationRow({ expires_at: expiredBefore }),
      ],
      [
        'an invitation a resend pushed past the cut-off',
        makeInvitationRow({ expires_at: futureDate }),
      ],
    ])('answers null and revokes nothing for %s', async (_label, latest) => {
      vi.mocked(invitationRepository.findLatestByMembershipId).mockResolvedValueOnce(
        latest as never,
      );
      await expect(
        service.revokeExpiredForMembership({ membership_id: 10, expiredBefore }),
      ).resolves.toBeNull();
      expect(invitationRepository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('notifyDeclined (launch D84 (3))', () => {
    const declineInput = {
      invitation: makeInvitationRow({ revoked_at: now }),
      organizationId: 1,
      organizationPublicId: 'org_public_abc',
      inviteeUserId: 5,
      inviteeName: 'Ira Nair',
    };

    it('tells the inviter while they are still an active member here', async () => {
      vi.mocked(membershipRepository.findByUserAndOrganization).mockResolvedValueOnce({
        ...membership,
        user_id: 2,
        status: 'active',
      } as never);
      await service.notifyDeclined(declineInput);
      expect(membershipRepository.findByUserAndOrganization).toHaveBeenCalledWith(2, 1);
      expect(membershipRepository.findUserIdsWithPermission).not.toHaveBeenCalled();
      expect(organizationSettingsService.resolveDefaultLocaleForOrganization).toHaveBeenCalledWith(
        'org_public_abc',
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MEMBERSHIP_INVITATION_EVENT.DECLINED,
          payload: {
            recipient_user_ids: [2],
            organization_id: 1,
            organization_name: 'Test Org',
            invitee_name: 'Ira Nair',
            locale: 'es',
          },
        }),
      );
    });

    it.each([
      ['no longer a member', null],
      ['suspended', { ...membership, user_id: 2, status: 'suspended' }],
    ])(
      'tells the members who can add members, minus the invitee, when the inviter is %s',
      async (_label, inviter) => {
        vi.mocked(membershipRepository.findByUserAndOrganization).mockResolvedValueOnce(
          inviter as never,
        );
        vi.mocked(membershipRepository.findUserIdsWithPermission).mockResolvedValueOnce([5, 7, 20]);
        await service.notifyDeclined(declineInput);
        expect(membershipRepository.findUserIdsWithPermission).toHaveBeenCalledWith(
          1,
          'membership:create',
        );
        expect(eventBus.emit).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: expect.objectContaining({ recipient_user_ids: [7, 20] }),
          }),
        );
      },
    );

    it('tells nobody — and reads nothing more — when no one is left to tell', async () => {
      vi.mocked(membershipRepository.findUserIdsWithPermission).mockResolvedValueOnce([5]);
      await service.notifyDeclined(declineInput);
      expect(organizationRepository.findByPublicId).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('names no organization when it cannot be read, and the default language without settings', async () => {
      vi.mocked(membershipRepository.findUserIdsWithPermission).mockResolvedValueOnce([7]);
      vi.mocked(organizationRepository.findByPublicId).mockResolvedValueOnce(null);
      await serviceWithoutUsers.notifyDeclined(declineInput);
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ organization_name: '', locale: 'en' }),
        }),
      );
    });

    it('logs and swallows a failure so the decline stands', async () => {
      const failure = new Error('recipients unavailable');
      vi.mocked(membershipRepository.findByUserAndOrganization).mockRejectedValueOnce(failure);
      const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      try {
        await expect(service.notifyDeclined(declineInput)).resolves.toBeUndefined();
        expect(errorLog).toHaveBeenCalledWith(
          { err: failure, invitationPublicId: 'inv_public_123' },
          'membership_invitation.decline.notify_failed',
        );
        expect(eventBus.emit).not.toHaveBeenCalled();
      } finally {
        errorLog.mockRestore();
      }
    });
  });
});
