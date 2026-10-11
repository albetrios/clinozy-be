/**
 * Central registry for BullMQ repeatable jobs (cleanup / retention).
 * Worker processors live in domains; this module only calls upsertJobScheduler.
 */

import { Queue } from 'bullmq';
import { SEVEN_DAYS_SECONDS } from '@/shared/constants/ttl.constants.js';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { AUDIT_RETENTION_QUEUE_NAME } from '@/domains/audit/workers/audit-retention.constants.js';
import {
  AUDIT_OUTBOX_DRAIN_QUEUE_NAME,
  DEFAULT_AUDIT_OUTBOX_DRAIN_CRON,
} from '@/domains/audit/workers/audit-outbox-drain.constants.js';
import { NOTIFICATION_RETENTION_QUEUE_NAME } from '@/domains/notify/sub-domains/notification/workers/notification-retention.constants.js';
import { SESSION_CLEANUP_QUEUE_NAME } from '@/domains/auth/sub-domains/auth-session/workers/session-cleanup.constants.js';
import { WEBHOOK_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/notify/sub-domains/webhook/workers/webhook-tombstone-retention.constants.js';
import { WEBHOOK_DELIVERY_ATTEMPT_RETENTION_QUEUE_NAME } from '@/domains/notify/sub-domains/webhook/workers/webhook-delivery-attempt-retention.constants.js';
import { ORGANIZATION_NOTIFICATION_POLICY_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/tenancy/sub-domains/organization/organization-notification-policy/workers/organization-notification-policy-tombstone-retention.constants.js';
import { USER_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/user/workers/user-tombstone-retention.constants.js';
import { USER_OFFBOARDING_RECONCILE_QUEUE_NAME } from '@/domains/user/workers/user-offboarding-reconcile.constants.js';
import { ORGANIZATION_OFFBOARDING_RECONCILE_QUEUE_NAME } from '@/domains/tenancy/sub-domains/organization/workers/organization-offboarding-reconcile.constants.js';
import { ORGANIZATION_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/tenancy/sub-domains/organization/workers/organization-tombstone-retention.constants.js';
import { MEMBERSHIP_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/tenancy/sub-domains/membership/workers/membership-tombstone-retention.constants.js';
import { MEMBERSHIP_INVITATION_EXPIRY_QUEUE_NAME } from '@/domains/tenancy/sub-domains/membership/membership-invitation/workers/membership-invitation-expiry.constants.js';
import { APP_RECORD_PURGE_QUEUE_NAME } from '@/domains/app/workers/app-record-purge.constants.js';
import { DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME } from '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close.constants.js';
import { TASK_RULES_SWEEP_QUEUE_NAME } from '@/domains/app/sub-domains/tasks/workers/task-rules.constants.js';
import { PATIENT_IDEAS_SWEEP_QUEUE_NAME } from '@/domains/app/sub-domains/patients/patient-ideas/workers/patient-ideas.constants.js';
import {
  CONTACT_MESSAGING_SWEEP_QUEUE_NAME,
  MESSAGING_WEBHOOK_EVENT_RETENTION_QUEUE_NAME,
} from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/workers/contact-messaging-webhook.constants.js';
import { MEMBER_ROLE_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/tenancy/sub-domains/member-roles/workers/member-role-tombstone-retention.constants.js';
import { ORGANIZATION_API_KEY_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/tenancy/sub-domains/organization/organization-api-key/workers/organization-api-key-tombstone-retention.constants.js';
import { UPLOAD_TOMBSTONE_RETENTION_QUEUE_NAME } from '@/domains/upload/workers/upload-tombstone-retention.constants.js';
import { UPLOAD_PENDING_SWEEP_QUEUE_NAME } from '@/domains/upload/workers/upload-pending-sweep.constants.js';
import { USER_DATA_EXPORT_RETENTION_QUEUE_NAME } from '@/domains/user/sub-domains/user-data-export/workers/user-data-export-retention.constants.js';
import { IDEMPOTENCY_CARDINALITY_QUEUE_NAME } from '@/infrastructure/observability/idempotency-cardinality/idempotency-cardinality.constants.js';
import { DLQ_DEPTH_QUEUE_NAME } from '@/infrastructure/observability/dlq-depth/dlq-depth.constants.js';
import { MAIL_OUTBOX_SWEEPER_QUEUE_NAME } from '@/infrastructure/mail/workers/mail-outbox-sweeper.constants.js';
import { COMMIT_DISPATCH_RECOVERY_QUEUE_NAME } from '@/infrastructure/queue/commit-dispatch/commit-dispatch-recovery.constants.js';
import {
  DLQ_AUTO_RETRY_QUEUE_NAME,
  DEFAULT_DLQ_AUTO_RETRY_CRON,
} from '@/infrastructure/queue/dlq/dlq-auto-retry.constants.js';
import { STRIPE_WEBHOOK_EVENT_RECLAIM_QUEUE_NAME } from '@/domains/billing/sub-domains/stripe-webhook/workers/stripe-webhook-event-reclaim.constants.js';
import { SUBSCRIPTION_SEAT_RECONCILE_JOB_NAME } from '@/domains/billing/sub-domains/subscription/workers/subscription-seat-reconcile.constants.js';
import { SUBSCRIPTION_SEAT_SYNC_QUEUE_NAME } from '@/domains/billing/sub-domains/subscription/queues/subscription-seat-sync.queue.js';
import { WEBHOOK_DELIVERY_RECLAIM_QUEUE_NAME } from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-delivery-reclaim.constants.js';
import { USER_DATA_EXPORT_QUEUE_NAME } from '@/domains/user/sub-domains/user-data-export/queues/user-data-export.queue.js';
import { USER_DATA_EXPORT_RECLAIM_JOB_NAME } from '@/domains/user/sub-domains/user-data-export/workers/user-data-export-reclaim.constants.js';
import { STRIPE_WEBHOOK_EVENT_CATCHUP_QUEUE_NAME } from '@/domains/billing/sub-domains/stripe-webhook/workers/stripe-webhook-event-catchup.constants.js';
import { STRIPE_WEBHOOK_EVENT_RETENTION_QUEUE_NAME } from '@/domains/billing/sub-domains/stripe-webhook/workers/stripe-webhook-event-retention.constants.js';
import { AUDIT_EXPORT_QUEUE_NAME } from '@/domains/audit/workers/audit-export.constants.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { env } from '@/shared/config/env.config.js';

/**
 * One row in the canonical scheduler registry: maps a BullMQ queue to its stable
 * `schedulerId` (used by BullMQ for upsert deduplication), the cron-driven job name, and
 * the cron pattern. The optional `timezone` is forwarded to BullMQ as `tz` and is sourced
 * from `SCHEDULER_TIMEZONE` so all scheduled runs agree on a wall clock.
 */
export interface ScheduledJob {
  queueName: string;
  schedulerId: string;
  jobName: string;
  cronPattern: string;
  /** Passed to BullMQ as `tz` when set. */
  timezone?: string;
}

/**
 * Lifecycle handle returned by {@link registerScheduledJobs}. `close()` closes every
 * BullMQ producer that was opened to register the cron schedules (best-effort, never
 * throws), so the scheduler-only handle can be drained alongside worker handles.
 */
export interface SchedulerHandle {
  close: () => Promise<void>;
}

const DEFAULT_AUDIT_RETENTION_CRON = '0 3 * * *';
/** In-app notification row retention purge (runs after audit cleanup). */
const DEFAULT_NOTIFICATION_RETENTION_CRON = '30 3 * * *';
/** Offboarding reconcilers run every 15 minutes so a stuck delete completes promptly, not next day. */
const DEFAULT_OFFBOARDING_RECONCILE_CRON = '*/15 * * * *';
const DEFAULT_SESSION_CLEANUP_CRON = '0 4 * * *';
/** GDPR export artifact purge runs before upload tombstone retention. */
const DEFAULT_USER_DATA_EXPORT_RETENTION_CRON = '44 5 * * *';
/** Tombstone purge order: uploads → organizations → child tombstones → users (FK-safe). */
const DEFAULT_UPLOAD_TOMBSTONE_RETENTION_CRON = '45 5 * * *';
const DEFAULT_ORGANIZATION_TOMBSTONE_RETENTION_CRON = '46 5 * * *';
const DEFAULT_WEBHOOK_TOMBSTONE_RETENTION_CRON = '47 5 * * *';
/** Time-based purge of webhook delivery attempts (audit-#3); off-peak, distinct slot. */
const DEFAULT_WEBHOOK_DELIVERY_ATTEMPT_RETENTION_CRON = '40 3 * * *';
const DEFAULT_ORGANIZATION_NOTIFICATION_POLICY_TOMBSTONE_RETENTION_CRON = '48 5 * * *';
const DEFAULT_MEMBERSHIP_TOMBSTONE_RETENTION_CRON = '50 5 * * *';
/** Daily: invited memberships whose invite expired more than 7 days ago free their seat (launch D84). */
const DEFAULT_MEMBERSHIP_INVITATION_EXPIRY_CRON = '10 4 * * *';
/** Daily erase of deleted app records past each organization's restore window (WC-46, D38). */
const DEFAULT_APP_RECORD_PURGE_CRON = '56 5 * * *';
/** Hourly: a day closes itself within the hour after the day following it ends, in any time zone (WC-39). */
const DEFAULT_DAY_CLOSE_AUTO_CLOSE_SWEEP_CRON = '7 * * * *';
/** Every five minutes: rule tasks open and close, snoozed tasks wake, the app takes its steps (TK4). */
const DEFAULT_TASK_RULES_SWEEP_CRON = '*/5 * * * *';
/** Every five minutes, off the task rules' minute: patients' AI ideas due a refresh (WC-47, D80). */
const DEFAULT_PATIENT_IDEAS_SWEEP_CRON = '2-59/5 * * * *';
/** Launch D77: every minute — a lost enqueue of a message or a callback waits at most a minute. */
const DEFAULT_CONTACT_MESSAGING_SWEEP_CRON = '* * * * *';
/** Launch D77: the stored callbacks' daily purge (30 days), off the hour. */
const DEFAULT_MESSAGING_WEBHOOK_EVENT_RETENTION_CRON = '23 3 * * *';
const DEFAULT_MEMBER_ROLE_TOMBSTONE_RETENTION_CRON = '51 5 * * *';
const DEFAULT_ORGANIZATION_API_KEY_TOMBSTONE_RETENTION_CRON = '52 5 * * *';
const DEFAULT_USER_TOMBSTONE_RETENTION_CRON = '53 5 * * *';
const DEFAULT_IDEMPOTENCY_CARDINALITY_CRON = '*/15 * * * *';
const DEFAULT_DLQ_DEPTH_CRON = '*/15 * * * *';
// Every two minutes: with the 3-minute pending cutoff, an email whose enqueue was lost goes out
// within about five minutes — well inside a sign-in code's 15-minute life.
const DEFAULT_MAIL_OUTBOX_SWEEPER_CRON = '*/2 * * * *';
const DEFAULT_COMMIT_DISPATCH_RECOVERY_CRON = '*/5 * * * *';
/** PENDING upload reconciliation runs hourly (independent of tombstone retention). */
const DEFAULT_UPLOAD_PENDING_SWEEP_CRON = '15 * * * *';
const DEFAULT_STRIPE_WEBHOOK_EVENT_RECLAIM_CRON = '*/5 * * * *';
const DEFAULT_STRIPE_WEBHOOK_EVENT_CATCHUP_CRON = '*/15 * * * *';
// Every five minutes: with the 5-minute stale cutoff, a delivery whose enqueue was lost goes out
// within about ten minutes of Redis taking writes again.
const DEFAULT_WEBHOOK_DELIVERY_RECLAIM_CRON = '*/5 * * * *';
/** Every five minutes, like the other lost-enqueue sweeps: a user is waiting for the export. */
const DEFAULT_USER_DATA_EXPORT_RECLAIM_CRON = '*/5 * * * *';
/** Hourly: lost seat-sync enqueues and lapsed dunning entitlements. */
const DEFAULT_SUBSCRIPTION_SEAT_RECONCILE_CRON = '17 * * * *';
const DEFAULT_STRIPE_WEBHOOK_EVENT_RETENTION_CRON = '0 3 * * *';
const DEFAULT_AUDIT_EXPORT_CRON = '15 2 * * *';

function withSchedulerTimezone({
  timezone,
  job,
}: {
  timezone: string | undefined;
  job: Omit<ScheduledJob, 'timezone'>;
}): ScheduledJob {
  return timezone !== undefined ? { ...job, timezone } : job;
}

function getTombstoneRetentionScheduledJobs(timezone: string | undefined): ScheduledJob[] {
  return [
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: USER_DATA_EXPORT_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-user-data-export-retention',
        jobName: 'purge-expired-user-data-exports',
        // sec-new-Q1: allow operators to override the default schedule via env.
        cronPattern: env.USER_DATA_EXPORT_RETENTION_CRON ?? DEFAULT_USER_DATA_EXPORT_RETENTION_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: UPLOAD_TOMBSTONE_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-upload-tombstone-cleanup',
        jobName: 'purge-old-deleted-uploads',
        cronPattern: env.UPLOAD_TOMBSTONE_RETENTION_CRON ?? DEFAULT_UPLOAD_TOMBSTONE_RETENTION_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: ORGANIZATION_TOMBSTONE_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-organization-tombstone-cleanup',
        jobName: 'purge-old-deleted-organizations',
        cronPattern:
          env.ORGANIZATION_TOMBSTONE_RETENTION_CRON ??
          DEFAULT_ORGANIZATION_TOMBSTONE_RETENTION_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: WEBHOOK_TOMBSTONE_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-webhook-tombstone-cleanup',
        jobName: 'purge-old-deleted-webhooks',
        cronPattern:
          env.WEBHOOK_TOMBSTONE_RETENTION_CRON ?? DEFAULT_WEBHOOK_TOMBSTONE_RETENTION_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: ORGANIZATION_NOTIFICATION_POLICY_TOMBSTONE_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-notification-policy-tombstone-cleanup',
        jobName: 'purge-old-deleted-notification-policies',
        cronPattern:
          env.ORGANIZATION_NOTIFICATION_POLICY_TOMBSTONE_RETENTION_CRON ??
          DEFAULT_ORGANIZATION_NOTIFICATION_POLICY_TOMBSTONE_RETENTION_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: MEMBERSHIP_TOMBSTONE_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-membership-tombstone-cleanup',
        jobName: 'purge-old-deleted-memberships',
        cronPattern:
          env.MEMBERSHIP_TOMBSTONE_RETENTION_CRON ?? DEFAULT_MEMBERSHIP_TOMBSTONE_RETENTION_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: MEMBERSHIP_INVITATION_EXPIRY_QUEUE_NAME,
        schedulerId: 'daily-membership-invitation-expiry',
        jobName: 'end-long-expired-membership-invitations',
        cronPattern: DEFAULT_MEMBERSHIP_INVITATION_EXPIRY_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: APP_RECORD_PURGE_QUEUE_NAME,
        schedulerId: 'daily-app-record-purge',
        jobName: 'purge-deleted-app-records',
        cronPattern: env.APP_RECORD_PURGE_CRON ?? DEFAULT_APP_RECORD_PURGE_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: MEMBER_ROLE_TOMBSTONE_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-member-role-tombstone-cleanup',
        jobName: 'purge-old-deleted-roles',
        cronPattern:
          env.MEMBER_ROLE_TOMBSTONE_RETENTION_CRON ?? DEFAULT_MEMBER_ROLE_TOMBSTONE_RETENTION_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: ORGANIZATION_API_KEY_TOMBSTONE_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-organization-api-key-tombstone-cleanup',
        jobName: 'purge-old-deleted-api-keys',
        cronPattern:
          env.ORGANIZATION_API_KEY_TOMBSTONE_RETENTION_CRON ??
          DEFAULT_ORGANIZATION_API_KEY_TOMBSTONE_RETENTION_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: USER_TOMBSTONE_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-user-tombstone-cleanup',
        jobName: 'purge-old-deleted-users',
        cronPattern: env.USER_TOMBSTONE_RETENTION_CRON ?? DEFAULT_USER_TOMBSTONE_RETENTION_CRON,
      },
    }),
    // audit-#3: time-based purge of webhook delivery attempts (not a tombstone cascade).
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: WEBHOOK_DELIVERY_ATTEMPT_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-webhook-delivery-attempt-retention',
        jobName: 'purge-old-webhook-delivery-attempts',
        cronPattern:
          env.WEBHOOK_DELIVERY_ATTEMPT_RETENTION_CRON ??
          DEFAULT_WEBHOOK_DELIVERY_ATTEMPT_RETENTION_CRON,
      },
    }),
  ];
}

/**
 * The sweeps that recover work a lost enqueue or a missed event left behind — each re-adds what its
 * Postgres rows (or Stripe) say is still owed. Kept apart from the retention crons in
 * {@link getScheduledJobs}.
 */
function getRecoverySweepScheduledJobs(timezone: string | undefined): ScheduledJob[] {
  return [
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: MAIL_OUTBOX_SWEEPER_QUEUE_NAME,
        schedulerId: 'mail-outbox-sweeper',
        jobName: 're-enqueue-stale-pending-mail',
        cronPattern: env.MAIL_OUTBOX_SWEEPER_CRON ?? DEFAULT_MAIL_OUTBOX_SWEEPER_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: UPLOAD_PENDING_SWEEP_QUEUE_NAME,
        schedulerId: 'upload-pending-sweep',
        jobName: 'reconcile-stale-pending-uploads',
        cronPattern: env.UPLOAD_PENDING_SWEEP_CRON ?? DEFAULT_UPLOAD_PENDING_SWEEP_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: STRIPE_WEBHOOK_EVENT_RECLAIM_QUEUE_NAME,
        schedulerId: 'stripe-webhook-event-reclaim',
        jobName: 'reclaim-failed-stripe-webhook-events',
        cronPattern:
          env.STRIPE_WEBHOOK_EVENT_RECLAIM_CRON ?? DEFAULT_STRIPE_WEBHOOK_EVENT_RECLAIM_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: STRIPE_WEBHOOK_EVENT_CATCHUP_QUEUE_NAME,
        schedulerId: 'stripe-webhook-event-catchup',
        jobName: 'catchup-missing-stripe-webhook-events',
        cronPattern:
          env.STRIPE_WEBHOOK_EVENT_CATCHUP_CRON ?? DEFAULT_STRIPE_WEBHOOK_EVENT_CATCHUP_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: SUBSCRIPTION_SEAT_SYNC_QUEUE_NAME,
        schedulerId: 'subscription-seat-reconcile',
        jobName: SUBSCRIPTION_SEAT_RECONCILE_JOB_NAME,
        cronPattern: DEFAULT_SUBSCRIPTION_SEAT_RECONCILE_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: WEBHOOK_DELIVERY_RECLAIM_QUEUE_NAME,
        schedulerId: 'webhook-delivery-reclaim',
        jobName: 're-enqueue-stale-pending-webhook-deliveries',
        cronPattern: DEFAULT_WEBHOOK_DELIVERY_RECLAIM_CRON,
      },
    }),
    // The export queue's lost-enqueue sweep rides the export queue itself (run by its worker).
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: USER_DATA_EXPORT_QUEUE_NAME,
        schedulerId: 'user-data-export-reclaim',
        jobName: USER_DATA_EXPORT_RECLAIM_JOB_NAME,
        cronPattern: DEFAULT_USER_DATA_EXPORT_RECLAIM_CRON,
      },
    }),
  ];
}

