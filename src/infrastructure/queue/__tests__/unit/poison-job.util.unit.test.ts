import { UnrecoverableError, type Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const recordDeadLetterFailureMock = vi.fn().mockResolvedValue(undefined);
const loggerErrorMock = vi.fn();

vi.mock('@/infrastructure/queue/dlq/dead-letter.js', () => ({
  recordDeadLetterFailure: (...arguments_: unknown[]) => recordDeadLetterFailureMock(...arguments_),
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: {
    error: (...arguments_: unknown[]) => loggerErrorMock(...arguments_),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { parseJobDataOrDeadLetter } from '@/infrastructure/queue/dlq/poison-job.util.js';

const schema = z.object({ mailOutboxToken: z.uuid() });

function buildJob(data: unknown): Job {
  return { id: 'job-1', name: 'send-email', data } as unknown as Job;
}

describe('parseJobDataOrDeadLetter', () => {
  beforeEach(() => {
    recordDeadLetterFailureMock.mockClear();
    loggerErrorMock.mockClear();
  });

  it('returns parsed data for a valid payload without touching the DLQ', async () => {
    const job = buildJob({ mailOutboxToken: '6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f' });

    await expect(parseJobDataOrDeadLetter({ schema, job, queueName: 'mail' })).resolves.toEqual({
      mailOutboxToken: '6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f',
    });
    expect(recordDeadLetterFailureMock).not.toHaveBeenCalled();
  });

  it('routes a poison payload straight to the DLQ and throws UnrecoverableError (no retry)', async () => {
    const job = buildJob({ mailOutboxToken: 'not-a-uuid' });

    await expect(
      parseJobDataOrDeadLetter({ schema, job, queueName: 'mail' }),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(recordDeadLetterFailureMock).toHaveBeenCalledTimes(1);
    expect(recordDeadLetterFailureMock).toHaveBeenCalledWith(
      'mail',
      job,
      expect.any(UnrecoverableError),
    );
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });
});
