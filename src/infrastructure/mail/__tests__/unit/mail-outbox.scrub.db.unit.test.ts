import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { database } from '@/infrastructure/database/connection.js';
import {
  insertMailOutbox,
  markMailOutboxFailed,
  markMailOutboxSent,
  tryClaimPendingMailOutbox,
} from '@/infrastructure/mail/mail-outbox.repository.js';
import { mail_outbox } from '@/infrastructure/mail/mail-outbox.schema.js';

/**
 * audit-#10: rendered email bodies embed live single-use tokens (password-reset, magic-link,
 * invitation, email-verification). The body must be scrubbed on EVERY terminal state — both a
 * successful send and a permanent failure — so a snapshot reader / leaked console / SQLi cannot
 * recover a still-live token from a `failed` row.
 */
describe('mail-outbox terminal-state secret scrubbing (audit-#10)', () => {
  const secretEmail = {
    to: 'victim@example.com',
    subject: 'Reset your password',
    html: '<a href="https://app.example.com/reset?token=LIVE-SECRET-TOKEN">Reset</a>',
    text: 'Reset: https://app.example.com/reset?token=LIVE-SECRET-TOKEN',
  } as const;

  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function readRow(mailOutboxToken: string) {
    const rows = await database
      .select({
        status: mail_outbox.status,
        html: mail_outbox.html,
        text_body: mail_outbox.text_body,
        subject: mail_outbox.subject,
      })
      .from(mail_outbox)
      .where(eq(mail_outbox.resend_idempotency_token, mailOutboxToken));
    return rows[0]!;
  }

  it('scrubs the body when a delivery is marked FAILED (terminal)', async () => {
    const mailOutboxToken = await insertMailOutbox(secretEmail);

    await markMailOutboxFailed(mailOutboxToken);

    const row = await readRow(mailOutboxToken);
    expect(row.status).toBe('failed');
    expect(row.html).toBe('');
    expect(row.text_body).toBeNull();
    // Non-secret audit metadata is retained.
    expect(row.subject).toBe('Reset your password');
  });

  it('scrubs the body when a delivery is marked SENT (regression)', async () => {
    const mailOutboxToken = await insertMailOutbox(secretEmail);

    await markMailOutboxSent(mailOutboxToken, 'resend_msg_123');

    const row = await readRow(mailOutboxToken);
    expect(row.status).toBe('sent');
    expect(row.html).toBe('');
    expect(row.text_body).toBeNull();
  });

  it('audit-#W1: tryClaimPendingMailOutbox returns a distinct "failed" result for a terminal row', async () => {
    const mailOutboxToken = await insertMailOutbox(secretEmail);
    await markMailOutboxFailed(mailOutboxToken);

    // A terminal `failed` row (body already scrubbed) is not `in_flight` — it can never be
    // re-sent, so the claim result must be `failed` so the processor can fail a replay honestly.
    await expect(tryClaimPendingMailOutbox(mailOutboxToken)).resolves.toBe('failed');
  });
});
