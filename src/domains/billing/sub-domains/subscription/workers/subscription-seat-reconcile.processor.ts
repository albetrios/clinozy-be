import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { createRetentionSubscriptionRepository } from '@/domains/billing/sub-domains/subscription/subscription.repository.js';
import type { SubscriptionService } from '@/domains/billing/sub-domains/subscription/subscription.service.js';
import { SUBSCRIPTION_SEAT_RECONCILE_BATCH_SIZE } from '@/domains/billing/sub-domains/subscription/workers/subscription-seat-reconcile.constants.js';
import { env } from '@/shared/config/env.config.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * What one reconcile pass did.
 *
 * @remarks
 * Logged as `subscription-seat-reconcile.completed`; both counts are capped by the batch size, so a
 * count at the cap means the next pass has more to do.
 */
export interface SubscriptionSeatReconcileResult {
  /** Organizations whose Stripe quantity differed from the seats in use (a seat sync enqueued). */
  quantityDriftCount: number;
  /** Organizations without a paid entitlement holding more members than the Free allowance. */
  entitlementLapsedCount: number;
}

/**
 * The recovery for both seat obligations that ride on a best-effort trigger.
 *
 * @remarks
 * - **Algorithm:** one read across tenants under the retention maintenance context
 *   ({@link SubscriptionRepository.findSeatReconcileCandidates}); then, outside it, a seat sync is
 *   enqueued per drifted organization (deduplicated per organization by the seat-sync queue) and
 *   {@link SubscriptionService.enforceFreeSeatCeiling} runs per lapsed one.
 * - **Why:** the seat sync is enqueued after the member change commits — an enqueue lost to a Redis
 *   blip left Stripe billing the old quantity until the next change; and a dunning subscription's
 *   grace ends with no event at all, so nothing else brings the organization back within the Free
 *   allowance.
 * - **Failure modes:** a database error propagates (the job retries); enqueue and enforcement are
 *   best-effort and logged.
 * - **Notes:** a repeatable job on the seat-sync queue, run by the seat-sync worker — no worker or
 *   connection budget of its own.
 * - **Side effects:** seat-sync jobs; suspended memberships.
 */
export async function runSubscriptionSeatReconcileJob(
  subscriptionService: SubscriptionService,
): Promise<SubscriptionSeatReconcileResult> {
  const candidates = await runGlobalRetentionWorkerJob((databaseHandle) =>
    createRetentionSubscriptionRepository(databaseHandle).findSeatReconcileCandidates({
      limit: SUBSCRIPTION_SEAT_RECONCILE_BATCH_SIZE,
      dunningGraceDays: env.BILLING_DUNNING_GRACE_DAYS,
    }),
  );
  for (const organizationPublicId of candidates.quantityDrift) {
    subscriptionService.enqueueSeatQuantitySync({ organization_public_id: organizationPublicId });
  }
  for (const organizationPublicId of candidates.entitlementLapsed) {
    await subscriptionService.enforceFreeSeatCeiling(organizationPublicId);
  }
  const result = {
    quantityDriftCount: candidates.quantityDrift.length,
    entitlementLapsedCount: candidates.entitlementLapsed.length,
  };
  logger.info(result, 'subscription-seat-reconcile.completed');
  return result;
}
