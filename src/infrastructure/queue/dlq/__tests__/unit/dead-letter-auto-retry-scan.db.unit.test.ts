import { describe, it, expect, beforeEach } from 'vitest';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { database } from '@/infrastructure/database/connection.js';
import { dead_letter_jobs } from '@/infrastructure/queue/dlq/dead-letter.schema.js';
import {
  findDeadLetterJobsForAutoRetry,
  markDeadLetterJobAutoRetryResolved,
} from '@/infrastructure/queue/dlq/dead-letter.repository.js';

/**
 * Regression for the DLQ auto-retry starvation fix: the scan must exclude rows already marked
 * `auto_retry_resolved_at`, so handled rows (replayed, not replayable, at the depth limit) can
 * never re-enter the head of the queue, starve newer rows, or replay twice.
 */
async function seedDeadLetterRow(overrides: Partial<typeof dead_letter_jobs.$inferInsert> = {}) {
  const oneHourAgo = new Date(Date.now() - 3_600_000);
  const [row] = await database
    .insert(dead_letter_jobs)
    .values({
      source_queue: 'mail',
      dead_letter_queue: 'mail-dlq',
      job_name: 'send-email',
      payload_summary: {},
      failed_reason: 'boom',
      attempts_made: 3,
      max_attempts: 3,
      failed_at: oneHourAgo,
      ...overrides,
    })
    .returning();
  return row!;
}

function scan() {
  return findDeadLetterJobsForAutoRetry({
    sourceQueues: ['mail'],
    failedBefore: new Date(),
    limit: 50,
  });
}

describe('DLQ auto-retry scan — resolved-row exclusion', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('excludes rows already marked auto_retry_resolved_at', async () => {
    const unresolved = await seedDeadLetterRow({ failed_reason: 'unresolved' });
    const resolved = await seedDeadLetterRow({
      failed_reason: 'resolved',
      auto_retry_resolved_at: new Date(),
    });

    const ids = (await scan()).map((row) => row.id);
    expect(ids).toContain(unresolved.id);
    expect(ids).not.toContain(resolved.id);
  });

  it('markDeadLetterJobAutoRetryResolved removes a row from the scan (idempotent)', async () => {
    const row = await seedDeadLetterRow();
    expect((await scan()).map((found) => found.id)).toContain(row.id);

    await markDeadLetterJobAutoRetryResolved(row.id);
    expect((await scan()).map((found) => found.id)).not.toContain(row.id);

    // Idempotent: a second mark is a harmless no-op.
    await expect(markDeadLetterJobAutoRetryResolved(row.id)).resolves.toBeUndefined();
    expect((await scan()).map((found) => found.id)).not.toContain(row.id);
  });

  it('returns each row with its replay depth — the lineage lives on the ledger row', async () => {
    const original = await seedDeadLetterRow({ failed_reason: 'original' });
    const replayed = await seedDeadLetterRow({ failed_reason: 'second replay', replay_depth: 2 });

    const depthById = new Map((await scan()).map((row) => [row.id, row.replay_depth]));
    expect(depthById.get(original.id)).toBe(0);
    expect(depthById.get(replayed.id)).toBe(2);
  });
});
