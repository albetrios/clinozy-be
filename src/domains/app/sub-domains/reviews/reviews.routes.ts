import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { ReviewsService } from './reviews.service.js';
import { createReviewsController } from './reviews.controller.js';
import {
  CreateReviewDto,
  UpdateReviewDto,
  listReviewsQueryDto,
  reviewsIdParamsDto,
  reviewsParentParamsDto,
} from './reviews.dto.js';

/** Registers the `reviews` routes (prefix `/api/v1/app`). */
export function reviewsRoutes(service: ReviewsService): FastifyPluginAsync {
  const controller = createReviewsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/reviews',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.REVIEW_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a patient's reviews",
          description:
            'Returns one page of the reviews of a patient (newest first), with the total count. Requires review:read.',
          tags: ['Feedback'],
          params: reviewsParentParamsDto,
          querystring: listReviewsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<{ Params: { patient_id: string } }>(
      '/patients/:patient_id/reviews',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.REVIEW_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a review',
          description: 'Adds a review to a patient. Requires review:create.',
          tags: ['Feedback'],
          params: reviewsParentParamsDto,
          body: CreateReviewDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { review_id: string } }>(
      '/reviews/:review_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.REVIEW_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get review',
          description: 'Returns one review of the active organization. Requires review:read.',
          tags: ['Feedback'],
          params: reviewsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { review_id: string } }>(
      '/reviews/:review_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.REVIEW_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update review',
          description:
            "Changes any of a review's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires review:update.",
          tags: ['Feedback'],
          params: reviewsIdParamsDto,
          body: UpdateReviewDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { review_id: string } }>(
      '/reviews/:review_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.REVIEW_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete review',
          description:
            "Soft-deletes a review with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires review:delete.",
          tags: ['Feedback'],
          params: reviewsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { review_id: string } }>(
      '/reviews/:review_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.REVIEW_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore review',
          description: "Undoes a review's delete. A live review is a 409. Requires review:delete.",
          tags: ['Feedback'],
          params: reviewsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
