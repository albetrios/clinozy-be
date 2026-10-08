import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { NotFoundError } from '@/shared/errors/index.js';
import { replaceLinkedIds } from '@/domains/app/base-record.repository.js';
import { resolveMembershipIds } from '@/domains/app/sub-domains/memberships/memberships.rules.js';
import type { ContactsRepository } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import {
  CONTACT_MEMBERS_LINK,
  type ContactMembersRepository,
} from './contact-members.repository.js';
import { serializeContactMembers } from './contact-members.serializer.js';
import type { ContactMemberOutput } from './contact-members.types.js';
import { validateReplaceContactMembers } from './contact-members.validator.js';

/**
 * Who handles a person (launch ROUTE #129 — routes-final 4.B, CT11): the team members on a
 * contact, read and replaced by the desk; the contact lists them as `member_membership_ids`.
 *
 * @remarks
 * - **Algorithm:** inside the caller's `withAppDatabaseContext`, resolve the organization and the
 *   live contact (404 otherwise); a replace resolves every `mem_` id to a live membership and makes
 *   that set the contact's exact list (kept rows keep their `created_at`).
 * - **Failure modes:** `NotFoundError('Contact')`; `ValidationError` for a bad body or an id that
 *   is no live member of this organization (`membership_ids`).
 * - **Side effects:** a replace deletes and inserts `app.contact_members` rows.
 * - **Notes:** the automatic adds — a lead's owner and involved members, a patient's usual doctor,
 *   an appointment's doctor and therapist — come with those rows (#131–#133); a member's rows go
 *   when they leave (K4, the app leave step).
 */
export class ContactMembersService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly membershipService: MembershipService,
    private readonly contactsRepository: ContactsRepository,
    private readonly contactMembersRepository: ContactMembersRepository,
  ) {}

  /** The team members handling a live contact, oldest first. */
  async list(
    scope: OrganizationPrincipalDatabaseScope,
    contactPublicId: string,
  ): Promise<ContactMemberOutput[]> {
    return withAppDatabaseContext(scope, async () => {
      const ids = await this.requireContactId(scope, contactPublicId);
      return serializeContactMembers(
        await this.contactMembersRepository.listForContact(ids.contact),
      );
    });
  }

  /** Makes `membership_ids` the exact list of who handles a live contact. */
  async replace(
    scope: OrganizationPrincipalDatabaseScope,
    contactPublicId: string,
    body: unknown,
    actingUserPublicId: string | undefined,
  ): Promise<ContactMemberOutput[]> {
    const parsed = validateReplaceContactMembers(body);
    return withAppDatabaseContext(scope, async () => {
      const ids = await this.requireContactId(scope, contactPublicId);
      const resolved = await resolveMembershipIds({
        membershipService: this.membershipService,
        organizationId: ids.organization,
        membershipPublicIds: parsed.membership_ids,
      });
      await replaceLinkedIds({
        link: CONTACT_MEMBERS_LINK,
        ownerId: ids.contact,
        organizationId: ids.organization,
        targetIds: parsed.membership_ids.map((publicId) => resolved.get(publicId)!),
        createdByUserId:
          await this.organizationService.resolveUserInternalIdByPublicId(actingUserPublicId),
      });
      return serializeContactMembers(
        await this.contactMembersRepository.listForContact(ids.contact),
      );
    });
  }

  /** The organization's and the live contact's internal ids; 404 when the contact is not here. */
  private async requireContactId(
    scope: OrganizationPrincipalDatabaseScope,
    contactPublicId: string,
  ): Promise<{ organization: number; contact: number }> {
    const organization = await this.organizationService.requireOrganizationByPublicId(
      scope.organizationPublicId,
    );
    const contact = await this.contactsRepository.findByPublicId(contactPublicId, organization.id);
    if (!contact) throw new NotFoundError('Contact');
    return { organization: organization.id, contact: contact.id };
  }
}
