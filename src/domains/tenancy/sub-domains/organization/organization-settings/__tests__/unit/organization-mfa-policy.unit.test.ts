import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisSet = vi.fn().mockResolvedValue('OK');
const redisGet = vi.fn().mockResolvedValue(null);
const redisDel = vi.fn().mockResolvedValue(1);

vi.mock('@/infrastructure/cache/redis.client.js', () => ({
  redisConnection: {
    set: (...args: unknown[]) => redisSet(...args),
    get: (...args: unknown[]) => redisGet(...args),
    del: (...args: unknown[]) => redisDel(...args),
  },
}));

const organizationRequiresMfaFromDatabase = vi.fn();
vi.mock(
  '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.repository.js',
  () => ({
    OrganizationSettingsRepository: class {
      organizationRequiresMfa = organizationRequiresMfaFromDatabase;
    },
  }),
);

const { organizationRequiresMfa, invalidateOrganizationMfaPolicy } = await import(
  '@/domains/tenancy/sub-domains/organization/organization-settings/organization-mfa-policy.js'
);

const ORGANIZATION_PUBLIC_ID = 'org_aaaaaaaaaaaaaaaaaaaaa';
const KEY = `organization:mfa-required:${ORGANIZATION_PUBLIC_ID}`;

describe('organization MFA policy cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisGet.mockResolvedValue(null);
  });

  it('serves a cached policy without reading Postgres', async () => {
    redisGet.mockResolvedValueOnce('true');
    await expect(organizationRequiresMfa(ORGANIZATION_PUBLIC_ID)).resolves.toBe(true);
    expect(organizationRequiresMfaFromDatabase).not.toHaveBeenCalled();
  });

  it('populates on a miss with SET NX, so it never overwrites an invalidation', async () => {
    organizationRequiresMfaFromDatabase.mockResolvedValueOnce(false);
    await expect(organizationRequiresMfa(ORGANIZATION_PUBLIC_ID)).resolves.toBe(false);
    expect(redisSet).toHaveBeenCalledWith(KEY, 'false', 'EX', 60, 'NX');
  });

  it('invalidates with a tombstone, not a DEL an in-flight read could overwrite', async () => {
    await invalidateOrganizationMfaPolicy(ORGANIZATION_PUBLIC_ID);
    expect(redisDel).not.toHaveBeenCalled();
    expect(redisSet).toHaveBeenCalledWith(KEY, '__invalidated__', 'EX', 15);
  });

  it('reads a tombstone as a miss and asks Postgres (MFA just turned on)', async () => {
    redisGet.mockResolvedValueOnce('__invalidated__');
    organizationRequiresMfaFromDatabase.mockResolvedValueOnce(true);
    await expect(organizationRequiresMfa(ORGANIZATION_PUBLIC_ID)).resolves.toBe(true);
  });

  it('fails closed: a Redis read error falls through to Postgres', async () => {
    redisGet.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    organizationRequiresMfaFromDatabase.mockResolvedValueOnce(true);
    await expect(organizationRequiresMfa(ORGANIZATION_PUBLIC_ID)).resolves.toBe(true);
  });
});
