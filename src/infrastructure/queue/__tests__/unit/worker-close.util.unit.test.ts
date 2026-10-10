import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Worker } from 'bullmq';

const mockEnv = vi.hoisted(() => ({
  SHUTDOWN_TIMEOUT_MS: undefined as number | undefined,
}));

vi.mock('@/shared/config/env.config.js', () => ({
  env: mockEnv,
}));

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: loggerMock,
}));

import { closeWorkerWithTimeout } from '@/infrastructure/queue/worker-runtime/worker-close.util.js';
import {
  resetShutdownBudgetForTests,
  startShutdownBudget,
} from '@/infrastructure/queue/worker-runtime/shutdown-timing.util.js';

describe('worker-close.util', () => {
  beforeEach(() => {
    mockEnv.SHUTDOWN_TIMEOUT_MS = undefined;
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetShutdownBudgetForTests();
    vi.useRealTimers();
  });

  it('by default waits only for what is left of the shared shutdown budget', async () => {
    mockEnv.SHUTDOWN_TIMEOUT_MS = 10_000;
    startShutdownBudget();
    // Earlier steps used 9.9 of the 10 seconds: this close gets the last 100 ms, not 10 s more.
    await vi.advanceTimersByTimeAsync(9_900);
    const worker = {
      name: 'mail',
      close: vi.fn(() => new Promise<void>(() => {})),
    } as unknown as Worker;

    const closePromise = closeWorkerWithTimeout(worker, { queueName: 'mail' });
    const assertion = expect(closePromise).rejects.toThrow(/exceeded 100ms/);
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
  });

  it('resolves when worker.close completes within timeout', async () => {
    const worker = {
      name: 'mail',
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Worker;

    await closeWorkerWithTimeout(worker, { timeoutMs: 1_000, queueName: 'mail' });

    expect(worker.close).toHaveBeenCalledOnce();
  });

  it('rejects when worker.close exceeds timeout', async () => {
    const worker = {
      name: 'mail',
      close: vi.fn(() => new Promise<void>(() => {})),
    } as unknown as Worker;

    const closePromise = closeWorkerWithTimeout(worker, { timeoutMs: 100, queueName: 'mail' });
    const assertion = expect(closePromise).rejects.toThrow(/exceeded 100ms/);
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ queueName: 'mail', timeoutMs: 100 }),
      'worker.shutdown.timeout',
    );
  });
});
