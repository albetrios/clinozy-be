import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

/** A side effect deferred until the database work that requested it has committed. */
export type OnCommitTask = () => Promise<void>;

/** The tasks waiting for the current scope's commit. */
export interface OnCommitQueue {
  tasks: OnCommitTask[];
}

const onCommitStorage = new AsyncLocalStorage<OnCommitQueue>();

/** The active on-commit queue, or `undefined` outside every scope. */
export function getOnCommitQueue(): OnCommitQueue | undefined {
  return onCommitStorage.getStore();
}

/** The active on-commit queue, entering a fresh one for this async context when none is active. */
export function getOrCreateOnCommitQueue(): OnCommitQueue {
  const existing = onCommitStorage.getStore();
  if (existing !== undefined) {
    return existing;
  }
  const queue: OnCommitQueue = { tasks: [] };
  onCommitStorage.enterWith(queue);
  return queue;
}

/** Runs `callback` with an isolated onCommit task queue (HTTP request scope). */
export function runWithOnCommitScope<T>(callback: () => Promise<T>): Promise<T> {
  return onCommitStorage.run({ tasks: [] }, callback);
}

/** Pins an empty onCommit queue for the current HTTP request (call from `onRequest`). */
export function enterOnCommitScope(): void {
  onCommitStorage.enterWith({ tasks: [] });
}

/**
 * Runs one unit of database work (a transaction or a savepoint) so the after-commit tasks it
 * registers survive only if it succeeds.
 *
 * @remarks
 * - **Algorithm:** `callback` runs with its own queue. When it resolves — its transaction has
 *   committed, or its savepoint was released — the tasks move to the enclosing queue (the HTTP
 *   request's, flushed in `onResponse`) or, with no enclosing scope (a worker, a script), run now.
 *   When it rejects, they are dropped.
 * - **Why:** otherwise a task registered by work that later rolled back would still run — a
 *   delivery job for a webhook attempt that was never committed.
 * - **Failure modes:** rethrows `callback`'s error. A task that fails while running here is logged
 *   and the rest still run, as in `flushOnCommit`.
 * - **Side effects:** none beyond moving or running the unit's tasks.
 */
export async function runInCommitUnit<T>(callback: () => Promise<T>): Promise<T> {
  const enclosing = onCommitStorage.getStore();
  const unit: OnCommitQueue = { tasks: [] };
  const result = await onCommitStorage.run(unit, callback);
  if (enclosing === undefined) {
    for (const task of unit.tasks) {
      try {
        await task();
      } catch (error) {
        logger.error({ error }, 'event-bus.on-commit.task.failed');
      }
    }
  } else {
    enclosing.tasks.push(...unit.tasks);
  }
  return result;
}
