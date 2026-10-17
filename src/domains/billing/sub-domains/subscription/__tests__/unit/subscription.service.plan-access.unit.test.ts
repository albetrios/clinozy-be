import { afterEach, describe, expect, it, vi } from 'vitest';

// The service opens the organization context around its one read; a unit test has no database, so
// the wrapper runs the callback inline (as the other subscription service suites mock it).
vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    withAppDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
  };
});

import { env } from '@/shared/config/env.config.js';
import { ForbiddenError } from '@/shared/errors/index.js';
import { SubscriptionService } from '@/domains/billing/sub-domains/subscription/subscription.service.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { PlanService } from '@/domains/billing/sub-domains/plan/plan.service.js';
import type { PaymentProvider } from '@/domains/billing/sub-domains/subscription/payment-provider.port.js';
import type { SubscriptionRepository } from '@/domains/billing/sub-domains/subscription/subscription.repository.js';
import type { PlanAccessSubject } from '@/domains/billing/sub-domains/subscription/subscription.types.js';

const DAY = 24 * 60 * 60 * 1000;

function serviceReading(subject: PlanAccessSubject | null) {
  const repository = { findPlanAccessSubject: vi.fn().mockResolvedValue(subject) };
  const service = new SubscriptionService(
    {} as OrganizationService,
    {} as PlanService,
    repository as unknown as SubscriptionRepository,
    {} as PaymentProvider,
  );
  return { service, repository };
}

/** A TEAM clinic created `days` ago with no subscription. */
const unpaidClinic = (days: number): PlanAccessSubject => ({
  organization: { type: 'TEAM', created_at: new Date(Date.now() - days * DAY) },
  subscription: null,
});

describe('SubscriptionService plan access (owner decision D3)', () => {
  const originalEnforced = env.BILLING_READ_ONLY_ENFORCED;
  afterEach(() => {
    env.BILLING_READ_ONLY_ENFORCED = originalEnforced;
  });

  it('with BILLING_READ_ONLY_ENFORCED off, every clinic is active and nothing is read', async () => {
    env.BILLING_READ_ONLY_ENFORCED = false;
    const { service, repository } = serviceReading(unpaidClinic(400));

    await expect(service.getPlanAccess({ organizationPublicId: 'org_old' })).resolves.toEqual({
      state: 'active',
      graceEndsAt: null,
    });
    await expect(
      service.assertOrganizationWritable({ organizationPublicId: 'org_old' }),
    ).resolves.toBeUndefined();
    expect(repository.findPlanAccessSubject).not.toHaveBeenCalled();
  });

  it('with it on, reads the organization once and decides from it', async () => {
    env.BILLING_READ_ONLY_ENFORCED = true;
    const { service, repository } = serviceReading(unpaidClinic(3));

    const access = await service.getPlanAccess({ organizationPublicId: 'org_new' });

    expect(repository.findPlanAccessSubject).toHaveBeenCalledExactlyOnceWith('org_new');
    expect(access.state).toBe('grace');
    expect(access.graceEndsAt).toBeInstanceOf(Date);
  });

  it('refuses a write from a read-only clinic with 403 organization_read_only', async () => {
    env.BILLING_READ_ONLY_ENFORCED = true;
    const { service } = serviceReading(unpaidClinic(40));

    const refusal = await service
      .assertOrganizationWritable({ organizationPublicId: 'org_old' })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ForbiddenError);
    expect(refusal).toMatchObject({
      statusCode: 403,
      messageKey: 'errors:organizationReadOnly',
      reason: 'organization_read_only',
    });
  });

  it('lets a clinic in its grace write', async () => {
    env.BILLING_READ_ONLY_ENFORCED = true;
    const { service } = serviceReading(unpaidClinic(3));

    await expect(
      service.assertOrganizationWritable({ organizationPublicId: 'org_new' }),
    ).resolves.toBeUndefined();
  });
});