/**
 * The app's cross-tenant sweeps: the day auto-close (WC-39), the task rules (TK4), and the
 * messaging sweep and callback purge (D77).
 */
function getAppSweepScheduledJobs(timezone: string | undefined): ScheduledJob[] {
  return [
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME,
        schedulerId: 'hourly-day-close-auto-close-sweep',
        jobName: 'find-days-to-auto-close',
        cronPattern: DEFAULT_DAY_CLOSE_AUTO_CLOSE_SWEEP_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: TASK_RULES_SWEEP_QUEUE_NAME,
        schedulerId: 'task-rules-sweep',
        jobName: 'find-organizations-for-task-rules',
        cronPattern: DEFAULT_TASK_RULES_SWEEP_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: PATIENT_IDEAS_SWEEP_QUEUE_NAME,
        schedulerId: 'patient-ideas-sweep',
        jobName: 'find-organizations-with-stale-ideas',
        cronPattern: DEFAULT_PATIENT_IDEAS_SWEEP_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: CONTACT_MESSAGING_SWEEP_QUEUE_NAME,
        schedulerId: 'contact-messaging-sweep',
        jobName: 'find-organizations-with-unsent-messages',
        cronPattern: DEFAULT_CONTACT_MESSAGING_SWEEP_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: MESSAGING_WEBHOOK_EVENT_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-messaging-webhook-event-retention',
        jobName: 'purge-old-messaging-webhook-events',
        cronPattern: DEFAULT_MESSAGING_WEBHOOK_EVENT_RETENTION_CRON,
      },
    }),
  ];
}

