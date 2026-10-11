import { z } from 'zod';
import { PAGINATION } from '@/shared/constants/pagination.constants.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';

/** Zod schema for the `:subscription_id` path param (get/update/change-plan/cancel/resume). */
export const subscriptionIdParamsDto = z
  .object({
    subscription_id: trimmedStringMinMax({ min: 1, max: 28 }),
  })
  .strict();

/** Zod schema for `POST /api/v1/billing/subscriptions` request body. */
export const CreateSubscriptionDto = z
  .object({
    plan_id: trimmedString().max(255),
    billing_cycle: z.enum(['monthly', 'yearly']),
  })
  .strict();

/** Inferred input type from {@link CreateSubscriptionDto}. */
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionDto>;

/**
 * Zod schema for `POST /api/v1/billing/subscriptions/:subscription_id/change-plan`
 * — accepts the target plan's `public_id`.
 */
export const ChangePlanDto = z
  .object({
    plan_id: trimmedString().max(255),
  })
  .strict();

/** Inferred input type from {@link ChangePlanDto}. */
export type ChangePlanInput = z.infer<typeof ChangePlanDto>;

/**
 * Zod schema for the `GET /api/v1/billing/invoices` cursor pagination query. Invoices are proxied
 * from Stripe, so `after` is a Stripe invoice id (`in_*`) fed to Stripe's `starting_after`, and
 * `limit` is capped at Stripe's page maximum (MAX_LIMIT = 100).
 *
 * @remarks
 * `limit` is `.optional()` (not `.default`): a defaulted param serializes as `required` in the
 * OpenAPI document, which misdescribes an optional parameter. The default is applied in the
 * service instead.
 */
export const listInvoicesQueryDto = z
  .object({
    after: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).optional(),
  })
  .strict();

/** Validated query inferred from {@link listInvoicesQueryDto}. */
export type ListInvoicesQueryInput = z.infer<typeof listInvoicesQueryDto>;
