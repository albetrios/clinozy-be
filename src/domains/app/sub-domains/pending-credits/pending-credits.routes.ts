import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { PendingCreditsService } from './pending-credits.service.js';
import { createPendingCreditsController } from './pending-credits.controller.js';
import {
  CreatePendingCreditDto,
  UpdatePendingCreditDto,
  listPendingCreditsQueryDto,
  pendingCreditsIdParamsDto,
} from './pending-credits.dto.js';

/** Registers the `pending-credits` routes (prefix `/api/v1/app`). */
export function pendingCreditsRoutes(service: PendingCreditsService): FastifyPluginAsync {
  const controller = createPendingCreditsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/pending-credits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List pending credits',
          description:
            "Returns one page of the active organization's pending credits (newest first by default), with the total count; `q` searches, filters narrow. Requires payment:read.",
          tags: ['Payment'],
          querystring: listPendingCreditsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/pending-credits',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create pending credit',
          description: 'Adds a pending credit to the active organization. Requires payment:create.',
          tags: ['Payment'],
          body: CreatePendingCreditDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { pending_credit_id: string } }>(
      '/pending-credits/:pending_credit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get pending credit',
          description:
            'Returns one pending credit of the active organization. Requires payment:read.',
          tags: ['Payment'],
          params: pendingCreditsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { pending_credit_id: string } }>(
      '/pending-credits/:pending_credit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update pending credit',
          description:
            "Changes any of a pending credit's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires payment:update.",
          tags: ['Payment'],
          params: pendingCreditsIdParamsDto,
          body: UpdatePendingCreditDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { pending_credit_id: string } }>(
      '/pending-credits/:pending_credit_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete pending credit',
          description:
            "Soft-deletes a pending credit with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires payment:delete.",
          tags: ['Payment'],
          params: pendingCreditsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { pending_credit_id: string } }>(
      '/pending-credits/:pending_credit_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore pending credit',
          description:
            "Undoes a pending credit's delete. A live pending credit is a 409. Requires payment:delete.",
          tags: ['Payment'],
          params: pendingCreditsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
