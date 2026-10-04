import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { CircuitBreakerOpenError } from '@/infrastructure/resilience/circuit-breaker.js';
import { MAIL_QUEUE_MAX_ATTEMPTS } from '@/infrastructure/mail/queues/mail.queue.js';
import {
  buildMailOutboxIdempotencyKey,
  processMailOutboxJob,
} from '@/infrastructure/mail/workers/mail.processor.js';

const RESEND_IDEMPOTENCY_TOKEN = '3f0c7a52-8a1e-4f6b-9a7d-2c5e8b1d4f60';

const findMailOutboxByIdMock = vi.fn();
const tryClaimPendingMailOutboxMock = vi.fn();
const markMailOutboxSentMock = vi.fn();
const markMailOutboxFailedMock = vi.fn();
const releaseMailOutboxClaimMock = vi.fn();
const sendEmailMock = vi.fn();

vi.mock('@/infrastructure/mail/mail-outbox.repository.js', () => ({
  findMailOutboxById: (...arguments_: unknown[]) => findMailOutboxByIdMock(...arguments_),
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

describe('mail.processor', () => {
  beforeEach(() => {
    findMailOutboxByIdMock.mockReset();
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
    expect(buildMailOutboxIdempotencyKey(RESEND_IDEMPOTENCY_TOKEN)).toBe(
      `mail-outbox-${RESEND_IDEMPOTENCY_TOKEN}`,
    );
  });

  it('throws UnrecoverableError (no retry burn) when the outbox row is missing — audit-#M2 phantom row', async () => {
    // A rolled-back request's commit-dispatch task references a row that never persisted. Retrying
    // cannot make it appear, so the job must fail terminally rather than exhaust its retry budget
    // and raise a false final-failure DLQ alert.
    findMailOutboxByIdMock.mockResolvedValue(null);
    await expect(processMailOutboxJob({ mailOutboxId: 999 })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(tryClaimPendingMailOutboxMock).not.toHaveBeenCalled();
  });

  it('throws UnrecoverableError for a terminally-failed row (body scrubbed, not replayable) — audit-#W1', async () => {
    // Previously this fell through to `in_flight` and returned skipped:true, so a DLQ replay looked
    // like a success while delivering nothing. Now it fails terminally with an explicit reason.
    findMailOutboxByIdMock.mockResolvedValue({
      id: 7,
      status: 'failed',
      to_addresses: ['user@example.com'],
    });
    tryClaimPendingMailOutboxMock.mockResolvedValue('failed');
    await expect(processMailOutboxJob({ mailOutboxId: 7 })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(markMailOutboxFailedMock).not.toHaveBeenCalled();
  });

  it('processMailOutboxJob skips send when outbox row is already sent', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('already_sent');
    findMailOutboxByIdMock.mockResolvedValue({
      id: 42,
      status: 'sent',
      resend_message_id: 'msg_existing',
      to_addresses: ['user@example.com'],
    });

    const result = await processMailOutboxJob({ mailOutboxId: 42 });

    expect(result).toEqual({ messageId: 'msg_existing', skipped: true });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(markMailOutboxSentMock).not.toHaveBeenCalled();
  });

  it('processMailOutboxJob sends and marks row sent when pending', async () => {
    const { logger } = await import('@/shared/utils/infrastructure/logger.util.js');
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByIdMock.mockResolvedValue({
      id: 43,
      status: 'sending',
      to_addresses: ['user@example.com'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      text_body: null,
      reply_to: null,
      tags: null,
      resend_idempotency_token: RESEND_IDEMPOTENCY_TOKEN,
    });
    sendEmailMock.mockResolvedValue('msg_new');

    const result = await processMailOutboxJob(
      { mailOutboxId: 43, requestId: 'req-mail-43' },
      { jobId: 'job-43', requestId: 'req-mail-43' },
    );

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `mail-outbox-${RESEND_IDEMPOTENCY_TOKEN}` }),
    );
    expect(markMailOutboxSentMock).toHaveBeenCalledWith(43, 'msg_new');
    expect(result).toEqual({ messageId: 'msg_new' });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-mail-43',
        mailOutboxId: 43,
        resendMessageId: 'msg_new',
      }),
      'email.sent',
    );
  });

  it('processMailOutboxJob re-sends a retried row under the same idempotency key — audit #20', async () => {
    // The key is read from the row, so a retry (or a sweeper reclaim) after a send that reached
    // Resend before the worker could mark the row `sent` is collapsed by Resend into one delivery.
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByIdMock.mockResolvedValue({
      id: 47,
      status: 'sending',
      to_addresses: ['user@example.com'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      text_body: null,
      reply_to: null,
      tags: null,
      resend_idempotency_token: RESEND_IDEMPOTENCY_TOKEN,
    });
    sendEmailMock
      .mockRejectedValueOnce(new Error('resend.timeout'))
      .mockResolvedValueOnce('msg_retried');

    await expect(
      processMailOutboxJob({ mailOutboxId: 47 }, { jobAttemptNumber: 0, maxJobAttempts: 3 }),
    ).rejects.toThrow('resend.timeout');
    await processMailOutboxJob({ mailOutboxId: 47 }, { jobAttemptNumber: 1, maxJobAttempts: 3 });

    const [firstAttemptKey, retryAttemptKey] = sendEmailMock.mock.calls.map(
      ([sendOptions]) => sendOptions.idempotencyKey,
    );
    expect(firstAttemptKey).toBe(`mail-outbox-${RESEND_IDEMPOTENCY_TOKEN}`);
    expect(retryAttemptKey).toBe(firstAttemptKey);
  });

  it('processMailOutboxJob releases claim on non-final send failure', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByIdMock.mockResolvedValue({
      id: 44,
      status: 'sending',
      to_addresses: ['user@example.com'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      text_body: null,
      reply_to: null,
      tags: null,
    });
    sendEmailMock.mockRejectedValue(new Error('resend.down'));

    await expect(
      processMailOutboxJob({ mailOutboxId: 44 }, { jobAttemptNumber: 0, maxJobAttempts: 3 }),
    ).rejects.toThrow('resend.down');

    expect(releaseMailOutboxClaimMock).toHaveBeenCalledWith(44);
    expect(markMailOutboxFailedMock).not.toHaveBeenCalled();
  });

  it('processMailOutboxJob releases claim on final circuit-open failure without marking failed', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByIdMock.mockResolvedValue({
      id: 46,
      status: 'sending',
      to_addresses: ['user@example.com'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      text_body: null,
      reply_to: null,
      tags: null,
    });
    sendEmailMock.mockRejectedValue(
      new CircuitBreakerOpenError('resend', 60_000, 'Circuit breaker "resend" is OPEN'),
    );

    await expect(
      processMailOutboxJob(
        { mailOutboxId: 46 },
        { jobAttemptNumber: MAIL_QUEUE_MAX_ATTEMPTS - 1, maxJobAttempts: MAIL_QUEUE_MAX_ATTEMPTS },
      ),
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);

    expect(releaseMailOutboxClaimMock).toHaveBeenCalledWith(46);
    expect(markMailOutboxFailedMock).not.toHaveBeenCalled();
  });

  it('sec-new-Q3: processMailOutboxJob throws ZodError when to_addresses is not an array', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByIdMock.mockResolvedValue({
      id: 50,
      status: 'sending',
      to_addresses: 'not-an-array@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      text_body: null,
      reply_to: null,
      tags: null,
    });

    await expect(processMailOutboxJob({ mailOutboxId: 50 })).rejects.toThrow();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('sec-new-Q3: processMailOutboxJob throws ZodError when to_addresses contains non-email strings', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByIdMock.mockResolvedValue({
      id: 51,
      status: 'sending',
      to_addresses: ['not-a-valid-email'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      text_body: null,
      reply_to: null,
      tags: null,
    });

    await expect(processMailOutboxJob({ mailOutboxId: 51 })).rejects.toThrow();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('processMailOutboxJob marks failed on final send failure', async () => {
    tryClaimPendingMailOutboxMock.mockResolvedValue('claimed');
    findMailOutboxByIdMock.mockResolvedValue({
      id: 45,
      status: 'sending',
      to_addresses: ['user@example.com'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      text_body: null,
      reply_to: null,
      tags: null,
    });
    sendEmailMock.mockRejectedValue(new Error('resend.down'));

    await expect(
      processMailOutboxJob({ mailOutboxId: 45 }, { jobAttemptNumber: 2, maxJobAttempts: 3 }),
    ).rejects.toThrow('resend.down');

    expect(markMailOutboxFailedMock).toHaveBeenCalledWith(45);
    expect(releaseMailOutboxClaimMock).not.toHaveBeenCalled();
  });
});
