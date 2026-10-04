import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { database } from '@/infrastructure/database/connection.js';
import { insertMailOutbox } from '@/infrastructure/mail/mail-outbox.repository.js';
import { mail_outbox } from '@/infrastructure/mail/mail-outbox.schema.js';

const baseEmail = {
  to: 'user@example.com',
  subject: 'Notice',
  html: '<p>hi</p>',
} as const;

const RANDOM_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function findResendIdempotencyToken(mailOutboxId: number): Promise<string | null> {
  const rows = await database
    .select({ resendIdempotencyToken: mail_outbox.resend_idempotency_token })
    .from(mail_outbox)
    .where(eq(mail_outbox.id, mailOutboxId));
  return rows[0]?.resendIdempotencyToken ?? null;
}

describe('mail_outbox resend_idempotency_token', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('gives every inserted row its own random token', async () => {
    const firstToken = await findResendIdempotencyToken(await insertMailOutbox(baseEmail));
    const secondToken = await findResendIdempotencyToken(await insertMailOutbox(baseEmail));

    expect(firstToken).toMatch(RANDOM_UUID_PATTERN);
    expect(secondToken).toMatch(RANDOM_UUID_PATTERN);
    expect(secondToken).not.toBe(firstToken);
  });

  it('issues a fresh token when RESTART IDENTITY hands out the same id again', async () => {
    // The failure this column fixes: cleanupDatabase() truncates with RESTART IDENTITY, so the next
    // row reuses id 1 — and the old `mail-outbox-<id>` key repeated one Resend still held for 24
    // hours, which it rejects (409) when the body differs, so that email was never delivered.
    const idBeforeReset = await insertMailOutbox(baseEmail);
    const tokenBeforeReset = await findResendIdempotencyToken(idBeforeReset);

    await cleanupDatabase();
    const idAfterReset = await insertMailOutbox(baseEmail);
    const tokenAfterReset = await findResendIdempotencyToken(idAfterReset);

    expect(idAfterReset).toBe(idBeforeReset);
    expect(tokenAfterReset).toMatch(RANDOM_UUID_PATTERN);
    expect(tokenAfterReset).not.toBe(tokenBeforeReset);
  });
});
