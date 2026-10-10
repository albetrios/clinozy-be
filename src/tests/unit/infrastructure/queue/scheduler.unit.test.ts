import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  upsertJobSchedulerMock,
  queueCloseMock,
  getJobSchedulersMock,
  removeJobSchedulerMock,
  loggerMock,
} = vi.hoisted(() => ({
  upsertJobSchedulerMock: vi.fn().mockResolvedValue(undefined),
  queueCloseMock: vi.fn().mockResolvedValue(undefined),
  // sec-Q: scheduler reconciliation reads existing schedulers from Redis and drops any
  // whose id is no longer in the canonical set (orphan rename/removal residue).
  getJobSchedulersMock: vi.fn().mockResolvedValue([]),
  removeJobSchedulerMock: vi.fn().mockResolvedValue(true),
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    upsertJobScheduler = upsertJobSchedulerMock;
    close = queueCloseMock;
    getJobSchedulers = getJobSchedulersMock;
    removeJobScheduler = removeJobSchedulerMock;
  },
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({ logger: loggerMock }));

const TOMBSTONE_QUEUE_ORDER = [
  'upload-tombstone-retention',
  'organization-tombstone-retention',
  'webhook-tombstone-retention',
  'organization-notification-policy-tombstone-retention',
  'membership-tombstone-retention',
  'member-role-tombstone-retention',
  'organization-api-key-tombstone-retention',
  'user-tombstone-retention',
] as const;

describe('infrastructure queue scheduler', () => {
  beforeEach(() => {
    upsertJobSchedulerMock.mockClear();
    queueCloseMock.mockClear();
    getJobSchedulersMock.mockClear().mockResolvedValue([]);
    removeJobSchedulerMock.mockClear().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('getScheduledJobs returns audit, session, stripe retention, audit export, tombstone retention, membership invitation expiry, app record purge, idempotency, dlq depth, mail sweeper, upload pending sweep, stripe reclaim, day auto-close sweep, task rules sweep, patient ideas sweep, messaging sweep and purge, webhook delivery reclaim, and audit-outbox drain jobs', async () => {
    const { getScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');
    const scheduledJobs = getScheduledJobs();
    expect(scheduledJobs).toHaveLength(34);
    expect(scheduledJobs.map((job) => job.queueName)).toEqual([
      'audit-retention',
      'audit-outbox-drain',
      'notification-retention',
      'session-cleanup',
      'user-offboarding-reconcile',
      'organization-offboarding-reconcile',
      'stripe-webhook-event-retention',
      'audit-export',
      'user-data-export-retention',
      ...TOMBSTONE_QUEUE_ORDER.slice(0, 5),
      // D84: invited memberships 7 days past their invitation's expiry free their seat
      'membership-invitation-expiry',
      // WC-46: the deleted-record purge, between the membership and role tombstones
      'app-record-purge',
      ...TOMBSTONE_QUEUE_ORDER.slice(5),
      'webhook-delivery-attempt-retention',
      'idempotency-cardinality',
      'dlq-depth',
      'dlq-auto-retry',
      'commit-dispatch-recovery',
      'mail-outbox-sweeper',
      'upload-pending-sweep',
      'stripe-webhook-event-reclaim',
      'stripe-webhook-event-catchup',
      // WC-39: the hourly day auto-close sweep
      'day-close-auto-close-sweep',
      // TK4: the five-minute task rules sweep
      'task-rules-sweep',
      // D80: the five-minute AI ideas sweep
      'patient-ideas-sweep',
      // D77: the one-minute messaging sweep and the callbacks' daily purge
      'contact-messaging-sweep',
      'messaging-webhook-event-retention',
      'webhook-delivery-reclaim',
    ]);
  });

  it('tombstone retention jobs run in FK-safe order (uploads before organizations before users)', async () => {
    const { getScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');
    const scheduledJobs = getScheduledJobs();
    const tombstoneQueues = scheduledJobs
      .map((job) => job.queueName)
      .filter((name) => name.endsWith('-tombstone-retention'));
    expect(tombstoneQueues).toEqual([...TOMBSTONE_QUEUE_ORDER]);
    const uploadIndex = tombstoneQueues.indexOf('upload-tombstone-retention');
    const organizationIndex = tombstoneQueues.indexOf('organization-tombstone-retention');
    const userIndex = tombstoneQueues.indexOf('user-tombstone-retention');
    expect(uploadIndex).toBeLessThan(organizationIndex);
    expect(organizationIndex).toBeLessThan(userIndex);
  });

  it('getScheduledJobs honors AUDIT_RETENTION_CRON from the environment', async () => {
    vi.stubEnv('AUDIT_RETENTION_CRON', '*/7 * * * *');
    const { getScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');
    const scheduledJobs = getScheduledJobs();
    expect(scheduledJobs.find((job) => job.queueName === 'audit-retention')?.cronPattern).toBe(
      '*/7 * * * *',
    );
  });

  it('sec-new-Q1: getScheduledJobs honors USER_DATA_EXPORT_RETENTION_CRON from the environment', async () => {
    vi.stubEnv('USER_DATA_EXPORT_RETENTION_CRON', '*/9 * * * *');
    const { getScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');
    const scheduledJobs = getScheduledJobs();
    expect(
      scheduledJobs.find((job) => job.queueName === 'user-data-export-retention')?.cronPattern,
    ).toBe('*/9 * * * *');
  });

  it('sec-new-Q1: getScheduledJobs honors COMMIT_DISPATCH_RECOVERY_CRON from the environment', async () => {
    vi.stubEnv('COMMIT_DISPATCH_RECOVERY_CRON', '*/11 * * * *');
    const { getScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');
    const scheduledJobs = getScheduledJobs();
    expect(
      scheduledJobs.find((job) => job.queueName === 'commit-dispatch-recovery')?.cronPattern,
    ).toBe('*/11 * * * *');
  });

  it('registerScheduledJobs registers only active queue names when filtered', async () => {
    vi.stubEnv('SCHEDULER_ENABLED', 'true');
    const { registerScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');

    await registerScheduledJobs({
      activeQueueNames: new Set(['mail-outbox-sweeper', 'audit-retention']),
    });

    expect(upsertJobSchedulerMock).toHaveBeenCalledTimes(2);
    const registeredQueues = upsertJobSchedulerMock.mock.calls.map((_call, index) => index);
    expect(registeredQueues).toHaveLength(2);
  });

  it('getScheduledJobs sets timezone on each job when SCHEDULER_TIMEZONE is set', async () => {
    vi.stubEnv('SCHEDULER_TIMEZONE', 'America/New_York');
    const { getScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');
    const scheduledJobs = getScheduledJobs();
    for (const job of scheduledJobs) {
      expect(job.timezone).toBe('America/New_York');
    }
  });

  it('registerScheduledJobs registers one repeatable job per cleanup queue when enabled', async () => {
    const { registerScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');
    const schedulerHandle = await registerScheduledJobs();
    expect(upsertJobSchedulerMock).toHaveBeenCalledTimes(34);
    // Each scheduled job opens one Queue for upsert (34) + the reconcile pass opens one Queue per
    // unique queue name (34), each closed in its own loop iteration. The 34 upsert queues are
    // closed as soon as registration ends — not held open for the life of the process.
    expect(queueCloseMock).toHaveBeenCalledTimes(68);
    await schedulerHandle.close();
    expect(queueCloseMock).toHaveBeenCalledTimes(68);
  });

  it('registerScheduledJobs does not instantiate queues when SCHEDULER_ENABLED is false', async () => {
    vi.stubEnv('SCHEDULER_ENABLED', 'false');
    const { registerScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');
    const schedulerHandle = await registerScheduledJobs();
    expect(upsertJobSchedulerMock).not.toHaveBeenCalled();
    expect(queueCloseMock).not.toHaveBeenCalled();
    await schedulerHandle.close();
  });

  // A split worker service running with the scheduler off registers none of its queues' crons, and
  // no other process registers them for it: the mail outbox sweeper and the Stripe and webhook
  // reclaims then never run — silently, until lost work piles up.
  it('warns with the crons it leaves unregistered when the scheduler is off in a process that runs them', async () => {
    vi.stubEnv('SCHEDULER_ENABLED', 'false');
    loggerMock.warn.mockClear();
    const { registerScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');

    await registerScheduledJobs({
      activeQueueNames: new Set(['mail', 'mail-outbox-sweeper', 'webhook-delivery-reclaim']),
    });

    expect(upsertJobSchedulerMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { queueNames: ['mail-outbox-sweeper', 'webhook-delivery-reclaim'] },
      'scheduler.disabled.crons_not_registered',
    );
  });

  it('stays quiet with the scheduler off in a process that runs no cron queue', async () => {
    vi.stubEnv('SCHEDULER_ENABLED', 'false');
    loggerMock.warn.mockClear();
    loggerMock.info.mockClear();
    const { registerScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');

    await registerScheduledJobs({ activeQueueNames: new Set(['mail', 'webhook-delivery']) });

    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith('scheduler.disabled');
  });

  it('registerScheduledJobs removes orphan schedulers whose id is not in the canonical set (sec-Q)', async () => {
    // A `schedulerId` rename or queue removal leaves the stale scheduler in Redis. Without
    // reconciliation, BullMQ keeps firing it forever — doubling cron rate after rename, or
    // firing into a worker-less queue after removal. The audit at boot only diffs in-code
    // state and would not detect this; the registry MUST read Redis state and drop orphans.
    getJobSchedulersMock.mockResolvedValue([
      { key: 'orphan-scheduler-id', name: 'orphan-job' },
      // A canonical id mixed in to verify it is NOT removed.
      { key: 'daily-audit-cleanup', name: 'audit-cleanup' },
    ]);

    const { registerScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');
    await registerScheduledJobs({
      activeQueueNames: new Set(['audit-retention']),
    });

    // Only the orphan is dropped, never a canonical scheduler.
    expect(removeJobSchedulerMock).toHaveBeenCalledWith('orphan-scheduler-id');
    expect(removeJobSchedulerMock).not.toHaveBeenCalledWith('daily-audit-cleanup');
  });

  it('alerts when the orphan-reconcile page hits the 1000-scheduler cap (EX-29)', async () => {
    // At the page cap the reconcile only sees the first 1000 schedulers and may silently miss
    // orphans beyond it — that degradation must be observable, not silent.
    loggerMock.error.mockClear();
    getJobSchedulersMock.mockResolvedValue(
      Array.from({ length: 1000 }, (_unused, index) => ({ key: `s${index}`, name: 'job' })),
    );

    const { registerScheduledJobs } = await import('@/infrastructure/queue/scheduler.js');
    await registerScheduledJobs({ activeQueueNames: new Set(['audit-retention']) });

    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1000 }),
      'scheduler.reconcile.page_limit_reached',
    );
  });
});
