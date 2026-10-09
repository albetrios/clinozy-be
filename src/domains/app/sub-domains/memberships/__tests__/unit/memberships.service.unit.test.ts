import { describe, expect, it } from 'vitest';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { ValidationError } from '@/shared/errors/index.js';
import { AppMembershipsService } from '@/domains/app/sub-domains/memberships/memberships.service.js';

/** A scope no database work ever reads — every case is refused before one opens. */
const SCOPE = {
  organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaaa',
} as unknown as OrganizationPrincipalDatabaseScope;

/**
 * The app's team list (routes-final §2, ROUTE #126): every write and read the service parses is refused before any database work — the
 * service is built with no repositories, so a case that reached one would fail.
 */
describe('AppMembershipsService', () => {
  const service = new AppMembershipsService({} as never);

  it('refuses a list query with an unknown filter (400)', async () => {
    await expect(service.list(SCOPE, { not_a_filter: 'x' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses a list limit out of range (400)', async () => {
    await expect(service.list(SCOPE, { limit: '0' })).rejects.toBeInstanceOf(ValidationError);
  });
});
