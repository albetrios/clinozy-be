import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Resend } from 'resend';
import { sendEmail } from '@/infrastructure/mail/mail.service.js';
import { env } from '@/shared/config/env.config.js';
import { registerThirdPartyContractTestIsolationHooks } from './helpers/register-contract-test-hooks.js';

registerThirdPartyContractTestIsolationHooks();

/** Resend's test inbox that always accepts delivery. */
const RESEND_DELIVERED_TEST_ADDRESS = 'delivered@resend.dev';

/**
 * Live check against Resend (`pnpm test:contract:live`): our `sendEmail` sends from the configured
 * `EMAIL_FROM_ADDRESS` to Resend's always-delivered test address, and Resend reports the message
 * as sent or delivered.
 */
describe('Resend (live)', () => {
  it('sends through sendEmail and Resend reports the message accepted for delivery', async () => {
    const runId = randomUUID();
    const messageId = await sendEmail({
      to: RESEND_DELIVERED_TEST_ADDRESS,
      subject: `Contract live check ${runId}`,
      html: '<p>Contract live check</p>',
      text: 'Contract live check',
      tags: [{ name: 'purpose', value: 'contract-live' }],
      idempotencyKey: `contract-live-${runId}`,
    });
    expect(messageId).toMatch(/^[0-9a-f-]{36}$/);

    const resend = new Resend(env.RESEND_API_KEY);
    let lastEvent: string | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data, error } = await resend.emails.get(messageId);
      expect(error).toBeNull();
      lastEvent = data?.last_event;
      if (lastEvent === 'delivered') break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(['sent', 'delivered']).toContain(lastEvent);
  });
});
