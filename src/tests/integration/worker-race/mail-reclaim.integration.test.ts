import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { mail_outbox } from '@/infrastructure/mail/mail-outbox.schema.js';
import {
  insertMailOutbox,
  reclaimStaleSendingMailOutboxTokens,
  tryClaimPendingMailOutbox,
} from '@/infrastructure/mail/mail-outbox.repository.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';

describe('Integration: mail outbox sending reclaim', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('reclaimStaleSendingMailOutboxTokens moves stuck sending rows back to pending', async () => {
    const mailOutboxToken = await insertMailOutbox({
      to: ['reclaim@example.com'],
      subject: 'Reclaim test',
      html: '<p>Hi</p>',
    });

    expect(await tryClaimPendingMailOutbox(mailOutboxToken)).toBe('claimed');

    await getOperatorDatabase()
      .update(mail_outbox)
      .set({ updated_at: new Date(Date.now() - 60 * 60_000) })
      .where(eq(mail_outbox.resend_idempotency_token, mailOutboxToken));

    const reclaimedTokens = await reclaimStaleSendingMailOutboxTokens(new Date(), 10);

    expect(reclaimedTokens).toEqual([mailOutboxToken]);

    const rows = await getOperatorDatabase()
      .select({ status: mail_outbox.status })
      .from(mail_outbox)
      .where(eq(mail_outbox.resend_idempotency_token, mailOutboxToken));

    expect(rows[0]?.status).toBe('pending');
  });
});
