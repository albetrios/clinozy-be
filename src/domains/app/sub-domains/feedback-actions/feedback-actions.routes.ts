import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { FeedbackActionsService } from './feedback-actions.service.js';
import { createFeedbackActionsController } from './feedback-actions.controller.js';
import {
  CreateFeedbackActionDto,
  UpdateFeedbackActionDto,
  feedbackActionsIdParamsDto,
  listFeedbackActionsQueryDto,
} from './feedback-actions.dto.js';

/** Registers the `feedback-actions` routes (prefix `/api/v1/app`). */
export function feedbackActionsRoutes(service: FeedbackActionsService): FastifyPluginAsync {
  const controller = createFeedbackActionsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/feedback-actions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List feedback actions',
          description:
            "Returns one page of the active organization's feedback actions (newest first by default), with the total count; `q` searches, filters narrow. Requires patient:read.",
          tags: ['Feedback'],
          querystring: listFeedbackActionsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/feedback-actions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create feedback action',
          description:
            'Adds a feedback action to the active organization. Requires patient:update.',
          tags: ['Feedback'],
          body: CreateFeedbackActionDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { feedback_action_id: string } }>(
      '/feedback-actions/:feedback_action_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get feedback action',
          description:
            'Returns one feedback action of the active organization. Requires patient:read.',
          tags: ['Feedback'],
          params: feedbackActionsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { feedback_action_id: string } }>(
      '/feedback-actions/:feedback_action_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update feedback action',
          description:
            "Changes any of a feedback action's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires patient:update.",
          tags: ['Feedback'],
          params: feedbackActionsIdParamsDto,
          body: UpdateFeedbackActionDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { feedback_action_id: string } }>(
      '/feedback-actions/:feedback_action_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete feedback action',
          description:
            "Soft-deletes a feedback action with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires patient:update.",
          tags: ['Feedback'],
          params: feedbackActionsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { feedback_action_id: string } }>(
      '/feedback-actions/:feedback_action_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PATIENT_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore feedback action',
          description:
            "Undoes a feedback action's delete. A live feedback action is a 409. Requires patient:update.",
          tags: ['Feedback'],
          params: feedbackActionsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
