import { MAIL_QUEUE_NAME } from '@/infrastructure/mail/queues/mail.queue.js';
import { MAIL_OUTBOX_SWEEPER_QUEUE_NAME } from '@/infrastructure/mail/workers/mail-outbox-sweeper.constants.js';
import { COMMIT_DISPATCH_RECOVERY_QUEUE_NAME } from '@/infrastructure/queue/commit-dispatch/commit-dispatch-recovery.constants.js';
import { NOTIFICATION_QUEUE_NAME } from '@/domains/notify/sub-domains/notification/queues/notification.queue.js';
import { USER_DATA_EXPORT_QUEUE_NAME } from '@/domains/user/sub-domains/user-data-export/queues/user-data-export.queue.js';
import { WEBHOOK_DELIVERY_QUEUE_NAME } from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';
import { WEBHOOK_DELIVERY_RECLAIM_QUEUE_NAME } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-reclaim.constants.js';
import { STRIPE_WEBHOOK_QUEUE_NAME } from '@/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook.queue.js';
import { SUBSCRIPTION_SEAT_SYNC_QUEUE_NAME } from '@/domains/billing/sub-domains/subscription/queues/subscription-seat-sync.queue.js';
import { STRIPE_WEBHOOK_EVENT_RETENTION_QUEUE_NAME } from '@/domains/billing/sub-domains/stripe-webhook/workers/stripe-webhook-event-retention.constants.js';
import { STRIPE_WEBHOOK_EVENT_RECLAIM_QUEUE_NAME } from '@/domains/billing/sub-domains/stripe-webhook/workers/stripe-webhook-event-reclaim.constants.js';
import { STRIPE_WEBHOOK_EVENT_CATCHUP_QUEUE_NAME } from '@/domains/billing/sub-domains/stripe-webhook/workers/stripe-webhook-event-catchup.constants.js';
import { AUDIT_RETENTION_QUEUE_NAME } from '@/domains/audit/workers/audit-retention.constants.js';
import { AUDIT_OUTBOX_DRAIN_QUEUE_NAME } from '@/domains/audit/workers/audit-outbox-drain.constants.js';
import { AUDIT_EXPORT_QUEUE_NAME } from '@/domains/audit/workers/audit-export.constants.js';
import { SESSION_CLEANUP_QUEUE_NAME } from '@/domains/auth/sub-domains/auth-session/workers/session-cleanup.constants.js';
import { NOTIFICATION_RETENTION_QUEUE_NAME } from '@/domains/notify/sub-domains/notification/workers/notification-retention.constants.js';
import { USER_OFFBOARDING_RECONCILE_QUEUE_NAME } from '@/domains/user/workers/user-offboarding-reconcile.constants.js';
import { ORGANIZATION_OFFBOARDING_RECONCILE_QUEUE_NAME } from '@/domains/tenancy/sub-domains/organization/workers/organization-offboarding-reconcile.constants.js';
import { WEBHOOK_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/notify/sub-domains/webhook/workers/webhook-tombstone-retention.constants.js';
import { WEBHOOK_DELIVERY_ATTEMPT_RETENTION_QUEUE_NAME } from '@/domains/notify/sub-domains/webhook/workers/webhook-delivery-attempt-retention.constants.js';
import { ORGANIZATION_NOTIFICATION_POLICY_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/tenancy/sub-domains/organization/organization-notification-policy/workers/organization-notification-policy-tombstone-retention.constants.js';
import { USER_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/user/workers/user-tombstone-retention.constants.js';
import { ORGANIZATION_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/tenancy/sub-domains/organization/workers/organization-tombstone-retention.constants.js';
import { MEMBERSHIP_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/tenancy/sub-domains/membership/workers/membership-tombstone-retention.constants.js';
import { APP_RECORD_PURGE_QUEUE_NAME } from '@/domains/app/workers/app-record-purge.constants.js';
import { DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME } from '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close.constants.js';
import { DAY_CLOSE_AUTO_CLOSE_QUEUE_NAME } from '@/domains/app/sub-domains/billing/day-closes/queues/day-close-auto-close.queue.js';
import { MEMBER_ROLE_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/tenancy/sub-domains/member-roles/workers/member-role-tombstone-retention.constants.js';
import { ORGANIZATION_API_KEY_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/tenancy/sub-domains/organization/organization-api-key/workers/organization-api-key-tombstone-retention.constants.js';
import { UPLOAD_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/upload/workers/upload-tombstone-retention.constants.js';
import { UPLOAD_PENDING_SWEEP_QUEUE_NAME } from '@/domains/upload/workers/upload-pending-sweep.constants.js';
import { USER_DATA_EXPORT_RETENTION_QUEUE_NAME } from '@/domains/user/sub-domains/user-data-export/workers/user-data-export-retention.constants.js';
import { IDEMPOTENCY_CARDINALITY_QUEUE_NAME } from '@/infrastructure/observability/idempotency-cardinality/idempotency-cardinality.constants.js';
import { DLQ_DEPTH_QUEUE_NAME } from '@/infrastructure/observability/dlq-depth/dlq-depth.constants.js';
import { DLQ_AUTO_RETRY_QUEUE_NAME } from '@/infrastructure/queue/dlq/dlq-auto-retry.constants.js';

/**
 * Every BullMQ queue a worker consumes — the one list the queue-depth gauges, the DLQ depth sampler
 * and its mirror trim, the worker heartbeat read-out and Bull Board all use.
 *
 * @remarks
 * - **Algorithm:** grouped by worker family (mail, notify, webhook, stripe, retention,
 *   observability), mirroring `worker-registration.registry.ts`.
 * - **Failure modes:** none — a constant.
 * - **Side effects:** none.
 * - **Notes:** `queue-catalog.coverage.unit.test.ts` pins it to the registry: a worker registered
 *   without being listed here fails the build. Before, five hand-kept lists each missed a different
 *   set of queues — 14 had no depth gauge and 6 DLQs were never sampled or trimmed.
 */
export const WORKER_QUEUE_NAMES = [
  MAIL_QUEUE_NAME,
  MAIL_OUTBOX_SWEEPER_QUEUE_NAME,
  COMMIT_DISPATCH_RECOVERY_QUEUE_NAME,
  NOTIFICATION_QUEUE_NAME,
  USER_DATA_EXPORT_QUEUE_NAME,
  WEBHOOK_DELIVERY_QUEUE_NAME,
  WEBHOOK_DELIVERY_RECLAIM_QUEUE_NAME,
  STRIPE_WEBHOOK_QUEUE_NAME,
  SUBSCRIPTION_SEAT_SYNC_QUEUE_NAME,
  STRIPE_WEBHOOK_EVENT_RETENTION_QUEUE_NAME,
  STRIPE_WEBHOOK_EVENT_RECLAIM_QUEUE_NAME,
  STRIPE_WEBHOOK_EVENT_CATCHUP_QUEUE_NAME,
  AUDIT_RETENTION_QUEUE_NAME,
  AUDIT_OUTBOX_DRAIN_QUEUE_NAME,
  AUDIT_EXPORT_QUEUE_NAME,
  SESSION_CLEANUP_QUEUE_NAME,
  NOTIFICATION_RETENTION_QUEUE_NAME,
  USER_OFFBOARDING_RECONCILE_QUEUE_NAME,
  ORGANIZATION_OFFBOARDING_RECONCILE_QUEUE_NAME,
  WEBHOOK_TOMBSTONE_RETENTION_QUEUE_NAME,
  WEBHOOK_DELIVERY_ATTEMPT_RETENTION_QUEUE_NAME,
  ORGANIZATION_NOTIFICATION_POLICY_TOMBSTONE_RETENTION_QUEUE_NAME,
  USER_TOMBSTONE_RETENTION_QUEUE_NAME,
  ORGANIZATION_TOMBSTONE_RETENTION_QUEUE_NAME,
  MEMBERSHIP_TOMBSTONE_RETENTION_QUEUE_NAME,
  APP_RECORD_PURGE_QUEUE_NAME,
  DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME,
  DAY_CLOSE_AUTO_CLOSE_QUEUE_NAME,
  MEMBER_ROLE_TOMBSTONE_RETENTION_QUEUE_NAME,
  ORGANIZATION_API_KEY_TOMBSTONE_RETENTION_QUEUE_NAME,
  UPLOAD_TOMBSTONE_RETENTION_QUEUE_NAME,
  UPLOAD_PENDING_SWEEP_QUEUE_NAME,
  USER_DATA_EXPORT_RETENTION_QUEUE_NAME,
  IDEMPOTENCY_CARDINALITY_QUEUE_NAME,
  DLQ_DEPTH_QUEUE_NAME,
  DLQ_AUTO_RETRY_QUEUE_NAME,
] as const;

/**
 * The event-driven queues whose throughput users wait on — the registry's `criticality:
 * 'throughput'` workers. Their heartbeats and waiting counts decide whether a worker is stalled.
 *
 * @remarks
 * - **Algorithm:** a subset of {@link WORKER_QUEUE_NAMES}.
 * - **Failure modes:** none — a constant.
 * - **Side effects:** none.
 * - **Notes:** pinned to the registry's throughput workers by `queue-catalog.coverage.unit.test.ts`.
 */
export const WORKER_THROUGHPUT_QUEUE_NAMES = [
  MAIL_QUEUE_NAME,
  NOTIFICATION_QUEUE_NAME,
  USER_DATA_EXPORT_QUEUE_NAME,
  WEBHOOK_DELIVERY_QUEUE_NAME,
  STRIPE_WEBHOOK_QUEUE_NAME,
  SUBSCRIPTION_SEAT_SYNC_QUEUE_NAME,
  DAY_CLOSE_AUTO_CLOSE_QUEUE_NAME,
] as const;
