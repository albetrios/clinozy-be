import type { FastifyReply, FastifyRequest } from 'fastify';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { hasOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import type { ContactsService } from './contacts.service.js';
import type { ContactAccess } from './contacts.types.js';

/** What the caller may read, from their permissions. */
async function readAccess(request: FastifyRequest): Promise<ContactAccess> {
  const can = (code: string) => hasOrganizationPermission(request, code);
  return {
    actingUserPublicId: getActingUserPublicId(requirePrincipal(request)),
    visibility: { allBranches: await can(APP_PERMISSIONS.BRANCH_READ) },
    patients: await can(APP_PERMISSIONS.PATIENT_READ),
    leads: await can(APP_PERMISSIONS.LEAD_READ),
    medicalContacts: await can(APP_PERMISSIONS.MEDICAL_SALE_READ),
    appointments: await can(APP_PERMISSIONS.APPOINTMENT_READ),
  };
}

/** HTTP handlers for `/app/contacts` — the people search and the hover preview. */
export function createContactsController(service: ContactsService) {
  return {
    list: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.list(
        requireOrganizationScope(request),
        request.query,
        await readAccess(request),
      );
      return successResponse(data, getRequestIdentifier(request));
    },
    preview: async (request: FastifyRequest, _reply: FastifyReply) => {
      const contactId = validatePublicIdParam(
        (request.params as { contact_id?: string }).contact_id ?? '',
        'contact_id',
      );
      const data = await service.preview(
        requireOrganizationScope(request),
        contactId,
        await readAccess(request),
      );
      return successResponse(data, getRequestIdentifier(request));
    },
  };
}
