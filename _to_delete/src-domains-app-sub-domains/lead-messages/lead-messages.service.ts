import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { tasks } from '@/domains/app/sub-domains/tasks/tasks.schema.js';
import type { LeadMessagesRepository } from './lead-messages.repository.js';
import { serializeLeadMessage } from './lead-messages.serializer.js';
import type { LeadMessageOutput } from './lead-messages.types.js';
import { leadMessagesRules } from './lead-messages.rules.js';
import {
  validateCreateLeadMessage,
  validateListLeadMessagesQuery,
  validateUpdateLeadMessage,
} from './lead-messages.validator.js';

/**
 * Lead messages of the active organization (launch ROUTE #15): list, read, create, update,
 * soft-delete with a reason and restore, and the lifecycle actions `resend`.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Lead message')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class LeadMessagesService extends BaseRecordService<LeadMessageOutput> {
  constructor(organizationService: OrganizationService, repository: LeadMessagesRepository) {
    super(organizationService, {
      label: 'Lead message',
      repository,
      parseCreate: validateCreateLeadMessage,
      parseUpdate: validateUpdateLeadMessage,
      parseList: validateListLeadMessagesQuery,
      serialize: serializeLeadMessage,
      references: [
        { field: 'lead_id', table: leads, label: 'lead' },
        { field: 'author_membership_id', table: memberships, label: 'team member' },
        { field: 'task_id', table: tasks, label: 'task' },
      ],
      parent: { field: 'lead_id', table: leads, label: 'Lead' },
      transitions: {
        resend: {
          statusColumn: 'delivery_status',
          from: ['failed'],
          set: { delivery_status: 'queued' },
        },
      },
      ...leadMessagesRules,
    });
  }
}
