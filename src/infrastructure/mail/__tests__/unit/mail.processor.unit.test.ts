import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { CircuitBreakerOpenError } from '@/infrastructure/resilience/circuit-breaker.js';
import { MAIL_QUEUE_MAX_ATTEMPTS } from '@/infrastructure/mail/queues/mail.queue.js';
import { ResendApiError } from '@/infrastructure/mail/resend-api.error.js';
import {
  buildMailOutboxIdempotencyKey,
  processMailOutboxJob,
} from '@/infrastructure/mail/workers/mail.processor.js';

/** The row's token — the job's handle and the Resend Idempotency-Key. */
const MAIL_OUTBOX_TOKEN = '3f0c7a52-8a1e-4f6b-9a7d-2c5e8b1d4f60';

const findMailOutboxByTokenMock = vi.fn();
const tryClaimPendingMailOutboxMock = vi.fn();
const markMailOutboxSentMock = vi.fn();
const markMailOutboxFailedMock = vi.fn();
const releaseMailOutboxClaimMock = vi.fn();
const sendEmailMock = vi.fn();

vi.mock('@/infrastructure/mail/mail-outbox.repository.js', () => ({
  findMailOutboxByToken: (...arguments_: unknown[]) => findMailOutboxByTokenMock(...arguments_),
  tryClaimPendingMailOutbox: (...arguments_: unknown[]) =>
    tryClaimPendingMailOutboxMock(...arguments_),
  markMailOutboxSent: (...arguments_: unknown[]) => markMailOutboxSentMock(...arguments_),
  markMailOutboxFailed: (...arguments_: unknown[]) => markMailOutboxFailedMock(...arguments_),
  releaseMailOutboxClaim: (...arguments_: unknown[]) => releaseMailOutboxClaimMock(...arguments_),
}));

