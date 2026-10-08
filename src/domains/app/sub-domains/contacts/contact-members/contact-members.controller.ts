import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import {
  buildAuditActorFields,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import type { ContactMembersService } from './contact-members.service.js';

type ContactParams = { Params: { contact_id: string } };

/** HTTP handlers for `/app/contacts/{contact_id}/members`. */
export function createContactMembersController(service: ContactMembersService) {
  return {
    listContactMembers: async (request: FastifyRequest<ContactParams>, _reply: FastifyReply) => {
      const data = await service.list(
        requireOrganizationScope(request),
        validatePublicIdParam(request.params.contact_id, 'contact_id'),
      );
      return successResponse(data, getRequestIdentifier(request));
    },
    replaceContactMembers: async (request: FastifyRequest<ContactParams>, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const contactId = validatePublicIdParam(request.params.contact_id, 'contact_id');
      const data = await service.replace(
        scope,
        contactId,
        request.body,
        getActingUserPublicId(auth),
      );
      await recordScopedAuditEvent(request, {
        ...buildAuditActorFields(auth),
        action: 'app.contact.members.replace',
        resource_type: 'contact',
        organizationPublicId: scope.organizationPublicId,
        metadata: { contact_public_id: contactId, membership_count: data.length },
      });
      return successResponse(data, getRequestIdentifier(request));
    },
  };
}
