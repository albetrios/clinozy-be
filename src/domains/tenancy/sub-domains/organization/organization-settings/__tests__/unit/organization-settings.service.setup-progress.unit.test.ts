import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Blanket maintenance passthrough: services this suite touches (directly or via
    // cross-domain imports) may enter maintenance contexts (tombstoning, admin reads) —
    // the real wrapper opens a database.transaction() and CI's unit lane has no Postgres.
    withMaintenanceDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
    withAppDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
  };
});

vi.mock(
  '@/domains/tenancy/sub-domains/organization/organization-settings/i18n-locale.cache.js',
  () => ({
    getCachedOrganizationDefaultLocale: vi.fn().mockResolvedValue(null),
    setCachedOrganizationDefaultLocale: vi.fn().mockResolvedValue(undefined),
    invalidateCachedOrganizationDefaultLocale: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock(
  '@/domains/tenancy/sub-domains/organization/organization-settings/organization-mfa-policy.js',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    invalidateOrganizationMfaPolicy: vi.fn().mockResolvedValue(undefined),
  }),
);

import { NotFoundError } from '@/shared/errors/index.js';
import { invalidateOrganizationMfaPolicy } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-mfa-policy.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
  type OrganizationPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';
import { OrganizationSettingsService } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.service.js';
import type { OrganizationRepository } from '@/domains/tenancy/sub-domains/organization/organization.repository.js';
import type { OrganizationSettingsRepository } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.repository.js';
import type { OrganizationSetupProgress } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.types.js';

const organization = { id: 1, public_id: 'org_public_abc', name: 'Test Org' };
const scope = PRINCIPAL_SCOPE.REQUEST({
  userPublicId: 'user_public',
  organizationPublicId: 'org_public_abc',
}) as OrganizationPrincipalDatabaseScope;

/** The clinic's progress as the repository reads it back. */
const progress: OrganizationSetupProgress = {
  answered_steps: ['clinic_type'],
  skipped_items: [],
  deferred_at: null,
  completed_at: null,
  completed_by_membership_public_id: null,
  guide_hidden_at: null,
  guide_done_at: null,
  updated_at: new Date('2026-05-01T00:00:00.000Z'),
  updated_by_user_id: null,
};
const completedProgress: OrganizationSetupProgress = {
  ...progress,
  completed_at: new Date('2026-06-01T00:00:00.000Z'),
  completed_by_membership_public_id: 'mem_public',
};

/** The order two mocks were called in: negative when `first` ran before `second`. */
const callOrder = (first: { mock: { invocationCallOrder: number[] } }, second: typeof first) =>
  (first.mock.invocationCallOrder[0] ?? 0) - (second.mock.invocationCallOrder[0] ?? 0);

describe('OrganizationSettingsService — the setup progress (feat-clinic-setup)', () => {
  const organizationRepository = {
    findByPublicId: vi.fn().mockResolvedValue(organization),
    resolveUserIdByPublicId: vi.fn().mockResolvedValue(10),
  } as unknown as OrganizationRepository;

  const settingsRepository = {
    findByOrganizationId: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({
      is_email_notifications_enabled: true,
      default_locale: 'en',
      security_policy: { mfa_required: true },
      created_at: new Date('2026-05-01T00:00:00.000Z'),
      updated_at: new Date('2026-05-01T00:00:00.000Z'),
    }),
    findSetupProgress: vi.fn().mockResolvedValue(progress),
    ensureRow: vi.fn().mockResolvedValue(undefined),
    mergeSetupProgress: vi.fn().mockResolvedValue(undefined),
    completeSetup: vi.fn().mockResolvedValue(true),
    markSetupGuideDone: vi.fn().mockResolvedValue(true),
  } as unknown as OrganizationSettingsRepository;

  const service = new OrganizationSettingsService(organizationRepository, settingsRepository);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(organizationRepository.findByPublicId).mockResolvedValue(organization as never);
    vi.mocked(organizationRepository.resolveUserIdByPublicId).mockResolvedValue(10);
    vi.mocked(settingsRepository.findSetupProgress).mockResolvedValue(progress);
  });

  describe('getSetupProgress', () => {
    it("reads the clinic's progress in its organization context, unlocked by default", async () => {
      const result = await service.getSetupProgress({ scope });
      expect(withAppDatabaseContext).toHaveBeenCalledWith(expect.objectContaining({ scope }));
      expect(organizationRepository.findByPublicId).toHaveBeenCalledWith('org_public_abc');
      expect(settingsRepository.findSetupProgress).toHaveBeenCalledWith(organization.id, {
        lock: false,
      });
      expect(result).toBe(progress);
      expect(settingsRepository.ensureRow).not.toHaveBeenCalled();
    });

    it('holds the row FOR UPDATE when asked to lock', async () => {
      await service.getSetupProgress({ scope, lock: true });
      expect(settingsRepository.findSetupProgress).toHaveBeenCalledWith(organization.id, {
        lock: true,
      });
    });

    it('treats an explicit lock: false as no lock', async () => {
      await service.getSetupProgress({ scope, lock: false });
      expect(settingsRepository.findSetupProgress).toHaveBeenCalledWith(organization.id, {
        lock: false,
      });
    });

    it('creates the settings row first when the clinic has none, then reads it with the same lock', async () => {
      vi.mocked(settingsRepository.findSetupProgress)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(progress);
      const result = await service.getSetupProgress({ scope, lock: true });
      expect(settingsRepository.ensureRow).toHaveBeenCalledWith(organization.id);
      expect(settingsRepository.findSetupProgress).toHaveBeenCalledTimes(2);
      expect(settingsRepository.findSetupProgress).toHaveBeenNthCalledWith(2, organization.id, {
        lock: true,
      });
      expect(result).toBe(progress);
    });

    it('throws NotFoundError when the row cannot be created either', async () => {
      vi.mocked(settingsRepository.findSetupProgress).mockResolvedValue(null);
      await expect(service.getSetupProgress({ scope })).rejects.toBeInstanceOf(NotFoundError);
      expect(settingsRepository.ensureRow).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundError when the organization is missing, before any read', async () => {
      vi.mocked(organizationRepository.findByPublicId).mockResolvedValue(null);
      await expect(service.getSetupProgress({ scope })).rejects.toBeInstanceOf(NotFoundError);
      expect(settingsRepository.findSetupProgress).not.toHaveBeenCalled();
    });
  });

  describe('changeSetupProgress (OS5)', () => {
    it('merges the change with the acting user, then reads the progress back', async () => {
      const result = await service.changeSetupProgress({
        scope,
        change: { answered_steps_add: ['you'], guide_hidden: true },
        actingUserPublicId: 'user_public',
      });
      expect(organizationRepository.resolveUserIdByPublicId).toHaveBeenCalledWith('user_public');
      expect(settingsRepository.mergeSetupProgress).toHaveBeenCalledWith(organization.id, {
        answered_steps_add: ['you'],
        guide_hidden: true,
        updated_by_user_id: 10,
      });
      expect(
        callOrder(
          vi.mocked(settingsRepository.mergeSetupProgress),
          vi.mocked(settingsRepository.findSetupProgress),
        ),
      ).toBeLessThan(0);
      expect(settingsRepository.findSetupProgress).toHaveBeenCalledWith(organization.id, {
        lock: false,
      });
      expect(result).toBe(progress);
    });

    it('records no user when none is acting (a job), without resolving one', async () => {
      await service.changeSetupProgress({
        scope,
        change: { deferred: true },
        actingUserPublicId: undefined,
      });
      expect(organizationRepository.resolveUserIdByPublicId).not.toHaveBeenCalled();
      expect(settingsRepository.mergeSetupProgress).toHaveBeenCalledWith(organization.id, {
        deferred: true,
        updated_by_user_id: null,
      });
    });

    it('records no user when the acting login no longer resolves', async () => {
      vi.mocked(organizationRepository.resolveUserIdByPublicId).mockResolvedValueOnce(null);
      await service.changeSetupProgress({
        scope,
        change: { skipped_items_remove: ['treatments'] },
        actingUserPublicId: 'gone_public',
      });
      expect(settingsRepository.mergeSetupProgress).toHaveBeenCalledWith(organization.id, {
        skipped_items_remove: ['treatments'],
        updated_by_user_id: null,
      });
    });

    it('creates the settings row on the read back when the merge made none visible', async () => {
      vi.mocked(settingsRepository.findSetupProgress)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(progress);
      const result = await service.changeSetupProgress({
        scope,
        change: { skipped_items_add: ['invite_team'] },
        actingUserPublicId: 'user_public',
      });
      expect(settingsRepository.ensureRow).toHaveBeenCalledWith(organization.id);
      expect(result).toBe(progress);
    });

    it('throws NotFoundError when the organization is missing, writing nothing', async () => {
      vi.mocked(organizationRepository.findByPublicId).mockResolvedValue(null);
      await expect(
        service.changeSetupProgress({
          scope,
          change: { deferred: true },
          actingUserPublicId: 'user_public',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(settingsRepository.mergeSetupProgress).not.toHaveBeenCalled();
    });
  });

  describe('completeSetup (OS6)', () => {
    it('ensures the row, takes the clinic live once and answers the progress read back', async () => {
      vi.mocked(settingsRepository.findSetupProgress)
        .mockResolvedValueOnce(progress)
        .mockResolvedValueOnce(completedProgress);
      const result = await service.completeSetup({ scope, membershipId: 7 });
      expect(settingsRepository.completeSetup).toHaveBeenCalledWith(organization.id, 7);
      expect(settingsRepository.findSetupProgress).toHaveBeenCalledTimes(2);
      // The first read ensures the row BEFORE the conditional update; the second reads the result.
      expect(
        callOrder(
          vi.mocked(settingsRepository.findSetupProgress),
          vi.mocked(settingsRepository.completeSetup),
        ),
      ).toBeLessThan(0);
      expect(result).toBe(completedProgress);
    });

    it('creates the settings row first for a clinic that has none', async () => {
      vi.mocked(settingsRepository.findSetupProgress)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(progress)
        .mockResolvedValueOnce(completedProgress);
      const result = await service.completeSetup({ scope, membershipId: null });
      expect(settingsRepository.ensureRow).toHaveBeenCalledWith(organization.id);
      expect(
        callOrder(
          vi.mocked(settingsRepository.ensureRow),
          vi.mocked(settingsRepository.completeSetup),
        ),
      ).toBeLessThan(0);
      expect(settingsRepository.completeSetup).toHaveBeenCalledWith(organization.id, null);
      expect(result).toBe(completedProgress);
    });

    it('throws NotFoundError when the organization is missing, writing nothing', async () => {
      vi.mocked(organizationRepository.findByPublicId).mockResolvedValue(null);
      await expect(service.completeSetup({ scope, membershipId: 7 })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(settingsRepository.completeSetup).not.toHaveBeenCalled();
    });
  });

  describe('update — the MFA policy cache', () => {
    it('drops the cached policy after the commit when the security policy changes', async () => {
      await service.update({ scope, body: { security_policy: { mfa_required: true } } });
      expect(settingsRepository.upsert).toHaveBeenCalledWith(
        organization.id,
        expect.objectContaining({ security_policy: { mfa_required: true } }),
      );
      expect(invalidateOrganizationMfaPolicy).toHaveBeenCalledWith('org_public_abc');
    });

    it('leaves the cached policy alone when the patch carries no security policy', async () => {
      await service.update({ scope, body: { is_email_notifications_enabled: false } });
      expect(invalidateOrganizationMfaPolicy).not.toHaveBeenCalled();
    });
  });

  describe('markSetupGuideDone (OS7)', () => {
    it('stamps the guide once and answers the progress read back', async () => {
      const doneProgress = { ...progress, guide_done_at: new Date('2026-06-02T00:00:00.000Z') };
      vi.mocked(settingsRepository.findSetupProgress).mockResolvedValueOnce(doneProgress);
      const result = await service.markSetupGuideDone(scope);
      expect(settingsRepository.markSetupGuideDone).toHaveBeenCalledWith(organization.id);
      expect(
        callOrder(
          vi.mocked(settingsRepository.markSetupGuideDone),
          vi.mocked(settingsRepository.findSetupProgress),
        ),
      ).toBeLessThan(0);
      expect(result).toBe(doneProgress);
    });

    it('creates the settings row on the read back when the clinic has none', async () => {
      vi.mocked(settingsRepository.findSetupProgress)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(progress);
      await expect(service.markSetupGuideDone(scope)).resolves.toBe(progress);
      expect(settingsRepository.ensureRow).toHaveBeenCalledWith(organization.id);
    });

    it('throws NotFoundError when the organization is missing, writing nothing', async () => {
      vi.mocked(organizationRepository.findByPublicId).mockResolvedValue(null);
      await expect(service.markSetupGuideDone(scope)).rejects.toBeInstanceOf(NotFoundError);
      expect(settingsRepository.markSetupGuideDone).not.toHaveBeenCalled();
    });
  });
});
