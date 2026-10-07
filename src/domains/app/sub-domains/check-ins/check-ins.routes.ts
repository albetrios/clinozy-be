import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { CheckInsService } from './check-ins.service.js';
import { createCheckInsController } from './check-ins.controller.js';
import {
  CreateCheckInDto,
  UpdateCheckInDto,
  checkInsIdParamsDto,
  checkInsParentParamsDto,
  listCheckInsQueryDto,
} from './check-ins.dto.js';

/** Registers the `check-ins` routes (prefix `/api/v1/app`). */
export function checkInsRoutes(service: CheckInsService): FastifyPluginAsync {
  const controller = createCheckInsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/check-ins',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's check-ins",
          description:
            'Returns one page of the check-ins of a patient (newest first), with the total count. Requires patient:read.',
          tags: ['Feedback'],
          params: checkInsParentParamsDto,
          querystring: listCheckInsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/check-ins',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a check-in',
          description: 'Adds a check-in to a patient. Requires patient:update.',
          tags: ['Feedback'],
          params: checkInsParentParamsDto,
          body: CreateCheckInDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { check_in_id: string } }>(
      '/check-ins/:check_in_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get check-in',
          description: 'Returns one check-in of the active organization. Requires patient:read.',
          tags: ['Feedback'],
          params: checkInsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { check_in_id: string } }>(
      '/check-ins/:check_in_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update check-in',
          description:
            "Changes any of a check-in's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires patient:update.",
          tags: ['Feedback'],
          params: checkInsIdParamsDto,
          body: UpdateCheckInDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { check_in_id: string } }>(
      '/check-ins/:check_in_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete check-in',
          description:
            "Soft-deletes a check-in with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:update.",
          tags: ['Feedback'],
          params: checkInsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { check_in_id: string } }>(
      '/check-ins/:check_in_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore check-in',
          description:
            "Undoes a check-in's delete. A live check-in is a 409. Requires patient:update.",
          tags: ['Feedback'],
          params: checkInsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
