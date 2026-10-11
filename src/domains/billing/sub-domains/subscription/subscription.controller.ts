import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthContext } from '@/shared/types/index.js';
import { paginatedResponse, successResponse } from '@/shared/utils/http/response.util.js';
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
import type { SubscriptionService } from './subscription.service.js';
import { SubscriptionSerializer } from './subscription.serializer.js';

function readIdempotencyKey(request: FastifyRequest): string | undefined {
  return typeof request.headers['x-idempotency-key'] === 'string'
    ? request.headers['x-idempotency-key']
    : undefined;
}

/** Records a subscription change in the organization's audit log, naming the subscription and its plan. */
async function recordSubscriptionAuditEvent(options: {
  request: FastifyRequest;
  auth: AuthContext;
  organizationPublicId: string;
  action: string;
  subscription: { id: string; plan_id: string | null };
}): Promise<void> {
  await recordScopedAuditEvent({
    request: options.request,
    input: {
      ...buildAuditActorFields(options.auth),
      action: options.action,
      resource_type: 'subscription',
      organizationPublicId: options.organizationPublicId,
      metadata: {
        subscription_public_id: options.subscription.id,
        plan_public_id: options.subscription.plan_id,
      },
    },
  });
}

/**
 * Builds organization-scoped subscription handlers (list / get / create /
 * update / change-plan / cancel / resume). The active organization is resolved
 * from the signed `org` token claim via `requireOrganizationScope(request)`; handlers
 * that take a `subscription_id` path param validate it (sec-B10); externally
 * mutating routes also require the `X-Idempotency-Key` header before delegating
 * to {@link SubscriptionService}. Create, change-plan, cancel and resume record a scoped audit
 * event in the organization's log.
 *
 * @remarks
 * sec-B10: every handler resolves the organization from the token claim and
 * validates `request.params.subscription_id` rather than threading it to the
 * service unchecked. Not an IDOR (the service uses an exact-match WHERE, scoped
 * by RLS to the active organization), but unbounded attacker-supplied input
 * would otherwise flow into Sentry breadcrumbs, log payloads, and route-tagged
 * metric labels — a small cardinality + content-exfiltration foot-gun.
 * Validate the subscription id at the boundary so observability cannot be poisoned.
 */
export function createSubscriptionController(service: SubscriptionService) {
  return {
    listSubscriptions: async (request: FastifyRequest, _reply: FastifyReply) => {
      requirePrincipal(request);
      const data = await service.list(requireOrganizationScope(request));
      return successResponse({
        data: SubscriptionSerializer.many(data),
        request_id: getRequestIdentifier(request),
      });
    },
    getSubscription: async (
      request: FastifyRequest<{ Params: { subscription_id: string } }>,
      _reply: FastifyReply,
    ) => {
      requirePrincipal(request);
      const data = await service.get({
        scope: requireOrganizationScope(request),
        subscription_public_id: validatePublicIdParam({
          value: request.params.subscription_id,
          fieldName: 'subscription_id',
        }),
      });
      return successResponse({
        data: SubscriptionSerializer.one(data),
        request_id: getRequestIdentifier(request),
      });
    },
    createSubscription: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const idempotencyKey = readIdempotencyKey(request);
      const subscription = SubscriptionSerializer.one(
        await service.create({
          scope,
          body: request.body,
          created_by_user_public_id: getActingUserPublicId(auth),
          idempotencyKey,
        }),
      );
      await recordSubscriptionAuditEvent({
        request,
        auth,
        organizationPublicId: scope.organizationPublicId,
        action: 'billing.subscription.create',
        subscription,
      });
      return successResponse({ data: subscription, request_id: getRequestIdentifier(request) });
    },
    changePlan: async (
      request: FastifyRequest<{ Params: { subscription_id: string } }>,
      _reply: FastifyReply,
    ) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const subscription = SubscriptionSerializer.one(
        await service.changePlan({
          scope,
          subscription_public_id: validatePublicIdParam({
            value: request.params.subscription_id,
            fieldName: 'subscription_id',
          }),
          body: request.body,
          idempotencyKey: readIdempotencyKey(request),
        }),
      );
      await recordSubscriptionAuditEvent({
        request,
        auth,
        organizationPublicId: scope.organizationPublicId,
        action: 'billing.subscription.change_plan',
        subscription,
      });
      return successResponse({ data: subscription, request_id: getRequestIdentifier(request) });
    },
    cancelSubscription: async (
      request: FastifyRequest<{ Params: { subscription_id: string } }>,
      _reply: FastifyReply,
    ) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const subscription = SubscriptionSerializer.one(
        await service.cancel({
          scope,
          subscription_public_id: validatePublicIdParam({
            value: request.params.subscription_id,
            fieldName: 'subscription_id',
          }),
          idempotencyKey: readIdempotencyKey(request),
        }),
      );
      await recordSubscriptionAuditEvent({
        request,
        auth,
        organizationPublicId: scope.organizationPublicId,
        action: 'billing.subscription.cancel',
        subscription,
      });
      return successResponse({ data: subscription, request_id: getRequestIdentifier(request) });
    },
    resumeSubscription: async (
      request: FastifyRequest<{ Params: { subscription_id: string } }>,
      _reply: FastifyReply,
    ) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const subscription = SubscriptionSerializer.one(
        await service.resume({
          scope,
          subscription_public_id: validatePublicIdParam({
            value: request.params.subscription_id,
            fieldName: 'subscription_id',
          }),
          idempotencyKey: readIdempotencyKey(request),
        }),
      );
      await recordSubscriptionAuditEvent({
        request,
        auth,
        organizationPublicId: scope.organizationPublicId,
        action: 'billing.subscription.resume',
        subscription,
      });
      return successResponse({ data: subscription, request_id: getRequestIdentifier(request) });
    },
    getPaymentSetup: async (
      request: FastifyRequest<{ Params: { subscription_id: string } }>,
      _reply: FastifyReply,
    ) => {
      requirePrincipal(request);
      const data = await service.getPaymentSetup({
        scope: requireOrganizationScope(request),
        subscription_public_id: validatePublicIdParam({
          value: request.params.subscription_id,
          fieldName: 'subscription_id',
        }),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    listInvoices: async (request: FastifyRequest, _reply: FastifyReply) => {
      requirePrincipal(request);
      const result = await service.listInvoices({
        scope: requireOrganizationScope(request),
        query: request.query,
      });
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
    listPaymentMethods: async (request: FastifyRequest, _reply: FastifyReply) => {
      requirePrincipal(request);
      const data = await service.listPaymentMethods(requireOrganizationScope(request));
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    createPaymentMethodSetup: async (request: FastifyRequest, _reply: FastifyReply) => {
      requirePrincipal(request);
      const data = await service.createPaymentMethodSetup({
        scope: requireOrganizationScope(request),
        idempotencyKey: readIdempotencyKey(request),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
  };
}
