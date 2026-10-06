import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { database } from '@/infrastructure/database/connection.js';
import {
  findMailOutboxByToken,
  insertMailOutbox,
} from '@/infrastructure/mail/mail-outbox.repository.js';
import { mail_outbox } from '@/infrastructure/mail/mail-outbox.schema.js';

const baseEmail = {
  to: 'user@example.com',
  subject: 'Notice',
  html: '<p>hi</p>',
} as const;

const RANDOM_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function findInternalId(mailOutboxToken: string): Promise<number | null> {
  const rows = await database
    .select({ id: mail_outbox.id })
    .from(mail_outbox)
    .where(eq(mail_outbox.resend_idempotency_token, mailOutboxToken));
  return rows[0]?.id ?? null;
}

describe('mail_outbox resend_idempotency_token — the row handle', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('gives every inserted row its own random token and returns it as the handle', async () => {
    const firstToken = await insertMailOutbox(baseEmail);
    const secondToken = await insertMailOutbox(baseEmail);

    expect(firstToken).toMatch(RANDOM_UUID_PATTERN);
    expect(secondToken).toMatch(RANDOM_UUID_PATTERN);
    expect(secondToken).not.toBe(firstToken);
  });

  it('issues a fresh token when RESTART IDENTITY hands out the same id again', async () => {
    // The failure the token fixes: cleanupDatabase() truncates with RESTART IDENTITY (as a restore
    // restarts a sequence), so the next row reuses id 1. A job — or a Resend key — naming the row
    // by that id would reach a different email; the token never repeats.
    const tokenBeforeReset = await insertMailOutbox(baseEmail);
    const idBeforeReset = await findInternalId(tokenBeforeReset);

    await cleanupDatabase();
    const tokenAfterReset = await insertMailOutbox(baseEmail);

    expect(await findInternalId(tokenAfterReset)).toBe(idBeforeReset);
    expect(tokenAfterReset).toMatch(RANDOM_UUID_PATTERN);
    expect(tokenAfterReset).not.toBe(tokenBeforeReset);
    // The old handle names nothing now — a job still carrying it completes as not found.
    expect(await findMailOutboxByToken(tokenBeforeReset)).toBeNull();
  });

  it('resolves a deduplicated insert to the existing row token', async () => {
    const dedupeKey = 'notification:ntf_dedupe00000000000000001:email:user@example.com';
    const firstToken = await insertMailOutbox({ ...baseEmail, dedupeKey });
    const secondToken = await insertMailOutbox({ ...baseEmail, dedupeKey });

    expect(secondToken).toBe(firstToken);
    expect(await database.select({ id: mail_outbox.id }).from(mail_outbox)).toHaveLength(1);
  });

  it('findMailOutboxByToken loads the row the token names', async () => {
    const mailOutboxToken = await insertMailOutbox(baseEmail);

    const row = await findMailOutboxByToken(mailOutboxToken);

    expect(row?.subject).toBe('Notice');
    expect(row?.status).toBe('pending');
  });
});
