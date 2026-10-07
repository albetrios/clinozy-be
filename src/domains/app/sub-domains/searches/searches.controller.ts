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
import type { SearchesService } from './searches.service.js';

/** HTTP handlers for `GET /app/searches` — the command search. */
export function createSearchesController(service: SearchesService) {
  return {
    search: async (request: FastifyRequest, _reply: FastifyReply) => {
      const can = (code: string) => hasOrganizationPermission(request, code);
      const data = await service.search(requireOrganizationScope(request), request.query, {
        actingUserPublicId: getActingUserPublicId(requirePrincipal(request)),
        visibility: { allBranches: await can(APP_PERMISSIONS.BRANCH_READ) },
        patients: await can(APP_PERMISSIONS.PATIENT_READ),
        leads: await can(APP_PERMISSIONS.LEAD_READ),
        appointments: await can(APP_PERMISSIONS.APPOINTMENT_READ),
        invoices: await can(APP_PERMISSIONS.INVOICE_READ),
      });
      return successResponse(data, getRequestIdentifier(request));
    },
  };
}
