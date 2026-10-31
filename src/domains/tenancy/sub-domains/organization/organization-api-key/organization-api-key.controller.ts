import type { FastifyReply, FastifyRequest } from 'fastify';
import { paginatedResponse, successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  isApiKeyPrincipal,
  requireAuth,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import {
  buildAuditActorFields,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import type {
  OrganizationApiKeyActionOptions,
  OrganizationApiKeyService,
} from './organization-api-key.service.js';
import type { AuthContext } from '@/shared/types/index.js';

/**
 * The `api_key_id` path param, validated at the boundary (sec-re-18, sec-B10 class) so an
 * attacker-supplied string never flows into Sentry breadcrumbs, log payloads, or metric labels
 * with unbounded cardinality.
 */
function readApiKeyIdParam(request: FastifyRequest): string {
  const rawParams = (request.params as { api_key_id?: string }) ?? {};
  return validatePublicIdParam({ value: rawParams.api_key_id ?? '', fieldName: 'api_key_id' });
}

/** An API key's scopes stand in for its held permissions in the key-creator role ordering. */
function apiKeyActionOptions(auth: AuthContext): OrganizationApiKeyActionOptions {
  return isApiKeyPrincipal(auth) ? { callerApiKeyScopes: auth.apiKeyScopes } : {};
}

/**
 * Builds the Fastify handler map for `/organization/api-keys` routes —
 * list, get, create (returns the raw key once), update, delete, and rotate.
 * Wraps service calls with principal validation, public-id validation, and the
 * standard response shapers. Create/rotate require a real user principal
 * because they mint new secrets and perform scope-grant checks.
 */
export function createOrganizationApiKeyController(service: OrganizationApiKeyService) {
  return {
    listApiKeys: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireOrganizationScope(request);
      const result = await service.list({ scope, query: request.query });
      return paginatedResponse({
        data: result.items,
        request_id: getRequestIdentifier(request),
        pagination: {
          per_page: result.limit,
          next: result.next_cursor,
          has_more: result.has_more,
          ...(result.total !== null ? { estimated_total: result.total } : {}),
        },
      });
    },
    getApiKey: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireOrganizationScope(request);
      const apiKeyId = readApiKeyIdParam(request);
      const data = await service.getByPublicId({ scope, api_key_public_id: apiKeyId });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    createApiKey: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const scope = requireOrganizationScope(request);
      const result = await service.create({
        scope,
        body: request.body,
        created_by_user_public_id: auth.userId,
      });
      // Long-lived organization bearer credentials: audit minting at WARNING so creation is never silent.
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: auth.userId,
          action: 'organization.api_key.create',
          resource_type: 'organization_api_key',
          organizationPublicId: scope.organizationPublicId,
          severity: 'WARNING',
          metadata: { api_key_id: result.api_key.id },
        },
      });
      return successResponse({
        data: { api_key: result.api_key, raw_key: result.raw_key },
        request_id: getRequestIdentifier(request),
      });
    },
    updateApiKey: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const apiKeyId = readApiKeyIdParam(request);
      const data = await service.update({
        scope,
        api_key_public_id: apiKeyId,
        body: request.body,
        updated_by_user_public_id: getActingUserPublicId(auth),
        options: apiKeyActionOptions(auth),
      });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'organization.api_key.update',
          resource_type: 'organization_api_key',
          organizationPublicId: scope.organizationPublicId,
          metadata: { api_key_id: apiKeyId },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    deleteApiKey: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const apiKeyId = readApiKeyIdParam(request);
      await service.delete({
        scope,
        api_key_public_id: apiKeyId,
        options: apiKeyActionOptions(auth),
      });
      // Revoking a long-lived organization credential is a security-relevant change; audit at WARNING.
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'organization.api_key.revoke',
          resource_type: 'organization_api_key',
          organizationPublicId: scope.organizationPublicId,
          severity: 'WARNING',
          metadata: { api_key_id: apiKeyId },
        },
      });
      return reply.code(204).send();
    },
    rotateApiKey: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const scope = requireOrganizationScope(request);
      const apiKeyId = readApiKeyIdParam(request);
      const result = await service.rotate({
        scope,
        api_key_public_id: apiKeyId,
        created_by_user_public_id: auth.userId,
      });
      // Rotation mints a new secret and invalidates the old one — audit at WARNING.
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: auth.userId,
          action: 'organization.api_key.rotate',
          resource_type: 'organization_api_key',
          organizationPublicId: scope.organizationPublicId,
          severity: 'WARNING',
          metadata: { api_key_id: apiKeyId },
        },
      });
      return successResponse({
        data: { api_key: result.api_key, raw_key: result.raw_key },
        request_id: getRequestIdentifier(request),
      });
    },
  };
}
