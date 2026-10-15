import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError, UnprocessableEntityError } from '@/shared/errors/index.js';
import {
  findUserActiveOrganizationByPublicId,
  findUserActiveOrganizationPublicIdByInternalId,
} from '@/domains/tenancy/sub-domains/organization/resolve-active-organization.js';
import { UserSettingsService } from '@/domains/user/sub-domains/user-settings/user-settings.service.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { UserSettingsRepository } from '@/domains/user/sub-domains/user-settings/user-settings.repository.js';
import {
  PRINCIPAL_SCOPE,
  type UserPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';

// auth.user_settings is FORCE RLS, so the service wraps repository calls in
// `withAppDatabaseContext (user scope)`, which opens a real `database.transaction()` and would hit Postgres
// (unavailable in the unit lane). Run the inner callback directly so this stays a pure unit test.

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

// The pinned clinic is checked and resolved through the tenancy membership lookups (real queries).
vi.mock('@/domains/tenancy/sub-domains/organization/resolve-active-organization.js', () => ({
  findUserActiveOrganizationByPublicId: vi.fn(),
  findUserActiveOrganizationPublicIdByInternalId: vi.fn(),
}));

const user = { id: 1, public_id: 'user_public' };
const settingsRow = {
  is_dark_mode_enabled: true,
  is_notifications_enabled: false,
  language: 'es',
  preferred_locales: ['es', 'en'],
};

const asUserScope = (userPublicId: string) =>
  PRINCIPAL_SCOPE.REQUEST({
    userPublicId,
    organizationPublicId: 'org_scope_test',
  }) as UserPrincipalDatabaseScope;

describe('UserSettingsService', () => {
  const userService = {
    findUserRecordByPublicId: vi.fn().mockResolvedValue(user),
    // Hot read paths resolve the id inside their own context (no second transaction).
    resolveInternalIdByPublicId: vi.fn().mockResolvedValue(user.id),
  } as unknown as UserService;

  const settingsRepository = {
    getByUserId: vi.fn().mockResolvedValue(settingsRow),
    upsert: vi.fn().mockResolvedValue(settingsRow),
  } as unknown as UserSettingsRepository;

  const service = new UserSettingsService(userService, settingsRepository);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userService.resolveInternalIdByPublicId).mockResolvedValue(user.id);
  });

  it('get returns stored settings', async () => {
    const result = await service.get(asUserScope('user_public'));
    expect(result.language).toBe('es');
    expect(result.is_dark_mode_enabled).toBe(true);
  });

  it('get returns defaults when no settings row exists', async () => {
    vi.mocked(settingsRepository.getByUserId).mockResolvedValue(null);
    const result = await service.get(asUserScope('user_public'));
    expect(result).toEqual({
      is_dark_mode_enabled: false,
      is_notifications_enabled: true,
      language: 'en',
      preferred_locales: ['en'],
      analytics_consent: null,
      analytics_consent_version: null,
      analytics_consent_at: null,
      default_organization_id: null,
    });
  });

  it('get throws when user is missing', async () => {
    vi.mocked(userService.resolveInternalIdByPublicId).mockResolvedValue(null);
    await expect(service.get(asUserScope('missing'))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('update upserts settings for user', async () => {
    const result = await service.update({
      scope: asUserScope('user_public'),
      body: { language: 'fr' },
    });
    expect(settingsRepository.upsert).toHaveBeenCalledWith(1, { language: 'fr' });
    expect(result.language).toBe('es');
  });

  it('update throws when user is missing', async () => {
    vi.mocked(userService.resolveInternalIdByPublicId).mockResolvedValue(null);
    await expect(
      service.update({ scope: asUserScope('missing'), body: { language: 'de' } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  describe('default_organization_id (the clinic at sign-in)', () => {
    it('pins an active clinic the caller actively belongs to, stored by internal id', async () => {
      vi.mocked(findUserActiveOrganizationByPublicId).mockResolvedValue({
        id: 7,
        public_id: 'org_clinic',
        type: 'TEAM',
      });
      vi.mocked(settingsRepository.upsert).mockResolvedValueOnce({
        ...settingsRow,
        default_organization_id: 7,
      } as never);
      vi.mocked(findUserActiveOrganizationPublicIdByInternalId).mockResolvedValue('org_clinic');

      const result = await service.update({
        scope: asUserScope('user_public'),
        body: { default_organization_id: 'org_clinic' },
      });

      expect(findUserActiveOrganizationByPublicId).toHaveBeenCalledWith({
        userInternalId: 1,
        organizationPublicId: 'org_clinic',
      });
      expect(settingsRepository.upsert).toHaveBeenCalledWith(1, { default_organization_id: 7 });
      expect(result.default_organization_id).toBe('org_clinic');
    });

    it('null clears the pin without a membership lookup', async () => {
      await service.update({
        scope: asUserScope('user_public'),
        body: { default_organization_id: null },
      });

      expect(findUserActiveOrganizationByPublicId).not.toHaveBeenCalled();
      expect(settingsRepository.upsert).toHaveBeenCalledWith(1, { default_organization_id: null });
    });

    it.each([
      ['not a membership the caller holds', undefined],
      ['a personal workspace', { id: 3, public_id: 'org_personal', type: 'PERSONAL' }],
    ])(
      'refuses %s with 422 default_organization_unavailable and stores nothing',
      async (_label, found) => {
        vi.mocked(findUserActiveOrganizationByPublicId).mockResolvedValue(found);

        const updating = service.update({
          scope: asUserScope('user_public'),
          body: { default_organization_id: 'org_somewhere', language: 'fr' },
        });

        await expect(updating).rejects.toBeInstanceOf(UnprocessableEntityError);
        await expect(updating).rejects.toMatchObject({
          reason: 'default_organization_unavailable',
        });
        expect(settingsRepository.upsert).not.toHaveBeenCalled();
      },
    );

    it('reports a pin that is no longer usable as null (automatic)', async () => {
      vi.mocked(settingsRepository.getByUserId).mockResolvedValueOnce({
        ...settingsRow,
        default_organization_id: 7,
      } as never);
      vi.mocked(findUserActiveOrganizationPublicIdByInternalId).mockResolvedValue(undefined);

      const result = await service.get(asUserScope('user_public'));

      expect(findUserActiveOrganizationPublicIdByInternalId).toHaveBeenCalledWith({
        userInternalId: 1,
        organizationInternalId: 7,
      });
      expect(result.default_organization_id).toBeNull();
    });
  });
});
