import { describe, it, expect, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createOrganizationSettingsController } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.controller.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { NotFoundError, UnauthorizedError } from '@/shared/errors/index.js';
import type { OrganizationSettingsService } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.service.js';
import { attachPrincipalScope } from '@/tests/helpers/principal-scope.helper.js';

/** The active organization every fake request's token claims (no route carries one). */
const ACTIVE_ORGANIZATION_PUBLIC_ID = generatePublicId('organization');
function mockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return attachPrincipalScope({
    auth: {
      kind: 'user',
      userId: generatePublicId('user'),
      role: 'user',
      organizationPublicId: ACTIVE_ORGANIZATION_PUBLIC_ID,
    },
    params: {},
    body: {},
    headers: {},
    id: 'request-id',
    ...overrides,
  }) as FastifyRequest;
}

function mockReply(): FastifyReply {
  return {} as FastifyReply;
}

describe('createOrganizationSettingsController', () => {
  const organizationPublicId = ACTIVE_ORGANIZATION_PUBLIC_ID;
  const settingsRow = {
    organization_id: organizationPublicId,
    is_email_notifications_enabled: true,
    default_locale: 'en',
    security_policy: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const service = {
    get: vi.fn().mockResolvedValue(settingsRow),
    update: vi.fn().mockResolvedValue(settingsRow),
    resolveDefaultLocaleForOrganization: vi.fn().mockResolvedValue('en'),
    userHasOrganizationRequiringMfa: vi.fn().mockResolvedValue(false),
  } as unknown as OrganizationSettingsService;

  const controller = createOrganizationSettingsController(service);

  it('getSettings delegates to service and returns settings', async () => {
    const response = await controller.getSettings(mockRequest({ params: {} }), mockReply());
    expect(service.get).toHaveBeenCalledWith(
      expect.objectContaining({ organizationPublicId, source: 'request' }),
    );
    expect(response).toMatchObject({ data: settingsRow });
  });

  it('getSettings propagates NotFoundError when organization is missing', async () => {
    vi.mocked(service.get).mockRejectedValueOnce(new NotFoundError('Organization'));
    await expect(
      controller.getSettings(mockRequest({ params: {} }), mockReply()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getSettings propagates generic error', async () => {
    vi.mocked(service.get).mockRejectedValueOnce(new Error('Database error'));
    await expect(controller.getSettings(mockRequest({ params: {} }), mockReply())).rejects.toThrow(
      'Database error',
    );
  });

  it('updateSettings delegates to service with body and user', async () => {
    const body = { is_email_notifications_enabled: false };
    const userId = generatePublicId('user');
    const response = await controller.updateSettings(
      mockRequest({
        params: {},
        body,
        auth: { kind: 'user', userId, role: 'user', organizationPublicId } as never,
      }),
      mockReply(),
    );
    expect(service.update).toHaveBeenCalledWith(
      expect.objectContaining({ organizationPublicId, userPublicId: userId, source: 'request' }),
      body,
      userId,
    );
    expect(response).toMatchObject({ data: settingsRow });
  });

  it('updateSettings throws UnauthorizedError when auth is missing', async () => {
    await expect(
      controller.updateSettings(
        mockRequest({
          params: {},
          auth: undefined as never,
        }),
        mockReply(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('updateSettings propagates NotFoundError from service', async () => {
    vi.mocked(service.update).mockRejectedValueOnce(new NotFoundError('Organization'));
    await expect(
      controller.updateSettings(mockRequest({ params: {}, body: {} }), mockReply()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
