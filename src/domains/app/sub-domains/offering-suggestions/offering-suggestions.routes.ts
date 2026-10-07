import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { OfferingSuggestionsService } from './offering-suggestions.service.js';
import { createOfferingSuggestionsController } from './offering-suggestions.controller.js';
import {
  CreateOfferingSuggestionDto,
  UpdateOfferingSuggestionDto,
  listOfferingSuggestionsQueryDto,
  offeringSuggestionsIdParamsDto,
  offeringSuggestionsParentParamsDto,
} from './offering-suggestions.dto.js';

/** Registers the `offering-suggestions` routes (prefix `/api/v1/app`). */
export function offeringSuggestionsRoutes(service: OfferingSuggestionsService): FastifyPluginAsync {
  const controller = createOfferingSuggestionsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/offering-suggestions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's offering suggestions",
          description:
            'Returns one page of the offering suggestions of a patient (newest first), with the total count. Requires patient:read.',
          tags: ['Invoice'],
          params: offeringSuggestionsParentParamsDto,
          querystring: listOfferingSuggestionsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/offering-suggestions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a offering suggestion',
          description: 'Adds a offering suggestion to a patient. Requires patient:update.',
          tags: ['Invoice'],
          params: offeringSuggestionsParentParamsDto,
          body: CreateOfferingSuggestionDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { offering_suggestion_id: string } }>(
      '/offering-suggestions/:offering_suggestion_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get offering suggestion',
          description:
            'Returns one offering suggestion of the active organization. Requires patient:read.',
          tags: ['Invoice'],
          params: offeringSuggestionsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { offering_suggestion_id: string } }>(
      '/offering-suggestions/:offering_suggestion_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update offering suggestion',
          description:
            "Changes any of a offering suggestion's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires patient:update.",
          tags: ['Invoice'],
          params: offeringSuggestionsIdParamsDto,
          body: UpdateOfferingSuggestionDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { offering_suggestion_id: string } }>(
      '/offering-suggestions/:offering_suggestion_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete offering suggestion',
          description:
            "Soft-deletes a offering suggestion with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:update.",
          tags: ['Invoice'],
          params: offeringSuggestionsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { offering_suggestion_id: string } }>(
      '/offering-suggestions/:offering_suggestion_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore offering suggestion',
          description:
            "Undoes a offering suggestion's delete. A live offering suggestion is a 409. Requires patient:update.",
          tags: ['Invoice'],
          params: offeringSuggestionsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