/**
 * The operational samplers and retries: idempotency and dead-letter sampling, the dead-letter retry
 * and the post-commit dispatch recovery — in the order {@link getScheduledJobs} registers them.
 */
function getOperationalSweepScheduledJobs(timezone: string | undefined): ScheduledJob[] {
  return [
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: IDEMPOTENCY_CARDINALITY_QUEUE_NAME,
        schedulerId: 'idempotency-cardinality-quarter-hourly',
        jobName: 'sample-idempotency-cardinality',
        cronPattern: env.IDEMPOTENCY_CARDINALITY_CRON ?? DEFAULT_IDEMPOTENCY_CARDINALITY_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: DLQ_DEPTH_QUEUE_NAME,
        schedulerId: 'dlq-depth-quarter-hourly',
        jobName: 'sample-dlq-depth',
        cronPattern: env.DLQ_DEPTH_CRON ?? DEFAULT_DLQ_DEPTH_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: DLQ_AUTO_RETRY_QUEUE_NAME,
        schedulerId: 'dlq-auto-retry',
        jobName: 'auto-retry-dead-letter-jobs',
        cronPattern: env.DLQ_AUTO_RETRY_CRON ?? DEFAULT_DLQ_AUTO_RETRY_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: COMMIT_DISPATCH_RECOVERY_QUEUE_NAME,
        schedulerId: 'commit-dispatch-recovery',
        jobName: 'replay-stale-commit-dispatch',
        // sec-new-Q1: allow operators to override the default schedule via env.
        cronPattern: env.COMMIT_DISPATCH_RECOVERY_CRON ?? DEFAULT_COMMIT_DISPATCH_RECOVERY_CRON,
      },
    }),
  ];
}

