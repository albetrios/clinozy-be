// hand-edited — the task rule list handlers.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import type { TaskRuleSettingsService } from './task-rule-settings.service.js';

/** HTTP handlers for `GET`/`PUT /app/task-rule-settings` — the organization's task rules. */
export function createTaskRuleSettingsController(service: TaskRuleSettingsService) {
  return {
    listRules: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.listRules(requireOrganizationScope(request));
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    replaceRules: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await service.replaceRules({
        scope: requireOrganizationScope(request),
        body: request.body,
        actingUserPublicId: getActingUserPublicId(requirePrincipal(request)),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
  };
}
