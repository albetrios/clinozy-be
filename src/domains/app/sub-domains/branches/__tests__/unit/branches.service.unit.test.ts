import { describe, expect, it } from 'vitest';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { ValidationError } from '@/shared/errors/index.js';
import { BranchesService } from '@/domains/app/sub-domains/branches/branches.service.js';

/** A scope no database work ever reads — every case is refused before one opens. */
const SCOPE = {
  organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaaa',
} as unknown as OrganizationPrincipalDatabaseScope;

/**
 * Branches (routes-final §1, ROUTE #125): every write and read the service parses is refused before any database work — the
 * service is built with no repositories, so a case that reached one would fail.
 */
describe('BranchesService', () => {
  const service = new BranchesService({} as never, {} as never, {} as never, {} as never);

  it('refuses a create body with an unknown field (400)', async () => {
    await expect(
      service.create({
        scope: SCOPE,
        body: { name: 'Vesu', not_a_field: true },
        actingUserPublicId: undefined,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a create body without its name (400)', async () => {
    await expect(
      service.create({ scope: SCOPE, body: {}, actingUserPublicId: undefined }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a change with an unknown field (400)', async () => {
    await expect(
      service.update({
        scope: SCOPE,
        branchPublicId: 'br_aaaaaaaaaaaaaaaaaaaaa',
        body: { not_a_field: true },
        actingUserPublicId: undefined,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
