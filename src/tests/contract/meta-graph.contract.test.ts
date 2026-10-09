import nock from 'nock';
import { describe, expect, test, vi } from 'vitest';

// The client reads the platform token and the Graph base URL from the env; pin both.
vi.mock('@/shared/config/env.config.js', async () => {
  const actual = await vi.importActual<typeof import('@/shared/config/env.config.js')>(
    '@/shared/config/env.config.js',
  );
  const envWithMeta = {
    ...actual.env,
    META_GRAPH_ACCESS_TOKEN: 'test-meta-graph-token',
    META_GRAPH_API_BASE_URL: 'https://graph.facebook.com/v21.0',
  };
  return { ...actual, env: envWithMeta, getEnv: () => envWithMeta };
});

import {
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage,
} from '@/infrastructure/messaging/meta-graph.client.js';
import { findMetaGraphApiError } from '@/infrastructure/messaging/meta-graph-error.util.js';
import { registerThirdPartyContractTestIsolationHooks } from './helpers/register-contract-test-hooks.js';

registerThirdPartyContractTestIsolationHooks();

const GRAPH_ORIGIN = 'https://graph.facebook.com';
const MESSAGES_PATH = '/v21.0/1012345678/messages';

/** A failed call's classified Graph error. */
async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  return findMetaGraphApiError(error);
}

/**
 * Contract test for the WhatsApp Cloud API sends (launch D32, D77): the free-text message and the
 * approved template the delivery worker sends outside the 24-hour window — the request bodies Meta
 * documents, the `wamid` read back, and a template Meta refuses read as a rejection of that one
 * message.
 */
describe('Meta Graph API (WhatsApp) contract', () => {
  test('a text: the bearer token, the number without its +, no link preview; reads the wamid', async () => {
    let captured: Record<string, unknown> | undefined;
    nock(GRAPH_ORIGIN)
      .post(MESSAGES_PATH, (body) => {
        captured = body as Record<string, unknown>;
        return true;
      })
      .matchHeader('authorization', 'Bearer test-meta-graph-token')
      .matchHeader('content-type', /application\/json/)
      .reply(200, {
        messaging_product: 'whatsapp',
        contacts: [{ input: '919800000001', wa_id: '919800000001' }],
        messages: [{ id: 'wamid.text' }],
      });

    const sent = await sendWhatsAppTextMessage({
      phoneNumberId: '1012345678',
      to: '+919800000001',
      body: 'Hi Asha',
    });

    expect(sent.providerMessageId).toBe('wamid.text');
    expect(captured).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919800000001',
      type: 'text',
      text: { body: 'Hi Asha', preview_url: false },
    });
  });

  test('a template: its name, language and body parameters in order', async () => {
    let captured: Record<string, unknown> | undefined;
    nock(GRAPH_ORIGIN)
      .post(MESSAGES_PATH, (body) => {
        captured = body as Record<string, unknown>;
        return true;
      })
      .reply(200, { messaging_product: 'whatsapp', messages: [{ id: 'wamid.template' }] });

    const sent = await sendWhatsAppTemplateMessage({
      phoneNumberId: '1012345678',
      to: '+919800000001',
      template: { name: 'booking_reminder', languageCode: 'en' },
      parameters: ['Asha', 'Vesu', '12 Oct', '10:30'],
    });

    expect(sent.providerMessageId).toBe('wamid.template');
    expect(captured).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919800000001',
      type: 'template',
      template: {
        name: 'booking_reminder',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Asha' },
              { type: 'text', text: 'Vesu' },
              { type: 'text', text: '12 Oct' },
              { type: 'text', text: '10:30' },
            ],
          },
        ],
      },
    });
  });

  test('a template with no parameters sends no components', async () => {
    let captured: { template?: { components?: unknown } } | undefined;
    nock(GRAPH_ORIGIN)
      .post(MESSAGES_PATH, (body) => {
        captured = body as typeof captured;
        return true;
      })
      .reply(200, { messages: [{ id: 'wamid.plain' }] });

    await sendWhatsAppTemplateMessage({
      phoneNumberId: '1012345678',
      to: '+919800000001',
      template: { name: 'hello_world', languageCode: 'en_US' },
      parameters: [],
    });

    expect(captured?.template?.components).toEqual([]);
  });

  test('a template Meta does not know is a rejection of this message — not an outage', async () => {
    nock(GRAPH_ORIGIN)
      .post(MESSAGES_PATH)
      .reply(404, {
        error: {
          message: '(#132001) Template name does not exist in the translation',
          type: 'OAuthException',
          code: 132001,
        },
      });

    const error = await failure(
      sendWhatsAppTemplateMessage({
        phoneNumberId: '1012345678',
        to: '+919800000001',
        template: { name: 'booking_reminder', languageCode: 'en' },
        parameters: ['Asha', 'Vesu', '12 Oct', '10:30'],
      }),
    );

    expect([error?.isMessageRejection, error?.countsAsCircuitFailure]).toEqual([true, false]);
    expect(error?.reason).toContain('Template name does not exist');
  });

  test('free text outside the window is refused by Meta (131047) — the message fails, the queue goes on', async () => {
    nock(GRAPH_ORIGIN)
      .post(MESSAGES_PATH)
      .reply(400, {
        error: {
          message: '(#131047) Re-engagement message',
          type: 'OAuthException',
          code: 131047,
        },
      });

    const error = await failure(
      sendWhatsAppTextMessage({ phoneNumberId: '1012345678', to: '+919800000001', body: 'Hi' }),
    );

    expect([error?.isMessageRejection, error?.isRateLimited, error?.metaErrorCode]).toEqual([
      true,
      false,
      131047,
    ]);
  });
});
