import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { ValidationError } from '@/shared/errors/index.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { medical_contacts } from '@/domains/app/sub-domains/medical-contacts/medical-contacts.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { message_templates } from '@/domains/app/sub-domains/message-templates/message-templates.schema.js';
import { messages } from './messages.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { tasks } from '@/domains/app/sub-domains/tasks/tasks.schema.js';
import type { MessagesRepository } from './messages.repository.js';
import { serializeMessage } from './messages.serializer.js';
import type { MessageOutput } from './messages.types.js';
import { messagesRules } from './messages.rules.js';
import {
  validateCreateMessage,
  validateListMessagesQuery,
  validateUpdateMessage,
} from './messages.validator.js';

/**
 * Messages of the active organization (launch ROUTE #15): list, read, create, update,
 * soft-delete with a reason and restore, and the lifecycle actions `resend`.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Message')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class MessagesService extends BaseRecordService<MessageOutput> {
  constructor(organizationService: OrganizationService, repository: MessagesRepository) {
    super(organizationService, {
      label: 'Message',
      repository,
      parseCreate: validateCreateMessage,
      parseUpdate: validateUpdateMessage,
      parseList: validateListMessagesQuery,
      serialize: serializeMessage,
      references: [
        { field: 'lead_id', table: leads, label: 'lead' },
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'medical_contact_id', table: medical_contacts, label: 'medical contact' },
        { field: 'message_template_id', table: message_templates, label: 'message template' },
        { field: 'reply_to_message_id', table: messages, label: 'message' },
        { field: 'author_membership_id', table: memberships, label: 'team member' },
        { field: 'task_id', table: tasks, label: 'task' },
      ],
      checkValues: (values) => {
        if (
          (values.lead_id === undefined || values.lead_id === null ? 0 : 1) +
            (values.patient_id === undefined || values.patient_id === null ? 0 : 1) +
            (values.medical_contact_id === undefined || values.medical_contact_id === null
              ? 0
              : 1) !==
          1
        ) {
          throw new ValidationError(
            'errors:validation.recordFieldRule',
            { field: 'lead_id' },
            {
              lead_id: ['Name exactly one of lead_id, patient_id or medical_contact_id'],
            },
          );
        }
      },
      transitions: {
        resend: {
          statusColumn: 'delivery_status',
          from: ['failed'],
          set: { delivery_status: 'queued' },
        },
      },
      ...messagesRules,
    });
  }
}
