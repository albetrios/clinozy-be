import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { CONTACT_MEMBERS_LINK } from './contact-members/contact-members.repository.js';
import { CONTACT_PHONES_CHILD, type ContactsRepository } from './contacts.repository.js';
import { assertContactValues, createContactsRules } from './contacts.rules.js';
import { contacts } from './contacts.schema.js';
import { serializeContact } from './contacts.serializer.js';
import type { ContactOutput } from './contacts.types.js';
import {
  validateCreateContact,
  validateListContactsQuery,
  validateUpdateContact,
} from './contacts.validator.js';

/**
 * Contacts of the active organization (launch ROUTE #129 — routes-final 4.A): one person shared by
 * their leads, activity, patient file and appointments — list and find, read, add, change
 * ("applies everywhere"), soft-delete with a reason, restore, and the hover card.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references,
 *   rules and serializer; every call runs in the caller's organization context. `phones` is the
 *   `app.contact_phones` child list (a sent set replaces the whole set); `member_membership_ids`
 *   reads the `app.contact_members` link, written by `PUT /contacts/{contact_id}/members` (4.B).
 *   Not branch-scoped (CT6).
 * - **Failure modes:** `NotFoundError('Contact')`; `ValidationError` for a bad body or query, a
 *   household or referrer that is no live contact here, a future birth date or a referrer without
 *   `referral_source = patient` (CT13); `ConflictError` for a number on another household
 *   (`contact_phone_exists`, CT3), a stale save or a restore of a live contact.
 */
export class ContactsService extends BaseRecordService<ContactOutput> {
  constructor(organizationService: OrganizationService, repository: ContactsRepository) {
    super(organizationService, {
      label: 'Contact',
      repository,
      parseCreate: validateCreateContact,
      parseUpdate: validateUpdateContact,
      parseList: validateListContactsQuery,
      serialize: serializeContact,
      references: [
        { field: 'household_contact_id', table: contacts, label: 'contact' },
        { field: 'referred_by_contact_id', table: contacts, label: 'contact' },
      ],
      referenceLists: [
        { field: 'member_membership_ids', link: CONTACT_MEMBERS_LINK, label: 'team member' },
      ],
      childLists: [{ ...CONTACT_PHONES_CHILD, field: 'phones' }],
      conflicts: {
        excl_contact_phones_phone_household: {
          key: 'errors:contactPhoneInAnotherHousehold',
          reason: 'contact_phone_exists',
        },
      },
      checkValues: assertContactValues,
      ...createContactsRules(repository),
    });
  }
}
