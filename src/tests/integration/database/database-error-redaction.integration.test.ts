import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import pino from 'pino';
import { eq } from 'drizzle-orm';
import type { Job } from 'bullmq';
import type { ErrorEvent } from '@sentry/node';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { dead_letter_jobs } from '@/infrastructure/queue/dlq/dead-letter.schema.js';
import { recordDeadLetterFailure } from '@/infrastructure/queue/dlq/dead-letter.js';
import {
  redactSentryDatabaseExceptionValues,
  redactSentryEvent,
} from '@/infrastructure/observability/sentry/sentry.js';
import errorHandlerMiddleware from '@/shared/middlewares/core/error-handler.middleware.js';
import i18nMiddleware from '@/shared/middlewares/core/i18n.middleware.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  redactSensitive,
  sanitizeDatabaseError,
} from '@/shared/utils/security/sensitive-redaction.util.js';

/**
 * C-1 — a database failure copies no bound value into a log, Sentry or the job queue.
 *
 * Drizzle 0.45 throws `Failed query: <sql>\nparams: <values>` and keeps `query` / `params`; the
 * driver error on its `cause` has a `detail` quoting the key values. Redaction by key name cannot
 * see a value, so a patient's name in an INSERT reached every log line, Sentry event and
 * dead-letter row that carried the error — and a foreign-key violation was a 500. This runs a real
 * statement that violates a foreign key, with a recognisable value bound into it.
 */
describe('Integration: a database failure leaves no bound value behind (C-1)', () => {
  const marker = `Clinic-${randomUUID()}`;
  const missingUserId = 2_000_000_000;
  let application: FastifyInstance;

  function insertOrganizationOwnedByNobody() {
    return getOperatorDatabase()
      .insert(organizations)
      .values({
        public_id: generatePublicId('organization'),
        name: marker,
        slug: `slug-${randomUUID()}`,
        owner_user_id: missingUserId,
        created_by_user_id: missingUserId,
      });
  }

  async function captureFailure(): Promise<unknown> {
    try {
      await insertOrganizationOwnedByNobody();
    } catch (error) {
      return error;
    }
    throw new Error('expected a foreign-key violation');
  }

  /** What the logger writes for a call: its `redactSensitive` formatter, then `stdSerializers.err`. */
  function renderedLogLine(fields: Record<string, unknown>): string {
    const formatted = redactSensitive(fields);
    return JSON.stringify(formatted, (_key, value: unknown) =>
      value instanceof Error ? pino.stdSerializers.err(value) : value,
    );
  }

  beforeAll(async () => {
    await cleanupDatabase();
    application = Fastify({ logger: false });
    await application.register(fp(i18nMiddleware, { name: 'i18n-c1-test' }));
    await application.register(errorHandlerMiddleware);
    application.post('/organizations', async () => {
      await insertOrganizationOwnedByNobody();
      return { ok: true };
    });
    await application.ready();
  });

  afterAll(async () => {
    await application.close();
  });

  it('starts from a raw failure that does carry the bound value (the leak this guards)', async () => {
    const failure = (await captureFailure()) as Error & { cause?: { code?: string } };
    expect(failure.message).toContain(marker);
    expect(failure.cause?.code).toBe('23503');
  });

  it('answers a foreign-key violation with 409, and the log line it writes holds no bound value', async () => {
    const warn = vi.spyOn(logger, 'warn');
    try {
      const response = await application.inject({ method: 'POST', url: '/organizations' });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('conflict');
      expect(response.body).not.toContain(marker);

      const logged = warn.mock.calls.find(
        ([, message]) => message === 'request.database_client_error',
      );
      expect(logged).toBeDefined();
      const line = renderedLogLine(logged![0] as Record<string, unknown>);
      expect(line).toContain('23503');
      expect(line).not.toContain(marker);
      expect(line).not.toContain(String(missingUserId));
      expect(line).not.toContain('params:');
    } finally {
      warn.mockRestore();
    }
  });

  it('logs an unexpected database failure as its code, constraint and table only', async () => {
    const line = renderedLogLine({ error: await captureFailure() });
    const rendered = JSON.parse(line) as { error: Record<string, unknown> };

    expect(rendered.error).toMatchObject({ code: '23503' });
    expect(rendered.error.message).toMatch(/^Database query failed \(SQLSTATE 23503, /);
    expect(rendered.error.stack).toMatch(/^DatabaseQueryError: Database query failed/);
    expect(rendered.error.constraint).toEqual(expect.any(String));
    expect(rendered.error.table).toBe('organizations');
    expect(line).not.toContain(marker);
    expect(line).not.toContain('params:');
    expect(line).not.toContain('is not present in table');
  });

  it('sends Sentry no bound value: captured error and event exception values', async () => {
    const failure = (await captureFailure()) as Error & { cause: Error };
    const captured = sanitizeDatabaseError(failure) as Error;
    expect(JSON.stringify({ message: captured.message, stack: captured.stack })).not.toContain(
      marker,
    );

    // What the SDK builds from an automatically captured error: the error, then its linked cause.
    const event: ErrorEvent = {
      type: undefined,
      exception: {
        values: [
          { type: failure.cause.name, value: failure.cause.message },
          { type: failure.name, value: `${failure.message.slice(0, 240)}...` },
        ],
      },
    };
    // What `beforeSend` does with the event and the SDK's hint.
    redactSentryDatabaseExceptionValues({ event, hint: { originalException: failure } });
    const redacted = redactSentryEvent(event);

    const values = JSON.stringify(redacted.exception?.values);
    expect(values).toContain('SQLSTATE 23503');
    expect(values).not.toContain(marker);
    expect(values).not.toContain('Failed query');
  });

  it('writes no bound value into the dead-letter ledger', async () => {
    const failure = await captureFailure();
    const jobId = `c1-${randomUUID()}`;
    const job = {
      id: jobId,
      name: 'c1-probe',
      data: {},
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as unknown as Job;

    await recordDeadLetterFailure({ queueName: 'c1-probe-queue', job, error: failure });

    const [row] = await getOperatorDatabase()
      .select({
        failed_reason: dead_letter_jobs.failed_reason,
        error_stack: dead_letter_jobs.error_stack,
      })
      .from(dead_letter_jobs)
      .where(eq(dead_letter_jobs.job_id, jobId));
    expect(row?.failed_reason).toContain('SQLSTATE 23503');
    expect(JSON.stringify(row)).not.toContain(marker);
    expect(JSON.stringify(row)).not.toContain('params:');
  });
});
