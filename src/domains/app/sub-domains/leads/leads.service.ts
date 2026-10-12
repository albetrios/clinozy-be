import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { withAppDatabaseContext } from '@/infrastructure/database/contexts/database-context.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import type { ContactsService } from '@/domains/app/sub-domains/contacts/contacts.service.js';
import { memberReference } from '@/domains/app/app-member-reference.js';
import { LEAD_INVOLVED_MEMBERSHIPS_LINK, type LeadsRepository } from './leads.repository.js';
import { createLeadsRules } from './leads.rules.js';
import { serializeLead } from './leads.serializer.js';
import type { LeadOutput } from './leads.types.js';
import {
  validateCreateLead,
  validateListLeadsQuery,
  validateUpdateLead,
} from './leads.validator.js';

/**
 * Leads of the active organization (launch ROUTE #131, routes-final 5): one enquiry and its working
 * state for a contact — list and export, read, add (for a contact, or with a new one), change,
 * soft-delete with a reason, restore, claim and release.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references,
 *   rules and serializer; every call runs in the caller's organization context. A create with an
 *   inline `contact` writes the contact through the {@link ContactsService} (its rules — numbers,
 *   household) and the lead in the same transaction (L1); `involved_membership_ids` is the
 *   `app.lead_involved_memberships` link (L2). Branch-scoped on `branch_id` (no branch = every
 *   branch, D9).
 * - **Failure modes:** `NotFoundError('Lead')`; `ValidationError` for a bad body or query, or a
 *   reference that is no live record here; `ConflictError` `lead_open_exists` (L6),
 *   `contact_phone_exists` (an inline contact's number, CT3), `lead_closed`, `lead_held`, a stale
 *   save or a restore of a live lead; `ForbiddenError` `not_a_member`, `lead_not_yours`.
 */
export class LeadsService extends BaseRecordService<LeadOutput> {
  constructor(
    organizationService: OrganizationService,
    repository: LeadsRepository,
    private readonly contactsService: ContactsService,
  ) {
    super(organizationService, {
      label: 'Lead',
      repository,
      parseCreate: validateCreateLead,
      parseUpdate: validateUpdateLead,
      parseList: validateListLeadsQuery,
      serialize: serializeLead,
      references: [
        { field: 'contact_id', table: contacts, label: 'contact' },
        memberReference('owner_membership_id'),
        { field: 'branch_id', table: branches, label: 'branch' },
      ],
      referenceLists: [
        {
          field: 'involved_membership_ids',
          link: LEAD_INVOLVED_MEMBERSHIPS_LINK,
          label: 'team member',
        },
      ],
      branchColumn: 'branch_id',
      conflicts: {
        idx_leads_organization_contact_open_unique: {
          key: 'errors:leadOpenExistsGeneric',
          reason: 'lead_open_exists',
        },
      },
      ...createLeadsRules(repository),
    });
  }

  /**
   * Adds a lead — for `contact_id`, or with a new `contact` created first in the same transaction
   * (L1); the controller lets only `contact:create` holders send `contact`.
   */
  override async create({
    scope,
    body,
    actingUserPublicId,
    parentPublicId,
    visibility,
    createName,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    body: unknown;
    actingUserPublicId: string | undefined;
    parentPublicId?: string | undefined;
    visibility?: BaseRecordVisibility | undefined;
    createName?: string | undefined;
  }): Promise<LeadOutput> {
    if (validateCreateLead(body).contact === undefined) {
      return super.create({
        scope,
        body,
        actingUserPublicId,
        parentPublicId,
        visibility,
        createName,
      });
    }
    const { contact, ...lead } = body as Record<string, unknown>;
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const created = await this.contactsService.create({
          scope,
          body: contact,
          actingUserPublicId,
          parentPublicId: undefined,
          visibility,
        });
        return super.create({
          scope,
          body: { ...lead, contact_id: created.id },
          actingUserPublicId,
          parentPublicId,
          visibility,
          createName,
        });
      },
    });
  }
}
