import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { MedicalContactsService } from './medical-contacts.service.js';
import { createMedicalContactsController } from './medical-contacts.controller.js';
import {
  CreateMedicalContactDto,
  UpdateMedicalContactDto,
  listMedicalContactsQueryDto,
  medicalContactsIdParamsDto,
} from './medical-contacts.dto.js';

/** Registers the `medical-contacts` routes (prefix `/api/v1/app`). */
export function medicalContactsRoutes(service: MedicalContactsService): FastifyPluginAsync {
  const controller = createMedicalContactsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/medical-contacts',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_SALE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List medical contacts',
          description:
            "Returns one page of the active organization's medical contacts (newest first by default), with the total count; `q` searches, filters narrow. Requires medical_sale:read.",
          tags: ['Medical store'],
          querystring: listMedicalContactsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/medical-contacts',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_SALE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create medical contact',
          description:
            'Adds a medical contact to the active organization. Requires medical_sale:create.',
          tags: ['Medical store'],
          body: CreateMedicalContactDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { medical_contact_id: string } }>(
      '/medical-contacts/:medical_contact_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_SALE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get medical contact',
          description:
            'Returns one medical contact of the active organization. Requires medical_sale:read.',
          tags: ['Medical store'],
          params: medicalContactsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { medical_contact_id: string } }>(
      '/medical-contacts/:medical_contact_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_SALE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update medical contact',
          description:
            "Changes any of a medical contact's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires medical_sale:update.",
          tags: ['Medical store'],
          params: medicalContactsIdParamsDto,
          body: UpdateMedicalContactDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { medical_contact_id: string } }>(
      '/medical-contacts/:medical_contact_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_SALE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete medical contact',
          description:
            "Soft-deletes a medical contact with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires medical_sale:delete.",
          tags: ['Medical store'],
          params: medicalContactsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { medical_contact_id: string } }>(
      '/medical-contacts/:medical_contact_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MEDICAL_SALE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore medical contact',
          description:
            "Undoes a medical contact's delete. A live medical contact is a 409. Requires medical_sale:delete.",
          tags: ['Medical store'],
          params: medicalContactsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
