import {
  getOnCommitQueue,
  getOrCreateOnCommitQueue,
  type OnCommitTask,
} from '@/core/events/on-commit-scope.js';
import {
  acknowledgeCommitDispatchTask,
  appendCommitDispatchTask,
  consumeCommitDispatchTasks,
} from '@/infrastructure/queue/commit-dispatch/commit-dispatch.store.js';
import { executeCommitDispatchTask } from '@/infrastructure/queue/commit-dispatch/commit-dispatch.executor.js';
import type { CommitDispatchTask } from '@/infrastructure/queue/commit-dispatch/commit-dispatch.types.js';
import { captureException } from '@/infrastructure/observability/sentry/sentry.js';
import {
  recordCommitDispatchDurabilityFallback,
  recordEventBusHandlerFailure,
} from '@/infrastructure/observability/metrics/prometheus-metrics.js';
import { MAX_CONCURRENT_ON_COMMIT_TASKS } from '@/shared/constants/limits.constants.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/**
 * Envelope for an in-process domain event published through {@link eventBus}.
 * Handlers receive the event verbatim; downstream BullMQ jobs receive the
 * payload plus `requestId` for log correlation across the async boundary.
 */
export interface DomainEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
  timestamp: Date;
  /** HTTP request id when the event originated from an API request (propagated to async jobs). */
  requestId?: string;
}

/** Builds a domain event without assigning `undefined` to optional fields. */
export function buildDomainEvent<TPayload>({
  type,
  payload,
  options,
}: {
  type: string;
  payload: TPayload;
  options?: { timestamp?: Date; requestId?: string } | undefined;
}): DomainEvent<TPayload> {
  const event: DomainEvent<TPayload> = {
    type,
    payload,
    timestamp: options?.timestamp ?? new Date(),
  };
  const requestId = options?.requestId;
  if (requestId !== undefined) {
    event.requestId = requestId;
  }
  return event;
}

/**
 * Async function registered with {@link EventBus.on}. Failures are logged but
 * never propagate — the bus catches and swallows handler errors so an
 * in-process side effect cannot fail the originating HTTP request.
 */
export type EventHandler<TPayload = unknown> = (event: DomainEvent<TPayload>) => Promise<void>;

export { enterOnCommitScope, runWithOnCommitScope } from '@/core/events/on-commit-scope.js';

const pendingCommitDispatchRequestIds = new Set<string>();

/**
 * In-process publish-subscribe bus for domain events. One singleton instance
 * (`eventBus`) is exported below; services emit through it and handlers
 * registered at startup react. Handler errors are caught and logged so a
 * failing handler cannot bubble up and fail the originating HTTP request.
 *
 * Pairs with `onCommit` / `flushOnCommit` for the transactional-outbox
 * pattern: side effects (BullMQ enqueues) wait until the surrounding HTTP
 * transaction commits before they fire.
 */
export class EventBus {
  private readonly handlers: Map<string, EventHandler[]> = new Map();

  on({ eventType, handler }: { eventType: string; handler: EventHandler }): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  /**
   * Schedules work to run in the HTTP request's `onResponse` — every unit of work in the
   * request has committed by then. Used by transactional outbox handlers to dispatch
   * BullMQ jobs only after the outbox row is durable.
   *
   * Prefer {@link scheduleCommitDispatch} for production HTTP paths — it persists
   * serializable tasks to Redis immediately so a process crash cannot drop side effects.
   */
  onCommit(task: OnCommitTask): void {
    getOrCreateOnCommitQueue().tasks.push(task);
  }

  /**
   * Runs durable Redis-backed tasks for `requestId`, then any in-memory tasks queued via
   * `onCommit` for the current async context. Called from the request `onResponse` hook, after
   * every unit of work has committed.
   */
  async flushOnCommit(options?: { requestId?: string }): Promise<void> {
    const requestId = options?.requestId;
    if (requestId !== undefined && pendingCommitDispatchRequestIds.has(requestId)) {
      pendingCommitDispatchRequestIds.delete(requestId);
      try {
        const durableTasks = await consumeCommitDispatchTasks({ requestId });
        for (const { task, raw } of durableTasks) {
          try {
            await executeCommitDispatchTask(task);
            // reaudit-#2: remove the durable entry ONLY after the side effect succeeded, so a
            // crash mid-batch leaves un-executed tasks for the recovery sweeper (never lost).
            await acknowledgeCommitDispatchTask({ requestId, raw });
          } catch (error) {
            logger.error({ error, requestId, task }, 'event-bus.commit-dispatch.task.failed');
            captureException({
              error,
              context: { requestId, tags: { source: 'event-bus.commit-dispatch' } },
            });
          }
        }
      } catch (error) {
        logger.warn({ error, requestId }, 'commit-dispatch.consume_failed');
      }
    }

    const queue = getOnCommitQueue();
    if (queue === undefined || queue.tasks.length === 0) return;
    const tasks = queue.tasks.splice(0, queue.tasks.length);
    // Bounded fan-out: a task that touches the database opens its own scoped context, and so its
    // own pooled connection. Dispatching the whole queue at once made one request's connection
    // demand equal its task count, multiplying to `requests x tasks-per-request` under load.
    // Workers pull from a shared cursor so a long task cannot stall the others.
    let nextTaskIndex = 0;
    const runTasksSequentially = async (): Promise<void> => {
      while (nextTaskIndex < tasks.length) {
        const task = tasks[nextTaskIndex++];
        if (task === undefined) return;
        try {
          await task();
        } catch (error) {
          logger.error({ error }, 'event-bus.on-commit.task.failed');
          captureException({ error, context: { tags: { source: 'event-bus.on-commit' } } });
        }
      }
    };
    const workerCount = Math.min(tasks.length, MAX_CONCURRENT_ON_COMMIT_TASKS);
    await Promise.all(Array.from({ length: workerCount }, runTasksSequentially));
  }

