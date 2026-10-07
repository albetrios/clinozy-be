import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { LEAD_INVOLVED_MEMBERSHIPS_LINK, type LeadsRepository } from './leads.repository.js';
import { serializeLead } from './leads.serializer.js';
import type { LeadOutput } from './leads.types.js';
import { leadsRules } from './leads.rules.js';
import {
  validateCreateLead,
  validateListLeadsQuery,
  validateUpdateLead,
} from './leads.validator.js';

/**
 * Leads of the active organization (launch ROUTE #14): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Lead')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class LeadsService extends BaseRecordService<LeadOutput> {
  constructor(organizationService: OrganizationService, repository: LeadsRepository) {
    super(organizationService, {
      label: 'Lead',
      repository,
      parseCreate: validateCreateLead,
      parseUpdate: validateUpdateLead,
      parseList: validateListLeadsQuery,
      serialize: serializeLead,
      references: [
        { field: 'owner_membership_id', table: memberships, label: 'team member' },
        { field: 'branch_id', table: branches, label: 'branch' },
        { field: 'patient_id', table: patients, label: 'patient' },
      ],
      referenceLists: [
        {
          field: 'involved_membership_ids',
          link: LEAD_INVOLVED_MEMBERSHIPS_LINK,
          label: 'team member',
        },
      ],
      branchColumn: 'branch_id',
      ...leadsRules,
    });
  }
}
