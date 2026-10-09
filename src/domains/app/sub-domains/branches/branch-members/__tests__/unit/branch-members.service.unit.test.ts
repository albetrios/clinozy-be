import { describe, expect, it } from 'vitest';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { ValidationError } from '@/shared/errors/index.js';
import { BranchMembersService } from '@/domains/app/sub-domains/branches/branch-members/branch-members.service.js';

/** A scope no database work ever reads — every case is refused before one opens. */
const SCOPE = {
  organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaaa',
} as unknown as OrganizationPrincipalDatabaseScope;

/**
 * Branch members (routes-final §1.B, ROUTE #125): every write and read the service parses is refused before any database work — the
 * service is built with no repositories, so a case that reached one would fail.
 */
describe('BranchMembersService', () => {
  const service = new BranchMembersService({} as never, {} as never, {} as never, {} as never);

  it('refuses a replace without its member list (400)', async () => {
    await expect(
      service.replace(SCOPE, 'br_aaaaaaaaaaaaaaaaaaaaa', {}, undefined),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a list that names a member twice (400)', async () => {
    await expect(
      service.replace(
        SCOPE,
        'br_aaaaaaaaaaaaaaaaaaaaa',
        { membership_ids: ['mbr_aaaaaaaaaaaaaaaaaaaaa', 'mbr_aaaaaaaaaaaaaaaaaaaaa'] },
        undefined,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
