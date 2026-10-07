import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { CreditNotesService } from './credit-notes.service.js';
import { createCreditNotesController } from './credit-notes.controller.js';
import { creditNotesIdParamsDto, listCreditNotesQueryDto } from './credit-notes.dto.js';

/** Registers the `credit-notes` routes (prefix `/api/v1/app`). */
export function creditNotesRoutes(service: CreditNotesService): FastifyPluginAsync {
  const controller = createCreditNotesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/credit-notes',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List credit notes',
          description:
            "Returns one page of the active organization's credit notes (newest first by default), with the total count; `q` searches, filters narrow. Requires payment:read.",
          tags: ['Payment'],
          querystring: listCreditNotesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get<{ Params: { credit_note_id: string } }>(
      '/credit-notes/:credit_note_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PAYMENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get credit note',
          description: 'Returns one credit note of the active organization. Requires payment:read.',
          tags: ['Payment'],
          params: creditNotesIdParamsDto,
        },
      },
      controller.get,
    );
  };
}
