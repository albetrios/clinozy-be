import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  ChangePlanDto,
  CreateSubscriptionDto,
  listInvoicesQueryDto,
  type ChangePlanInput,
  type CreateSubscriptionInput,
  type ListInvoicesQueryInput,
} from './subscription.dto.js';

/**
 * Parses `POST /api/v1/billing/subscriptions` body against
 * {@link CreateSubscriptionDto}, throwing `ValidationError` with
 * field-level details on failure.
 */
export function validateCreateSubscription(data: unknown): CreateSubscriptionInput {
  return parseWithSchema({ schema: CreateSubscriptionDto, data });
}

/**
 * Parses the change-plan body against {@link ChangePlanDto}, throwing
 * `ValidationError` with field-level details on failure.
 */
export function validateChangePlan(data: unknown): ChangePlanInput {
  return parseWithSchema({ schema: ChangePlanDto, data });
}

/**
 * Parses the `GET /api/v1/billing/invoices` query against {@link listInvoicesQueryDto}, throwing
 * `ValidationError` with field-level details on failure.
 */
export function validateListInvoicesQuery(data: unknown): ListInvoicesQueryInput {
  return parseWithSchema({ schema: listInvoicesQueryDto, data });
}
