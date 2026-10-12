import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { ContactMessageTemplatesRepository } from './contact-message-templates.repository.js';
import { serializeContactMessageTemplate } from './contact-message-templates.serializer.js';
import type { ContactMessageTemplateOutput } from './contact-message-templates.types.js';
import {
  validateCreateContactMessageTemplate,
  validateListContactMessageTemplatesQuery,
  validateUpdateContactMessageTemplate,
} from './contact-message-templates.validator.js';

/**
 * Contact message templates of the active organization (launch ROUTE #17, rebuilt at #130 —
 * routes-final 4.D): list, read, add, change, soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.contact_message_templates`; every
 *   call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Contact message template')`; `ValidationError` for a bad
 *   body; `ConflictError` for a name another live template has (any case), a stale save, or a
 *   restore over a reused name.
 */
export class ContactMessageTemplatesService extends BaseRecordService<ContactMessageTemplateOutput> {
  constructor(
    organizationService: OrganizationService,
    repository: ContactMessageTemplatesRepository,
  ) {
    super(organizationService, {
      label: 'Contact message template',
      repository,
      parseCreate: validateCreateContactMessageTemplate,
      parseUpdate: validateUpdateContactMessageTemplate,
      parseList: validateListContactMessageTemplatesQuery,
      serialize: serializeContactMessageTemplate,
      conflicts: {
        idx_contact_message_templates_organization_name_unique: 'errors:recordAlreadyExists',
      },
    });
  }
}
