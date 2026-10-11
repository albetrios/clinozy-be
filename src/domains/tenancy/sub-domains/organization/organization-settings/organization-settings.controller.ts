import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import {
  buildAuditActorFields,
  listBodyFieldNames,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import type { OrganizationSettingsService } from './organization-settings.service.js';

/**
 * Builds the Fastify handler map for `/organization/settings` —
 * exposes a `getSettings` reader and a `updateSettings` writer that
 * upserts the row through {@link OrganizationSettingsService} and records the change in the
 * organization's audit log.
 */
export function createOrganizationSettingsController(service: OrganizationSettingsService) {
  return {
    getSettings: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireOrganizationScope(request);
      const data = await service.get(scope);
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    updateSettings: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const data = await service.update({ scope, body: request.body });
      const changedFields = listBodyFieldNames(request.body);
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.organization_settings.update',
          resource_type: 'organization_settings',
          organizationPublicId: scope.organizationPublicId,
          // The security policy decides who may use the organization (its MFA requirement among others).
          severity: changedFields.includes('security_policy') ? 'WARNING' : 'INFO',
          metadata: { changed_fields: changedFields },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
  };
}