  async emit(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    if (handlers.length === 0) return;

    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          logger.error({ eventType: event.type, error }, 'Domain event handler failed');
          captureException({
            error,
            context: { tags: { source: 'event-bus.emit', eventType: event.type } },
          });
          // Per-event failure counter: emit swallows handler errors by design (a failed email must
          // not fail the HTTP request), so this metric is the only rate signal for a handler that
          // fails persistently. Critical side effects use emitStrict instead (propagates the error).
          recordEventBusHandlerFailure(event.type);
        }
      }),
    );
  }

  /**
   * Like {@link emit} but propagates the first handler failure to the caller.
   * Used for auth recovery/login email paths where a silent handler failure
   * must not return success to the client.
   */
  async emitStrict(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    if (handlers.length === 0) return;

    const errors: unknown[] = [];
    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          errors.push(error);
          logger.error({ eventType: event.type, error }, 'Domain event handler failed');
        }
      }),
    );
    if (errors.length > 0) {
      throw errors[0];
    }
  }
}

/**
 * Process-wide {@link EventBus} singleton. Services import this directly to
 * emit; handlers are registered against it at startup by
 * {@link registerEventHandlers} and the per-domain container registrations.
 */
export const eventBus = new EventBus();

/** Optional HTTP request id for {@link scheduleCommitDispatch} durable Redis persistence. */
export interface ScheduleCommitDispatchOptions {
  requestId?: string;
}

/**
 * Schedules a serializable post-commit side effect.
 *
 * @remarks
 * - **Algorithm:** when `requestId` is set, RPUSH JSON to Redis immediately (durable, recovered by
 *   the commit-dispatch sweeper if the request dies after commit); otherwise queue in-memory for flush.
 * - **Durability contract:** the Redis path is crash-safe; the in-memory `onCommit` path is NOT. A
 *   Redis append failure therefore *degrades* durability — the task survives only if the process
 *   lives long enough to flush. That degradation is surfaced as a high-severity alert (Sentry +
 *   `commit_dispatch_durability_fallbacks_total`) rather than a silent warn, so a Redis outage that
 *   is quietly dropping post-commit side effects is observable.
 * - **Failure modes:** Redis append failure falls back to in-memory onCommit (not crash-safe) and alerts.
 * - **Side effects:** may write Redis keys; execution deferred until {@link EventBus.flushOnCommit}.
 * - **Notes:** task payloads must stay secret-free — identifiers only.
 */
export async function scheduleCommitDispatch({
  task,
  options,
}: {
  task: CommitDispatchTask;
  options?: ScheduleCommitDispatchOptions | undefined;
}): Promise<void> {
  const requestId = options?.requestId;
  if (requestId !== undefined) {
    try {
      await appendCommitDispatchTask({ requestId, task });
      pendingCommitDispatchRequestIds.add(requestId);
      return;
    } catch (error) {
      // Durability degradation — escalate beyond a warn log: the side effect is no longer crash-safe.
      logger.error(
        { error, requestId, taskType: task.type },
        'commit-dispatch.append_failed.fallback_to_memory',
      );
      captureException({
        error,
        context: {
          tags: { source: 'event-bus.commit-dispatch', taskType: task.type },
        },
      });
      recordCommitDispatchDurabilityFallback();
    }
  }
  eventBus.onCommit(() => executeCommitDispatchTask(task));
}

/**
 * Defers `callback` until the database work that requested it has committed: inside a unit of work
 * (every `withAppDatabaseContext` / `withMaintenanceDatabaseContext` transaction and every
 * `withSavepoint`) it runs once that unit commits — over HTTP from the request's `onResponse`
 * flush, in a worker right after the commit — and never if the unit rolls back. Outside every unit
 * and scope (a script) it runs immediately.
 */
export async function runEnqueueAfterCommit(callback: OnCommitTask): Promise<void> {
  if (getOnCommitQueue() === undefined) {
    await callback();
    return;
  }
  eventBus.onCommit(callback);
}

/** Clears in-process pending markers — test harness only. */
export function resetCommitDispatchPendingStateForTests(): void {
  pendingCommitDispatchRequestIds.clear();
}
