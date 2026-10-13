import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import type { OnboardingSetupService } from './onboarding-setup.service.js';

/** HTTP handlers for `/app/onboarding-setup` — the clinic setup's status, its changes, going live. */
export function createOnboardingSetupController(service: OnboardingSetupService) {
  return {
    getSetup: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.get({
        scope: requireOrganizationScope(request),
        actingUserPublicId: getActingUserPublicId(requirePrincipal(request)),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    changeSetup: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.change({
        scope: requireOrganizationScope(request),
        body: request.body,
        actingUserPublicId: getActingUserPublicId(requirePrincipal(request)),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    completeSetup: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.complete({
        scope: requireOrganizationScope(request),
        actingUserPublicId: getActingUserPublicId(requirePrincipal(request)),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
  };
}
