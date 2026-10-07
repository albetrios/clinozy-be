import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PrescriptionsService } from './prescriptions.service.js';
import { createPrescriptionsController } from './prescriptions.controller.js';
import {
  CreatePrescriptionDto,
  UpdatePrescriptionDto,
  listPrescriptionsQueryDto,
  prescriptionsIdParamsDto,
  prescriptionsParentParamsDto,
} from './prescriptions.dto.js';

/** Registers the `prescriptions` routes (prefix `/api/v1/app`). */
export function prescriptionsRoutes(service: PrescriptionsService): FastifyPluginAsync {
  const controller = createPrescriptionsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/prescriptions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's prescriptions",
          description:
            'Returns one page of the prescriptions of a patient (newest first), with the total count. Requires prescription:read.',
          tags: ['Patient file'],
          params: prescriptionsParentParamsDto,
          querystring: listPrescriptionsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/prescriptions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a prescription',
          description: 'Adds a prescription to a patient. Requires prescription:create.',
          tags: ['Patient file'],
          params: prescriptionsParentParamsDto,
          body: CreatePrescriptionDto,
        },
      },
      controller.create,
    );
    zodApplication.get(
      '/prescriptions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List prescriptions',
          description:
            "Returns one page of the active organization's prescriptions (newest first by default), with the total count; `q` searches, filters narrow. Requires prescription:read.",
          tags: ['Patient file'],
          querystring: listPrescriptionsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get<{ Params: { prescription_id: string } }>(
      '/prescriptions/:prescription_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get prescription',
          description:
            'Returns one prescription of the active organization. Requires prescription:read.',
          tags: ['Patient file'],
          params: prescriptionsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { prescription_id: string } }>(
      '/prescriptions/:prescription_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update prescription',
          description:
            "Changes any of a prescription's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires prescription:update.",
          tags: ['Patient file'],
          params: prescriptionsIdParamsDto,
          body: UpdatePrescriptionDto,
        },
      },
      controller.update,
    );
    zodApplication.post<{ Params: { prescription_id: string } }>(
      '/prescriptions/:prescription_id/approve',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Approve prescription',
          description:
            'Approves a draft (every copied line reviewed first); it then goes to print, the patient and the pharmacy queue (D31). A prescription whose status does not allow it is a 409. Requires prescription:update.',
          tags: ['Patient file'],
          params: prescriptionsIdParamsDto,
        },
      },
      controller.transition('approve'),
    );
    zodApplication.delete<{ Params: { prescription_id: string } }>(
      '/prescriptions/:prescription_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete prescription',
          description:
            "Soft-deletes a prescription with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires prescription:delete.",
          tags: ['Patient file'],
          params: prescriptionsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { prescription_id: string } }>(
      '/prescriptions/:prescription_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRESCRIPTION_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore prescription',
          description:
            "Undoes a prescription's delete. A live prescription is a 409. Requires prescription:delete.",
          tags: ['Patient file'],
          params: prescriptionsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