/**
 * Canonical list of repeatable cleanup jobs (queue identity from domain constants).
 */
export function getScheduledJobs(): ScheduledJob[] {
  const schedulerTimezone = env.SCHEDULER_TIMEZONE;
  const timezone =
    schedulerTimezone !== undefined && schedulerTimezone.length > 0 ? schedulerTimezone : undefined;

  return [
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: AUDIT_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-audit-cleanup',
        jobName: 'cleanup-old-logs',
        cronPattern: env.AUDIT_RETENTION_CRON ?? DEFAULT_AUDIT_RETENTION_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: AUDIT_OUTBOX_DRAIN_QUEUE_NAME,
        schedulerId: 'audit-outbox-drain',
        jobName: 'drain-pending-audit-outbox',
        cronPattern: env.AUDIT_OUTBOX_DRAIN_CRON ?? DEFAULT_AUDIT_OUTBOX_DRAIN_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: NOTIFICATION_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-notification-retention',
        jobName: 'purge-old-notifications',
        cronPattern: env.NOTIFICATION_RETENTION_CRON ?? DEFAULT_NOTIFICATION_RETENTION_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: SESSION_CLEANUP_QUEUE_NAME,
        schedulerId: 'daily-session-cleanup',
        jobName: 'cleanup-sessions',
        cronPattern: env.AUTH_SESSION_CLEANUP_CRON ?? DEFAULT_SESSION_CLEANUP_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: USER_OFFBOARDING_RECONCILE_QUEUE_NAME,
        schedulerId: 'user-offboarding-reconcile',
        jobName: 'reconcile-stuck-user-offboardings',
        cronPattern: DEFAULT_OFFBOARDING_RECONCILE_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: ORGANIZATION_OFFBOARDING_RECONCILE_QUEUE_NAME,
        schedulerId: 'organization-offboarding-reconcile',
        jobName: 'reconcile-stuck-organization-offboardings',
        cronPattern: DEFAULT_OFFBOARDING_RECONCILE_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: STRIPE_WEBHOOK_EVENT_RETENTION_QUEUE_NAME,
        schedulerId: 'daily-stripe-webhook-event-cleanup',
        jobName: 'purge-old-stripe-webhook-events',
        cronPattern:
          env.STRIPE_WEBHOOK_EVENT_RETENTION_CRON ?? DEFAULT_STRIPE_WEBHOOK_EVENT_RETENTION_CRON,
      },
    }),
    withSchedulerTimezone({
      timezone,
      job: {
        queueName: AUDIT_EXPORT_QUEUE_NAME,
        schedulerId: 'daily-audit-export',
        jobName: 'export-audit-logs-s3',
        cronPattern: env.AUDIT_EXPORT_CRON ?? DEFAULT_AUDIT_EXPORT_CRON,
      },
    }),
    ...getTombstoneRetentionScheduledJobs(timezone),
    ...getOperationalSweepScheduledJobs(timezone),
    ...getAppSweepScheduledJobs(timezone),
    ...getRecoverySweepScheduledJobs(timezone),
  ];
}

