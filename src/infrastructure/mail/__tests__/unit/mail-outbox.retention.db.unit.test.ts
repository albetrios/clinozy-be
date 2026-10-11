import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';
import {
  deleteFinishedMailOutboxRowsCreatedBefore,
  insertMailOutbox,
  markMailOutboxFailed,
  markMailOutboxSent,
} from '@/infrastructure/mail/mail-outbox.repository.js';
import { mail_outbox } from '@/infrastructure/mail/mail-outbox.schema.js';
import { MILLISECONDS_PER_DAY } from '@/shared/constants/index.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';

/**
 * Every mail outbox row keeps its recipient and subject. Finished rows (`sent` / `failed`) past the
 * window go; a row still to be sent never does, however old.
 */
describe('mail outbox retention', () => {
  const email = { to: 'member@example.com', subject: 'Hello', html: '<p>Hi</p>' } as const;

  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function backdate(mailOutboxToken: string, days: number): Promise<void> {
    await database
      .update(mail_outbox)
      .set({ created_at: new Date(Date.now() - days * MILLISECONDS_PER_DAY) })
      .where(eq(mail_outbox.resend_idempotency_token, mailOutboxToken));
  }

  it('deletes finished rows older than the cutoff and keeps everything else', async () => {
    const oldSent = await insertMailOutbox(email);
    await markMailOutboxSent(oldSent, 'resend_old');
    await backdate(oldSent, 40);
    const oldFailed = await insertMailOutbox(email);
    await markMailOutboxFailed(oldFailed);
    await backdate(oldFailed, 40);
    const recentSent = await insertMailOutbox(email);
    await markMailOutboxSent(recentSent, 'resend_recent');
    const oldPending = await insertMailOutbox(email);
    await backdate(oldPending, 40);

    const deleted = await deleteFinishedMailOutboxRowsCreatedBefore(
      new Date(Date.now() - 30 * MILLISECONDS_PER_DAY),
      1_000,
    );

    expect(deleted).toBe(2);
    const remaining = await database
      .select({ token: mail_outbox.resend_idempotency_token })
      .from(mail_outbox);
    expect(remaining.map((row) => row.token).sort()).toEqual([oldPending, recentSent].sort());
  });

  it('deletes at most `limit` rows per call, oldest first', async () => {
    const tokens: string[] = [];
    for (const days of [50, 45, 40]) {
      const token = await insertMailOutbox(email);
      await markMailOutboxSent(token, `resend_${days}`);
      await backdate(token, days);
      tokens.push(token);
    }

    expect(
      await deleteFinishedMailOutboxRowsCreatedBefore(
        new Date(Date.now() - 30 * MILLISECONDS_PER_DAY),
        2,
      ),
    ).toBe(2);
    const remaining = await database
      .select({ token: mail_outbox.resend_idempotency_token })
      .from(mail_outbox);
    expect(remaining.map((row) => row.token)).toEqual([tokens[2]]);
  });
});
