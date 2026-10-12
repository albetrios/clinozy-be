import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PatientIdeasService } from './patient-ideas.service.js';
import { createPatientIdeasController } from './patient-ideas.controller.js';
import { patientIdeasParamsDto } from './patient-ideas.dto.js';

/**
 * Registers the `patient-ideas` route (prefix `/api/v1/app`) — routes-final 7.N, route 74, nested
 * under the patient.
 */
export function patientIdeasRoutes(service: PatientIdeasService): FastifyPluginAsync {
  const controller = createPatientIdeasController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/offering-ideas',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "A patient's ideas from history",
          description:
            "Returns at most 4 offering ideas for the patient's plan, each with `offering_id`, `offering_name`, `category`, `sessions`, `price`, `reason` and `source`. From the patient's history, by rule: the doctor's treatment suggestions (`note`), complaints and diagnoses (`history`), two or more visits → a package (`consistency`), a package almost used up → renew (`renew`), no visit → a consultation (`first`). Never an inactive offering or one already in the plan (any status but declined). A removed or unknown patient is a 404. Requires patient:read.",
          tags: ['Patient file'],
          params: patientIdeasParamsDto,
        },
      },
      controller.list,
    );
  };
}