vi.mock('@/infrastructure/mail/mail.service.js', () => ({
  sendEmail: (...arguments_: unknown[]) => sendEmailMock(...arguments_),
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function outboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 43,
    status: 'sending',
    to_addresses: ['user@example.com'],
    subject: 'Hello',
    html: '<p>Hi</p>',
    text_body: null,
    reply_to: null,
    tags: null,
    resend_message_id: null,
    resend_idempotency_token: MAIL_OUTBOX_TOKEN,
    ...overrides,
  };
}

describe('mail.processor', () => {
  beforeEach(() => {
    findMailOutboxByTokenMock.mockReset();
    tryClaimPendingMailOutboxMock.mockReset();
    markMailOutboxSentMock.mockReset();
    markMailOutboxFailedMock.mockReset();
    releaseMailOutboxClaimMock.mockReset();
    sendEmailMock.mockReset();
  });

  it('buildMailOutboxIdempotencyKey keys a row on its stored random token', () => {
    // Not the bigserial id: it restarts at 1 after TRUNCATE ... RESTART IDENTITY or on a fresh
    // database, and Resend rejects a key reused with a different body for 24 hours (409
    // invalid_idempotent_request) — keyed on the id, that email was never delivered.
    expect(buildMailOutboxIdempotencyKey(MAIL_OUTBOX_TOKEN)).toBe(
      `mail-outbox-${MAIL_OUTBOX_TOKEN}`,
    );
  });

  it('loads and claims the row by the token the job carries, never a bigserial', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByTokenMock.mockResolvedValue(outboxRow());
    sendEmailMock.mockResolvedValue('msg_new');

    await processMailOutboxJob({ mailOutboxToken: MAIL_OUTBOX_TOKEN });

    expect(findMailOutboxByTokenMock).toHaveBeenCalledWith(MAIL_OUTBOX_TOKEN);
    expect(tryClaimPendingMailOutboxMock).toHaveBeenCalledWith(MAIL_OUTBOX_TOKEN);
  });

  it('completes as skipped when the outbox row is gone — audit-#M2 phantom row', async () => {
    // A rolled-back request's commit-dispatch task, a pruned or erased row, or a restore: retrying
    // cannot make it appear and there is nothing for anyone to act on, so the job completes.
    findMailOutboxByTokenMock.mockResolvedValue(null);

    const result = await processMailOutboxJob({ mailOutboxToken: MAIL_OUTBOX_TOKEN });

    expect(result).toEqual({ outcome: 'skipped', reason: 'not_found' });
    expect(tryClaimPendingMailOutboxMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('throws UnrecoverableError for a terminally-failed row (body scrubbed, not replayable) — audit-#W1', async () => {
    // Reporting `skipped` made a DLQ replay look like a success while delivering nothing. Now it
    // fails terminally with an explicit reason.
    findMailOutboxByTokenMock.mockResolvedValue(outboxRow({ status: 'failed' }));
    tryClaimPendingMailOutboxMock.mockResolvedValue('failed');

    await expect(
      processMailOutboxJob({ mailOutboxToken: MAIL_OUTBOX_TOKEN }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(markMailOutboxFailedMock).not.toHaveBeenCalled();
  });

  it('skips the send when the outbox row is already sent', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('already_sent');
    findMailOutboxByTokenMock.mockResolvedValue(
      outboxRow({ status: 'sent', resend_message_id: 'msg_existing' }),
    );

    const result = await processMailOutboxJob({ mailOutboxToken: MAIL_OUTBOX_TOKEN });

    expect(result).toEqual({
      outcome: 'skipped',
      reason: 'already_sent',
      messageId: 'msg_existing',
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(markMailOutboxSentMock).not.toHaveBeenCalled();
  });

  it('skips the send while another execution holds the row (the sweeper re-enqueues it if that one died)', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('in_flight');
    findMailOutboxByTokenMock.mockResolvedValue(outboxRow());

    const result = await processMailOutboxJob({ mailOutboxToken: MAIL_OUTBOX_TOKEN });

    expect(result).toEqual({ outcome: 'skipped', reason: 'in_flight' });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('sends and marks the row sent when pending', async () => {
    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByTokenMock.mockResolvedValue(outboxRow());
    sendEmailMock.mockResolvedValue('msg_new');

    const result = await processMailOutboxJob(
      { mailOutboxToken: MAIL_OUTBOX_TOKEN, requestId: 'req-mail-43' },
      { jobId: 'job-43', requestId: 'req-mail-43' },
    );

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `mail-outbox-${MAIL_OUTBOX_TOKEN}` }),
    );
    expect(markMailOutboxSentMock).toHaveBeenCalledWith(MAIL_OUTBOX_TOKEN, 'msg_new');
    expect(result).toEqual({ outcome: 'sent', messageId: 'msg_new' });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-mail-43',
        mailOutboxToken: MAIL_OUTBOX_TOKEN,
        resendMessageId: 'msg_new',
      }),
      'email.sent',
    );
  });

  it('re-sends a retried row under the same idempotency key — audit #20', async () => {
    // The key is read from the row, so a retry (or a sweeper reclaim) after a send that reached
    // Resend before the worker could mark the row `sent` is collapsed by Resend into one delivery.
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByTokenMock.mockResolvedValue(outboxRow());
    sendEmailMock
      .mockRejectedValueOnce(new Error('resend.timeout'))
      .mockResolvedValueOnce('msg_retried');

    await expect(
      processMailOutboxJob(
        { mailOutboxToken: MAIL_OUTBOX_TOKEN },
        { jobAttemptNumber: 0, maxJobAttempts: 3 },
      ),
    ).rejects.toThrow('resend.timeout');
    await processMailOutboxJob(
      { mailOutboxToken: MAIL_OUTBOX_TOKEN },
      { jobAttemptNumber: 1, maxJobAttempts: 3 },
    );

    const [firstAttemptKey, retryAttemptKey] = sendEmailMock.mock.calls.map(
      ([sendOptions]) => sendOptions.idempotencyKey,
    );
    expect(firstAttemptKey).toBe(`mail-outbox-${MAIL_OUTBOX_TOKEN}`);
    expect(retryAttemptKey).toBe(firstAttemptKey);
  });

  it('releases the claim on a non-final send failure', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByTokenMock.mockResolvedValue(outboxRow());
    sendEmailMock.mockRejectedValue(new Error('resend.down'));

    await expect(
      processMailOutboxJob(
        { mailOutboxToken: MAIL_OUTBOX_TOKEN },
        { jobAttemptNumber: 0, maxJobAttempts: 3 },
      ),
    ).rejects.toThrow('resend.down');

    expect(releaseMailOutboxClaimMock).toHaveBeenCalledWith(MAIL_OUTBOX_TOKEN);
    expect(markMailOutboxFailedMock).not.toHaveBeenCalled();
  });

  it('fails a per-email rejection for good and completes — no retry can deliver it, nobody to page', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByTokenMock.mockResolvedValue(outboxRow());
    sendEmailMock.mockRejectedValue(
      new ResendApiError({
        message: 'Invalid `to` field.',
        statusCode: 422,
        resendErrorName: 'validation_error',
      }),
    );

    const result = await processMailOutboxJob(
      { mailOutboxToken: MAIL_OUTBOX_TOKEN },
      { jobAttemptNumber: 0, maxJobAttempts: 3 },
    );

    expect(result).toEqual({ outcome: 'rejected', statusCode: 422 });
    expect(markMailOutboxFailedMock).toHaveBeenCalledWith(MAIL_OUTBOX_TOKEN);
    expect(releaseMailOutboxClaimMock).not.toHaveBeenCalled();
  });

  it('keeps retrying a Resend error that is not about the email itself', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByTokenMock.mockResolvedValue(outboxRow());
    const outage = new ResendApiError({
      message: 'Internal server error',
      statusCode: 500,
      resendErrorName: 'application_error',
    });
    sendEmailMock.mockRejectedValue(outage);

    await expect(
      processMailOutboxJob(
        { mailOutboxToken: MAIL_OUTBOX_TOKEN },
        { jobAttemptNumber: 0, maxJobAttempts: 3 },
      ),
    ).rejects.toBe(outage);

    expect(releaseMailOutboxClaimMock).toHaveBeenCalledWith(MAIL_OUTBOX_TOKEN);
    expect(markMailOutboxFailedMock).not.toHaveBeenCalled();
  });

  it('releases the claim on a final circuit-open failure without marking failed', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByTokenMock.mockResolvedValue(outboxRow());
    sendEmailMock.mockRejectedValue(
      new CircuitBreakerOpenError('resend', 60_000, 'Circuit breaker "resend" is OPEN'),
    );

    await expect(
      processMailOutboxJob(
        { mailOutboxToken: MAIL_OUTBOX_TOKEN },
        { jobAttemptNumber: MAIL_QUEUE_MAX_ATTEMPTS - 1, maxJobAttempts: MAIL_QUEUE_MAX_ATTEMPTS },
      ),
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);

    expect(releaseMailOutboxClaimMock).toHaveBeenCalledWith(MAIL_OUTBOX_TOKEN);
    expect(markMailOutboxFailedMock).not.toHaveBeenCalled();
  });

  it.each([
    ['not an array', 'not-an-array@example.com'],
    ['a non-email string', ['not-a-valid-email']],
    ['empty', []],
  ])(
    'sec-new-Q3: recipients that are %s fail the row for good instead of leaving it sending',
    async (_label, toAddresses) => {
      // The row is broken and no retry fixes it. Left `sending`, every later execution skipped it as
      // in flight until the sweeper reclaimed it — and then it failed again, forever.
      tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
      findMailOutboxByTokenMock.mockResolvedValue(outboxRow({ to_addresses: toAddresses }));

      await expect(
        processMailOutboxJob({ mailOutboxToken: MAIL_OUTBOX_TOKEN }),
      ).rejects.toBeInstanceOf(UnrecoverableError);

      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(markMailOutboxFailedMock).toHaveBeenCalledWith(MAIL_OUTBOX_TOKEN);
    },
  );

  it('marks the row failed on the final send failure', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByTokenMock.mockResolvedValue(outboxRow());
    sendEmailMock.mockRejectedValue(new Error('resend.down'));

    await expect(
      processMailOutboxJob(
        { mailOutboxToken: MAIL_OUTBOX_TOKEN },
        { jobAttemptNumber: 2, maxJobAttempts: 3 },
      ),
    ).rejects.toThrow('resend.down');

    expect(markMailOutboxFailedMock).toHaveBeenCalledWith(MAIL_OUTBOX_TOKEN);
    expect(releaseMailOutboxClaimMock).not.toHaveBeenCalled();
  });
});
