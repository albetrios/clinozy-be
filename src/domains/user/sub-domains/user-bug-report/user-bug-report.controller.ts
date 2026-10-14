import type { FastifyReply, FastifyRequest } from 'fastify';
import { getRequestIdentifier, requireUserScope } from '@/shared/utils/http/request.util.js';
import { successResponse } from '@/shared/utils/http/response.util.js';
import { getUserAgent } from '@/shared/utils/http/user-agent.util.js';
import type { UserBugReportService } from './user-bug-report.service.js';

/**
 * Build the bug-report HTTP handler map. The reporter is the session's person
 * (`requireUserScope` — API keys are refused); the controller relays the scope, the body and the
 * request's `User-Agent` to the service and shapes the reply.
 */
export function createUserBugReportController(userBugReportService: UserBugReportService) {
  return {
    /** POST /api/v1/users/me/bug-reports — file a bug report for the signed-in person. */
    async createBugReport(request: FastifyRequest, _reply: FastifyReply) {
      const data = await userBugReportService.create({
        scope: requireUserScope(request),
        body: request.body,
        userAgent: getUserAgent(request),
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
  };
}
