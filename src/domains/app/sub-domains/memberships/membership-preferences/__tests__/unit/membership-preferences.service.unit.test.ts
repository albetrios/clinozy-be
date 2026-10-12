import { describe, expect, it } from 'vitest';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { ValidationError } from '@/shared/errors/index.js';
import { MembershipPreferencesService } from '@/domains/app/sub-domains/memberships/membership-preferences/membership-preferences.service.js';

/** A scope no database work ever reads — every case is refused before one opens. */
const SCOPE = {
  organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaaa',
} as unknown as OrganizationPrincipalDatabaseScope;

/**
 * My preferences (routes-final 2.C, ROUTE #127): every write and read the service parses is refused before any database work — the
 * service is built with no repositories, so a case that reached one would fail.
 */
describe('MembershipPreferencesService', () => {
  const service = new MembershipPreferencesService({} as never, {} as never, {} as never);

  it('refuses a change with an unknown field (400)', async () => {
    await expect(
      service.updateMine({
        scope: SCOPE,
        body: { not_a_field: true },
        options: { actingUserPublicId: undefined, allBranches: true },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a theme that is not one (400)', async () => {
    await expect(
      service.updateMine({
        scope: SCOPE,
        body: { theme: 'neon' },
        options: { actingUserPublicId: undefined, allBranches: true },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
