import { describe, expect, it } from 'vitest';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { ValidationError } from '@/shared/errors/index.js';
import { MembershipSavedViewsService } from '@/domains/app/sub-domains/memberships/membership-saved-views/membership-saved-views.service.js';

/** A scope no database work ever reads — every case is refused before one opens. */
const SCOPE = {
  organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaaa',
} as unknown as OrganizationPrincipalDatabaseScope;

/**
 * My saved views (routes-final 2.D, ROUTE #127): every write and read the service parses is refused before any database work — the
 * service is built with no repositories, so a case that reached one would fail.
 */
describe('MembershipSavedViewsService', () => {
  const service = new MembershipSavedViewsService({} as never, {} as never);

  it('refuses a list query with an unknown filter (400)', async () => {
    await expect(service.list(SCOPE, { not_a_filter: 'x' }, undefined)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses a create without its list and label (400)', async () => {
    await expect(service.create(SCOPE, {}, undefined)).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a change with an unknown field (400)', async () => {
    await expect(
      service.update(SCOPE, 'sv_aaaaaaaaaaaaaaaaaaaaa', { not_a_field: true }, undefined),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
