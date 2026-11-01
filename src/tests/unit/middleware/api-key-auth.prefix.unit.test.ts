import Fastify, { type FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { applyApiKeyAuthentication } from '@/shared/middlewares/security/api-key-auth.middleware.js';

/**
 * The key lookup prefix comes from `ORGANIZATION_API_KEY_PREFIX_DISPLAY_LENGTH`, the constant the
 * key service stores `key_prefix` with — not a literal `8` that would drift from it. The constant
 * is set to an unusual length here so a hardcoded slice fails.
 */
vi.mock('@/shared/constants/limits.constants.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ORGANIZATION_API_KEY_PREFIX_DISPLAY_LENGTH: 11,
}));

describe('applyApiKeyAuthentication key prefix', () => {
  it('looks the key up by the prefix length the key service stores', async () => {
    const authenticate = vi.fn().mockResolvedValue({
      public_id: 'key_public_id',
      organization_public_id: 'org_public_id',
      scopes: [],
    });
    const application = Fastify();
    application.decorate('tenancyDomain', { organizationApiKeyService: { authenticate } } as never);
    await application.ready();
    try {
      const rawKey = 'ak_prefixcheck0000000000000000000000';
      const request = {
        headers: { authorization: `ApiKey ${rawKey}` },
        server: application,
      } as unknown as FastifyRequest;

      await applyApiKeyAuthentication(request);

      expect(authenticate).toHaveBeenCalledWith(
        expect.objectContaining({ key_prefix: rawKey.slice(0, 11) }),
      );
    } finally {
      await application.close();
    }
  });
});