/**
 * sec-Q1: bounded retention for cron-driven queues. The event-driven queues
 * already set similar `defaultJobOptions`; without this, minute-cadence
 * crons grew Redis indefinitely. Numbers chosen to leave enough recent
 * history for debugging while staying inside maxmemory on a small shared
 * instance.
 */
const SCHEDULED_QUEUE_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { count: 100, age: SEVEN_DAYS_SECONDS },
  removeOnFail: { count: 200, age: SEVEN_DAYS_SECONDS },
} as const;

/**
 * Options for {@link registerScheduledJobs}. Used by split worker services to avoid
 * registering cron schedules for queues whose worker is not running in this process —
 * otherwise BullMQ would enqueue jobs nobody picks up.
 */
export type RegisterScheduledJobsOptions = {
  /**
   * When set, only registers cron schedulers for queues that have an active worker in this
   * process (split worker services). Omit to register every canonical scheduled job.
   */
  readonly activeQueueNames?: ReadonlySet<string>;
};

/**
 * Removes orphan job schedulers from Redis — any scheduler whose id is not in the canonical set
 * for its queue is a rename or removal residue that BullMQ would otherwise keep firing forever.
 * Each queue is opened and closed in its own `try/finally`. Extracted from
 * {@link registerScheduledJobs} to keep that function's cognitive complexity within budget.
 */
