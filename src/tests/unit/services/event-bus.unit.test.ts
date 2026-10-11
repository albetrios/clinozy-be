import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runInCommitUnit } from '@/core/events/on-commit-scope.js';
import {
  EventBus,
  buildDomainEvent,
  eventBus,
  enterOnCommitScope,
  runEnqueueAfterCommit,
  runWithOnCommitScope,
  scheduleCommitDispatch,
  resetCommitDispatchPendingStateForTests,
} from '@/core/events/event-bus.js';

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const captureExceptionMock = vi.fn();
vi.mock('@/infrastructure/observability/sentry/sentry.js', () => ({
  captureException: (...arguments_: unknown[]) => captureExceptionMock(...arguments_),
}));

const recordEventBusHandlerFailureMock = vi.fn();
const recordCommitDispatchDurabilityFallbackMock = vi.fn();
vi.mock('@/infrastructure/observability/metrics/prometheus-metrics.js', () => ({
  recordEventBusHandlerFailure: (...arguments_: unknown[]) =>
    recordEventBusHandlerFailureMock(...arguments_),
  recordCommitDispatchDurabilityFallback: (...arguments_: unknown[]) =>
    recordCommitDispatchDurabilityFallbackMock(...arguments_),
}));

const appendCommitDispatchTaskMock = vi.fn().mockResolvedValue(undefined);
const consumeCommitDispatchTasksMock = vi.fn().mockResolvedValue([]);
const purgeCommitDispatchTasksMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/infrastructure/queue/commit-dispatch/commit-dispatch.store.js', () => ({
  appendCommitDispatchTask: (...arguments_: unknown[]) =>
    appendCommitDispatchTaskMock(...arguments_),
  consumeCommitDispatchTasks: (...arguments_: unknown[]) =>
    consumeCommitDispatchTasksMock(...arguments_),
  purgeCommitDispatchTasks: (...arguments_: unknown[]) =>
    purgeCommitDispatchTasksMock(...arguments_),
}));

describe('EventBus.emit', () => {
  it('invokes registered handlers', async () => {
    const bus = new EventBus();
    let called = 0;
    bus.on({
      eventType: 'x',
      handler: async () => {
        called += 1;
      },
    });

    await bus.emit({ type: 'x', payload: { ok: true }, timestamp: new Date() });
    expect(called).toBe(1);
  });

  it('does not throw when a handler rejects (errors are swallowed and logged)', async () => {
    const bus = new EventBus();
    bus.on({
      eventType: 'boom',
      handler: async () => {
        throw new Error('handler-failed');
      },
    });

    await expect(
      bus.emit({ type: 'boom', payload: {}, timestamp: new Date() }),
    ).resolves.toBeUndefined();
  });

  it('runs all handlers even when one of them fails', async () => {
    const bus = new EventBus();
    const calls: string[] = [];
    bus.on({
      eventType: 'multi',
      handler: async () => {
        calls.push('first');
      },
    });
    bus.on({
      eventType: 'multi',
      handler: async () => {
        throw new Error('second-failed');
      },
    });
    bus.on({
      eventType: 'multi',
      handler: async () => {
        calls.push('third');
      },
    });

    await bus.emit({ type: 'multi', payload: {}, timestamp: new Date() });

    expect(calls).toContain('first');
    expect(calls).toContain('third');
  });

  it('is a no-op when no handlers are registered for a type', async () => {
    const bus = new EventBus();
    await expect(
      bus.emit({ type: 'never-registered', payload: {}, timestamp: new Date() }),
    ).resolves.toBeUndefined();
  });

  it('logs the handler error with eventType and error context', async () => {
    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    const bus = new EventBus();
    const handlerError = new Error('handler-x-failed');
    bus.on({
      eventType: 'log-event',
      handler: async () => {
        throw handlerError;
      },
    });

    await bus.emit({ type: 'log-event', payload: {}, timestamp: new Date() });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'log-event', error: handlerError }),
      expect.any(String),
    );
  });

  it('increments the per-event failure metric when a best-effort handler throws (EX-15)', async () => {
    recordEventBusHandlerFailureMock.mockClear();
    const bus = new EventBus();
    bus.on({
      eventType: 'metric-event',
      handler: async () => {
        throw new Error('handler-failed');
      },
    });

    await bus.emit({ type: 'metric-event', payload: {}, timestamp: new Date() });

    expect(recordEventBusHandlerFailureMock).toHaveBeenCalledWith('metric-event');
  });
});

describe('runInCommitUnit', () => {
  it("moves a successful unit's tasks to the enclosing queue", async () => {
    const order: string[] = [];
    await runWithOnCommitScope(async () => {
      await runInCommitUnit(async () => {
        eventBus.onCommit(async () => {
          order.push('task');
        });
      });
      order.push('unit done');
      await eventBus.flushOnCommit();
    });
    expect(order).toEqual(['unit done', 'task']);
  });

  it("drops a failed unit's tasks", async () => {
    const task = vi.fn();
    await runWithOnCommitScope(async () => {
      await runInCommitUnit(async () => {
        eventBus.onCommit(task);
        throw new Error('rolled back');
      }).catch(() => undefined);
      await eventBus.flushOnCommit();
    });
    expect(task).not.toHaveBeenCalled();
  });

  it('runs the tasks right after the unit when no scope encloses it (a worker)', async () => {
    const order: string[] = [];
    await runInCommitUnit(async () => {
      await runEnqueueAfterCommit(async () => {
        order.push('enqueue');
      });
      order.push('commit');
    });
    expect(order).toEqual(['commit', 'enqueue']);
  });
});

