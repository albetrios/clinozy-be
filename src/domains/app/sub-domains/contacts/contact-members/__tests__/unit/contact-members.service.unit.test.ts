import { describe, expect, it } from 'vitest';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { ValidationError } from '@/shared/errors/index.js';
import { ContactMembersService } from '@/domains/app/sub-domains/contacts/contact-members/contact-members.service.js';

/** A scope no database work ever reads — every case is refused before one opens. */
const SCOPE = {
  organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaaa',
} as unknown as OrganizationPrincipalDatabaseScope;

/**
 * Contact members (routes-final 4.B, ROUTE #129): every write and read the service parses is refused before any database work — the
 * service is built with no repositories, so a case that reached one would fail.
 */
describe('ContactMembersService', () => {
  const service = new ContactMembersService({} as never, {} as never, {} as never, {} as never);

  it('refuses a replace without its member list (400)', async () => {
    await expect(
      service.replace(SCOPE, 'con_aaaaaaaaaaaaaaaaaaaaa', {}, undefined),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a replace with an unknown field (400)', async () => {
    await expect(
      service.replace(
        SCOPE,
        'con_aaaaaaaaaaaaaaaaaaaaa',
        { membership_ids: [], not_a_field: true },
        undefined,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