async function reconcileOrphanSchedulers(options: {
  connection: ReturnType<typeof getBullMQConnectionOptions>;
  canonicalSchedulerIdsByQueueName: ReadonlyMap<string, Set<string>>;
}): Promise<void> {
  const { connection, canonicalSchedulerIdsByQueueName } = options;
  for (const [queueName, canonicalIds] of canonicalSchedulerIdsByQueueName) {
    const queueForReconcile = new Queue(queueName, {
      connection,
      prefix: getBullMQKeyPrefix(),
      defaultJobOptions: SCHEDULED_QUEUE_DEFAULT_JOB_OPTIONS,
    });
    try {
      // getJobSchedulers takes pagination args; first 1000 schedulers per queue is
      // far above any realistic count for this app.
      const existingSchedulers = await queueForReconcile.getJobSchedulers(0, 1000);
      if (existingSchedulers.length >= 1000) {
        // Orphan reconciliation only sees the first page; at the cap it may silently miss orphans.
        logger.error(
          { queueName, count: existingSchedulers.length },
          'scheduler.reconcile.page_limit_reached',
        );
      }
      for (const existing of existingSchedulers) {
        if (!canonicalIds.has(existing.key)) {
          await queueForReconcile.removeJobScheduler(existing.key);
          logger.warn({ queueName, schedulerId: existing.key }, 'scheduler.orphan.removed');
        }
      }
    } finally {
      await queueForReconcile.close();
    }
  }
}

