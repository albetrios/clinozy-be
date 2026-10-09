import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import {
  getRequestIdentifier,
  requireOrganizationScope,
} from '@/shared/utils/http/request.util.js';
import type { PatientIdeasService } from './patient-ideas.service.js';

/** HTTP handlers for `GET /app/patients/{patient_id}/offering-ideas` — the plan's ideas (7.N). */
export function createPatientIdeasController(service: PatientIdeasService) {
  return {
    list: async (request: FastifyRequest, _reply: FastifyReply) => {
      const result = await service.list(requireOrganizationScope(request), request.params);
      const body = successResponse(result.data, getRequestIdentifier(request));
      return { ...body, meta: { ...body.meta, ...result.meta } };
    },
  };
}
