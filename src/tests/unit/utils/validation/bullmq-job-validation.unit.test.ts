import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseBullMQJobData } from '@/shared/utils/validation/bullmq-job-validation.util.js';

describe('bullmq-job-validation.util', () => {
  const schema = z.object({
    mailOutboxToken: z.uuid(),
    requestId: z.string().optional(),
  });

  it('returns parsed data when payload is valid', () => {
    expect(
      parseBullMQJobData(
        schema,
        { mailOutboxToken: '6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f', requestId: 'req-1' },
        'mail',
      ),
    ).toEqual({
      mailOutboxToken: '6b1d2e8f-3c4a-4b5d-8e9f-0a1b2c3d4e5f',
      requestId: 'req-1',
    });
  });

  it('throws when payload is invalid', () => {
    expect(() => parseBullMQJobData(schema, { mailOutboxToken: 'bad' }, 'mail')).toThrow(
      /bullmq\.invalid_job_payload:mail/,
    );
  });
});