/**
 * Registers repeatable jobs with BullMQ. With SCHEDULER_ENABLED false it registers nothing and
 * warns (`scheduler.disabled.crons_not_registered`) when this process runs queues that have crons.
 */
export async function registerScheduledJobs(
  options: RegisterScheduledJobsOptions = {},
): Promise<SchedulerHandle> {
  const allJobs = getScheduledJobs();
  const jobs =
    options.activeQueueNames === undefined
      ? allJobs
      : allJobs.filter((job) => options.activeQueueNames?.has(job.queueName));

  if (!env.SCHEDULER_ENABLED) {
    // Each process registers only the crons of its own queues, so a worker that runs these queues
    // with the scheduler off leaves their crons unregistered unless another scheduler-enabled
    // process runs the same families — the sweeps that recover lost work (mail outbox, Stripe
    // reclaim, webhook reclaim) then never run.
    if (jobs.length > 0) {
      logger.warn(
        { queueNames: jobs.map((job) => job.queueName) },
        'scheduler.disabled.crons_not_registered',
      );
    } else {
      logger.info('scheduler.disabled');
    }
    return {
      close: async () => {},
    };
  }

  const connection = getBullMQConnectionOptions();
  const queues: Queue[] = [];

  // Group canonical scheduler ids by queue name so the reconciliation step can drop any
  // schedulers in Redis whose id is no longer in the canonical set. Without this, a rename
  // (or removal) of a `schedulerId` leaves the OLD scheduler firing in Redis forever
  // alongside the new one — the in-code registry audit never reads Redis state and would
  // not detect it.
  const canonicalSchedulerIdsByQueueName = new Map<string, Set<string>>();
  for (const job of jobs) {
    const existing = canonicalSchedulerIdsByQueueName.get(job.queueName);
    if (existing) {
      existing.add(job.schedulerId);
    } else {
      canonicalSchedulerIdsByQueueName.set(job.queueName, new Set([job.schedulerId]));
    }
  }

  try {
    for (const job of jobs) {
      // sec-Q1: bounded retention on cron-driven queues. Without this,
      // every cron queue piling completed/failed jobs forever grows
      // Redis indefinitely and eventually exhausts maxmemory on a shared
      // cache+BullMQ instance.
      const queue = new Queue(job.queueName, {
        connection,
        prefix: getBullMQKeyPrefix(),
        defaultJobOptions: SCHEDULED_QUEUE_DEFAULT_JOB_OPTIONS,
      });
      queues.push(queue);
      await queue.upsertJobScheduler(
        job.schedulerId,
        {
          pattern: job.cronPattern,
          ...(job.timezone !== undefined ? { tz: job.timezone } : {}),
        },
        { name: job.jobName, opts: SCHEDULED_QUEUE_DEFAULT_JOB_OPTIONS },
      );
      logger.info(
        {
          queueName: job.queueName,
          cronPattern: job.cronPattern,
          timezone: job.timezone ?? null,
        },
        'scheduler.job.registered',
      );
    }

    // Drop orphan schedulers — any Redis scheduler whose id is not in the canonical set
    // for its queue is a rename or removal residue, and BullMQ will otherwise keep firing
    // it forever (doubling cron rate after rename, firing into a worker-less queue after
    // removal). Inside the try so a failure still closes the registration queues below.
    await reconcileOrphanSchedulers({ connection, canonicalSchedulerIdsByQueueName });
  } finally {
    // The schedulers live in Redis and the workers run them; nothing needs these queues once
    // they are registered. Kept open, they held one Redis connection per cron queue — 26 — for
    // the life of the process.
    await Promise.allSettled(queues.map((queue) => queue.close()));
  }

  return {
    close: async () => {},
  };
}