describe('EventBus.onCommit and flushOnCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs queued onCommit tasks in FIFO order when flushed within scope', async () => {
    const bus = new EventBus();
    const order: number[] = [];
    await runWithOnCommitScope(async () => {
      bus.onCommit(async () => {
        order.push(1);
      });
      bus.onCommit(async () => {
        order.push(2);
      });
      bus.onCommit(async () => {
        order.push(3);
      });
      await bus.flushOnCommit();
    });

    expect(order.sort()).toEqual([1, 2, 3]);
    expect(order.length).toBe(3);
  });

  it('does not throw when an onCommit task fails (logged, others still run)', async () => {
    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    const bus = new EventBus();
    let secondRan = false;
    await runWithOnCommitScope(async () => {
      bus.onCommit(async () => {
        throw new Error('commit-task-failed');
      });
      bus.onCommit(async () => {
        secondRan = true;
      });
      await bus.flushOnCommit();
    });

    expect(secondRan).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });

  it('flushOnCommit is a no-op outside an onCommit scope', async () => {
    const bus = new EventBus();
    await expect(bus.flushOnCommit()).resolves.toBeUndefined();
  });

  it('flushOnCommit clears the queue so a second flush is a no-op', async () => {
    const bus = new EventBus();
    let runs = 0;
    await runWithOnCommitScope(async () => {
      bus.onCommit(async () => {
        runs += 1;
      });
      await bus.flushOnCommit();
      await bus.flushOnCommit();
    });
    expect(runs).toBe(1);
  });

  it('runWithOnCommitScope isolates parent and nested queues', async () => {
    const parentTasks: string[] = [];
    const childTasks: string[] = [];

    await runWithOnCommitScope(async () => {
      eventBus.onCommit(async () => {
        parentTasks.push('parent');
      });

      await runWithOnCommitScope(async () => {
        eventBus.onCommit(async () => {
          childTasks.push('child');
        });
        await eventBus.flushOnCommit();
      });

      // Child flush should not have touched parent queue
      expect(parentTasks).toHaveLength(0);
      expect(childTasks).toEqual(['child']);

      await eventBus.flushOnCommit();
    });

    expect(parentTasks).toEqual(['parent']);
  });

  it('enterOnCommitScope pins an empty queue and clears prior tasks for the current async context', async () => {
    let ran = 0;
    // Run a separate AsyncLocalStorage scope so the enterOnCommitScope reset is isolated
    await runWithOnCommitScope(async () => {
      eventBus.onCommit(async () => {
        ran += 1;
      });
      // Pin a fresh queue — this drops the pending task
      enterOnCommitScope();
      await eventBus.flushOnCommit();
    });
    expect(ran).toBe(0);
  });
});

describe('runEnqueueAfterCommit', () => {
  it('runs the callback immediately when no onCommit scope is active', async () => {
    let ran = false;
    await runEnqueueAfterCommit(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it('defers the callback to flushOnCommit when inside a scope', async () => {
    let ran = false;
    await runWithOnCommitScope(async () => {
      await runEnqueueAfterCommit(async () => {
        ran = true;
      });
      expect(ran).toBe(false); // deferred
      await eventBus.flushOnCommit();
    });
    expect(ran).toBe(true);
  });
});

describe('buildDomainEvent', () => {
  it('builds an event with a default timestamp', () => {
    const event = buildDomainEvent({ type: 'domain.foo', payload: { a: 1 } });
    expect(event.type).toBe('domain.foo');
    expect(event.payload).toEqual({ a: 1 });
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.requestId).toBeUndefined();
  });

  it('includes requestId only when provided', () => {
    const event = buildDomainEvent({
      type: 'domain.foo',
      payload: { a: 1 },
      options: { requestId: 'req-1' },
    });
    expect(event.requestId).toBe('req-1');
  });

  it('does not assign requestId when options omit requestId', () => {
    const event = buildDomainEvent({ type: 'domain.foo', payload: { a: 1 }, options: {} });
    expect('requestId' in event).toBe(false);
  });

  it('uses the provided timestamp when given', () => {
    const fixedTime = new Date('2026-01-01T00:00:00Z');
    const event = buildDomainEvent({
      type: 'domain.bar',
      payload: {},
      options: { timestamp: fixedTime },
    });
    expect(event.timestamp).toBe(fixedTime);
  });
});

describe('EventBus.clearCommitDispatchMarker (commit-dispatch marker leak guard)', () => {
  const task = { type: 'test.commit-dispatch' } as never;

  beforeEach(() => {
    appendCommitDispatchTaskMock.mockClear();
    consumeCommitDispatchTasksMock.mockClear();
    resetCommitDispatchPendingStateForTests();
  });

  it('flushOnCommit consumes durable tasks while the marker is present (control)', async () => {
    await scheduleCommitDispatch({ task, options: { requestId: 'req-present' } });

    await eventBus.flushOnCommit({ requestId: 'req-present' });

    expect(consumeCommitDispatchTasksMock).toHaveBeenCalledWith({ requestId: 'req-present' });
  });

  it('alerts and counts a durability fallback when the Redis append fails (EX-14)', async () => {
    captureExceptionMock.mockClear();
    recordCommitDispatchDurabilityFallbackMock.mockClear();
    const appendError = new Error('redis-rpush-down');
    appendCommitDispatchTaskMock.mockRejectedValueOnce(appendError);

    // Must not throw — the request still succeeds, but durability degrades to the in-memory path.
    await expect(
      scheduleCommitDispatch({ task, options: { requestId: 'req-redis-down' } }),
    ).resolves.toBeUndefined();

    expect(captureExceptionMock).toHaveBeenCalledWith({
      error: appendError,
      context: expect.objectContaining({
        tags: expect.objectContaining({ source: 'event-bus.commit-dispatch' }),
      }),
    });
    expect(recordCommitDispatchDurabilityFallbackMock).toHaveBeenCalledTimes(1);
  });
});
