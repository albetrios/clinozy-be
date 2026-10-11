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
  listBodyFieldNames,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import type { OrganizationNotificationPolicyService } from './organization-notification-policy.service.js';

/**
 * Builds the Fastify handler map for `/organization/notification-policies`
 * routes — list, get, create, update, delete. The active organization is
 * resolved from the signed JWT `org` claim; the `policyId` path param is
 * validated via {@link validatePublicIdParam}. Create, update and delete record a scoped audit
 * event in the organization's log.
 *
 * @remarks
 * sec-T5: this handler used to coerce `policyId` to a positive integer
 * (`validatePolicyIdParam`), exposing the row's `bigserial` `id` in URLs
 * and serialised responses — a convention break against the rest of the
 * codebase (which uses 21-char base62 `public_id` strings) and a minor
 * cross-tenant volume oracle via the auto-increment value. The schema
 * already provisions a `public_id` column on
 * `tenancy.organization_notification_policies`, and the unique index
 * `idx_organization_notification_policies_public_id` makes lookups
 * O(1). Switch both inputs and outputs to the public id.
 */
export function createOrganizationNotificationPolicyController(
  service: OrganizationNotificationPolicyService,
) {
  return {
    listPolicies: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const data = await service.list(scope);
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    getPolicy: async (request: FastifyRequest, _reply: FastifyReply) => {
      const { notification_policy_id: policyId } = (request.params as {
        notification_policy_id: string;
      }) ?? { notification_policy_id: '' };
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const data = await service.getByPublicId({
        scope,
        policy_public_id: validatePublicIdParam({
          value: policyId,
          fieldName: 'notification_policy_id',
        }),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    createPolicy: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const data = await service.create({
        scope,
        body: request.body,
        created_by_user_public_id: getActingUserPublicId(auth),
      });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.notification_policy.create',
          resource_type: 'notification_policy',
          organizationPublicId: scope.organizationPublicId,
          metadata: { notification_policy_public_id: data.id },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    updatePolicy: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const { notification_policy_id: policyId } = (request.params as {
        notification_policy_id: string;
      }) ?? { notification_policy_id: '' };
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const notificationPolicyId = validatePublicIdParam({
        value: policyId,
        fieldName: 'notification_policy_id',
      });
      const data = await service.update({
        scope,
        policy_public_id: notificationPolicyId,
        body: request.body,
        updated_by_user_public_id: getActingUserPublicId(auth),
      });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.notification_policy.update',
          resource_type: 'notification_policy',
          organizationPublicId: scope.organizationPublicId,
          metadata: {
            notification_policy_public_id: notificationPolicyId,
            changed_fields: listBodyFieldNames(request.body),
          },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    deletePolicy: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const { notification_policy_id: policyId } = (request.params as {
        notification_policy_id: string;
      }) ?? { notification_policy_id: '' };
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const notificationPolicyId = validatePublicIdParam({
        value: policyId,
        fieldName: 'notification_policy_id',
      });
      await service.delete({ scope, policy_public_id: notificationPolicyId });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.notification_policy.delete',
          resource_type: 'notification_policy',
          organizationPublicId: scope.organizationPublicId,
          metadata: { notification_policy_public_id: notificationPolicyId },
        },
      });
      return reply.code(204).send();
    },
  };
}
