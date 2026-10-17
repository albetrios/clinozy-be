import { describe, expect, it } from 'vitest';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { ValidationError } from '@/shared/errors/index.js';
import { OnboardingSetupService } from '@/domains/app/sub-domains/onboarding-setup/onboarding-setup.service.js';

/** A scope no database work ever reads — every case is refused before one opens. */
const SCOPE = {
  organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaaa',
} as unknown as OrganizationPrincipalDatabaseScope;

/**
 * Clinic setup (feat-clinic-setup, routes-final §2): every change the service parses is refused
 * before any database work — the service is built with no collaborators, so a case that reached
 * one would fail.
 */
describe('OnboardingSetupService', () => {
  const service = new OnboardingSetupService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('refuses a change with an unknown field (400)', async () => {
    await expect(
      service.change({
        scope: SCOPE,
        body: { guide_hidden: true, not_a_field: true },
        actingUserPublicId: undefined,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses an empty change (400)', async () => {
    await expect(
      service.change({ scope: SCOPE, body: {}, actingUserPublicId: undefined }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses skipping the first appointment, which cannot be skipped (400)', async () => {
    await expect(
      service.change({
        scope: SCOPE,
        body: { skipped_items_add: ['first_appointment'] },
        actingUserPublicId: undefined,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses skipping and un-skipping the same item in one change (400)', async () => {
    await expect(
      service.change({
        scope: SCOPE,
        body: { skipped_items_add: ['treatments'], skipped_items_remove: ['treatments'] },
        actingUserPublicId: undefined,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses deferring with false — only "Explore first" (true) is a deferral (400)', async () => {
    await expect(
      service.change({ scope: SCOPE, body: { deferred: false }, actingUserPublicId: undefined }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
