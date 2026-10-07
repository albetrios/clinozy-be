import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { MessageTemplatesRepository } from './message-templates.repository.js';
import { serializeMessageTemplate } from './message-templates.serializer.js';
import type { MessageTemplateOutput } from './message-templates.types.js';
import {
  validateCreateMessageTemplate,
  validateListMessageTemplatesQuery,
  validateUpdateMessageTemplate,
} from './message-templates.validator.js';

/**
 * Message templates of the active organization (launch ROUTE #17): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Message template')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class MessageTemplatesService extends BaseRecordService<MessageTemplateOutput> {
  constructor(organizationService: OrganizationService, repository: MessageTemplatesRepository) {
    super(organizationService, {
      label: 'Message template',
      repository,
      parseCreate: validateCreateMessageTemplate,
      parseUpdate: validateUpdateMessageTemplate,
      parseList: validateListMessageTemplatesQuery,
      serialize: serializeMessageTemplate,
      conflicts: {
        idx_message_templates_organization_name_unique: 'errors:recordAlreadyExists',
      },
    });
  }
}
