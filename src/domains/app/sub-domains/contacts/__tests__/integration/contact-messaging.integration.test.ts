import { createHmac } from 'node:crypto';
import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { metaCircuit } from '@/infrastructure/resilience/circuit-breaker.js';
import { ProviderOutageError } from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { runContactMessageDeliveryJob } from '@/domains/app/sub-domains/contacts/contact-activities/workers/contact-message-delivery.processor.js';
import { findOrganizationsWithQueuedMessages } from '@/domains/app/sub-domains/contacts/contact-activities/contact-message-delivery.repository.js';
import { runMessagingWebhookEventJob } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/workers/messaging-webhook-event.processor.js';
import {
  findOrganizationsWithPendingMessagingEvents,
  purgeOldMessagingWebhookEvents,
} from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.repository.js';

/** The harness's fake Meta app (`harness-provider-env.ts`). */
const META_APP_SECRET = 'test-meta-app-secret';
const META_VERIFY_TOKEN = 'test-meta-webhook-verify-token';
const GRAPH = 'https://graph.facebook.com';
const GRAPH_VERSION = '/v21.0';

/**
 * Launch ROUTE #139, messaging (D77, WC-1–WC-3): the clinic's WhatsApp and Instagram accounts in
 * its settings, the composer's status, the delivery worker (sent, refused, held through a
 * throttle), the platform Meta app's webhook (handshake, signature, deduplication) and its
 * processing (reports move forward only, replies join the stream, a new WhatsApp number becomes a
 * lead, an Instagram handle is matched), the one-minute sweep's reads and the 30-day purge — over
 * the fixture organization, the Graph API answered by nock.
 */
describe('Messaging — integration (launch D77, ROUTE #139)', () => {
  const S = String(Date.now());
  const WHATSAPP_ID = `10${S.slice(-10)}`;
  const INSTAGRAM_ID = `17${S.slice(-10)}`;
  const digits = `7${S.slice(-7)}`;
  const ASHA_PHONE = `+91${digits}01`;
  const STRANGER_PHONE = `+91${digits}99`;
  const BELA_SENDER = `9${S.slice(-12)}1`;
  const STRANGER_SENDER = `9${S.slice(-12)}2`;
  const REASON = '.error.reason';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let asha = '';
  let bela = '';

  /** A contact of this run. */
  async function person(body: Record<string, unknown>): Promise<string> {
    await flow.expect(200, `contact ${String(body.first_name)}`, 'POST', '/app/contacts', body);
    return flow.last('.data.id');
  }

  /** Writes a message to a contact; answers its id. */
  async function sendMessage(contactId: string, type: 'whatsapp' | 'instagram', body: string) {
    await flow.expect(
      200,
      `${type} to ${contactId}`,
      'POST',
      `/app/contacts/${contactId}/activities/send-message`,
      {
        type,
        body,
      },
    );
    return flow.last('.data.id');
  }

  /** One entry of a contact's stream, as the API answers it. */
  async function entry(contactId: string, activityId: string): Promise<Record<string, unknown>> {
    await flow.expect(
      200,
      `entry ${activityId}`,
      'GET',
      `/app/contacts/${contactId}/activities/${activityId}`,
    );
    return (flow.lastBody() as { data: Record<string, unknown> }).data;
  }

  /** The contact's stream, newest first. */
  async function stream(contactId: string): Promise<Record<string, unknown>[]> {
    await flow.expect(
      200,
      `stream ${contactId}`,
      'GET',
      `/app/contacts/${contactId}/activities?order=desc&limit=50`,
    );
    return (flow.lastBody() as { data: Record<string, unknown>[] }).data;
  }

  /** A Meta callback, signed as Meta signs it. */
  function postCallback(body: unknown, options: { signature?: string } = {}) {
    const raw = JSON.stringify(body);
    const signature =
      options.signature ??
      `sha256=${createHmac('sha256', META_APP_SECRET).update(raw).digest('hex')}`;
    return app.inject({
      method: 'POST',
      url: testApiPath('/app/messaging-webhook'),
      payload: raw,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    });
  }

  /** A WhatsApp `messages` change for the clinic's number. */
  function whatsAppCallback(value: Record<string, unknown>, phoneNumberId = WHATSAPP_ID) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: phoneNumberId },
                ...value,
              },
            },
          ],
        },
      ],
    };
  }

  /** An Instagram `messaging` callback for the clinic's account. */
  function instagramCallback(event: Record<string, unknown>) {
    return {
      object: 'instagram',
      entry: [{ id: INSTAGRAM_ID, time: Date.now(), messaging: [event] }],
    };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    flow.as('owner');
    asha = await person({ first_name: 'Asha', phones: [{ phone: ASHA_PHONE, is_primary: true }] });
    bela = await person({
      first_name: 'Bela',
      phones: [{ phone: `+91${digits}02`, is_primary: true }],
      instagram_handles: ['Bela.Glow'],
    });
  });

  afterEach(async () => {
    nock.cleanAll();
    await metaCircuit.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. the clinic connects its WhatsApp number and Instagram account', async () => {
    flow.as('owner');
    await flow.expect(200, 'connect both accounts', 'PATCH', '/tenancy/organization/settings', {
      whatsapp_phone_number_id: WHATSAPP_ID,
      instagram_account_id: INSTAGRAM_ID,
    });
    flow.expectValue(
      'the settings echo them',
      '[.data.whatsapp_phone_number_id, .data.instagram_account_id] | join(",")',
      `${WHATSAPP_ID},${INSTAGRAM_ID}`,
    );
    await flow.expect(400, 'an id that is not digits', 'PATCH', '/tenancy/organization/settings', {
      whatsapp_phone_number_id: 'not-a-number',
    });

    const other = await createAppFixture(app);
    const otherFlow = new AppFlow(app, other);
    otherFlow.as('owner');
    await otherFlow.expect(
      409,
      "another clinic's number",
      'PATCH',
      '/tenancy/organization/settings',
      {
        whatsapp_phone_number_id: WHATSAPP_ID,
      },
    );
    otherFlow.expectValue('taken: why', REASON, 'messaging_account_taken');
    await otherFlow.expect(
      200,
      'disconnecting is a null',
      'PATCH',
      '/tenancy/organization/settings',
      {
        instagram_account_id: null,
      },
    );
    otherFlow.expectValue('not connected', '.data.instagram_account_id', 'null');
  });

  it("2. the composer's status: delivery, Meta, each channel's account and queue", async () => {
    flow.as('front_desk');
    await sendMessage(asha, 'whatsapp', 'Hi Asha, your report is ready.');
    await flow.expect(200, 'the status', 'GET', '/app/contact-activities/messaging-status');
    flow.expectValue(
      'delivery off in tests, Meta up, both connected, one WhatsApp queued',
      '[.data.is_delivery_enabled, .data.is_provider_down, .data.whatsapp.is_connected, .data.whatsapp.queued_count, .data.instagram.is_connected, .data.instagram.queued_count] | map(tostring) | join(",")',
      'false,false,true,1,true,0',
    );
    await flow.expect(
      400,
      'it takes no query',
      'GET',
      '/app/contact-activities/messaging-status?x=1',
    );
  });

  it('3. delivery: sent with Meta’s id, refused with a reason, held through a throttle', async () => {
    const organizationPublicId = fixture.organization.publicId;
    flow.as('front_desk');
    const sentTo: string[] = [];
    nock(GRAPH)
      .matchHeader('authorization', 'Bearer test-meta-graph-access-token')
      .post(
        `${GRAPH_VERSION}/${WHATSAPP_ID}/messages`,
        (body: { to: string; text: { body: string } }) => {
          sentTo.push(body.to);
          return true;
        },
      )
      .reply(200, { messages: [{ id: 'wamid.ONE' }] });
    const first = await runContactMessageDeliveryJob(organizationPublicId);
    expect(first).toEqual({ sentCount: 1, failedCount: 0, summaryCount: 0 });
    expect(sentTo).toEqual([ASHA_PHONE.slice(1)]);
    const sent = (await stream(asha)).find((item) => item.provider_message_id === 'wamid.ONE');
    expect(sent?.delivery_status).toBe('sent');

    // No Instagram conversation yet: refused before any call (D77).
    const toInstagram = await sendMessage(asha, 'instagram', 'Hi on Instagram');
    expect(await runContactMessageDeliveryJob(organizationPublicId)).toEqual({
      sentCount: 0,
      failedCount: 1,
      summaryCount: 0,
    });
    const refused = await entry(asha, toInstagram);
    expect([refused.delivery_status, String(refused.failure_reason)]).toEqual([
      'failed',
      'No Instagram conversation with this person yet — they need to message the clinic first',
    ]);

    // Meta refuses this one message: failed with Meta's words, no retry.
    const undeliverable = await sendMessage(asha, 'whatsapp', 'Second message');
    nock(GRAPH)
      .post(`${GRAPH_VERSION}/${WHATSAPP_ID}/messages`)
      .reply(400, { error: { message: '(#131026) Message undeliverable', code: 131_026 } });
    expect(await runContactMessageDeliveryJob(organizationPublicId)).toEqual({
      sentCount: 0,
      failedCount: 1,
      summaryCount: 0,
    });
    const failed = await entry(asha, undeliverable);
    expect([failed.delivery_status, failed.failure_reason]).toEqual([
      'failed',
      '(#131026) Message undeliverable',
    ]);

    // Resent, then Meta throttles: the job pauses the queue and the message stays queued, unclaimed.
    await flow.expect(
      200,
      'resend it',
      'POST',
      `/app/contacts/${asha}/activities/${undeliverable}/resend`,
    );
    nock(GRAPH)
      .post(`${GRAPH_VERSION}/${WHATSAPP_ID}/messages`)
      .reply(429, { error: { message: 'Rate limit hit', code: 130_429 } }, { 'retry-after': '30' });
    const throttled = await runContactMessageDeliveryJob(organizationPublicId).catch(
      (error: unknown) => error,
    );
    expect(throttled).toBeInstanceOf(ProviderOutageError);
    expect((throttled as ProviderOutageError).retryAfterMs).toBe(30_000);
    const [held] = await getOperatorSql()`
      select delivery_status, delivery_claimed_at from app.contact_activities
      where public_id = ${undeliverable}`;
    expect([held?.delivery_status, held?.delivery_claimed_at]).toEqual(['queued', null]);

    // Meta is back: it goes out.
    nock(GRAPH)
      .post(`${GRAPH_VERSION}/${WHATSAPP_ID}/messages`)
      .reply(200, { messages: [{ id: 'wamid.TWO' }] });
    expect(await runContactMessageDeliveryJob(organizationPublicId)).toEqual({
      sentCount: 1,
      failedCount: 0,
      summaryCount: 0,
    });
    expect((await entry(asha, undeliverable)).provider_message_id).toBe('wamid.TWO');
  });

  it('4. the webhook: the handshake, the signature, one row per update', async () => {
    const handshake = (token: string) =>
      app.inject({
        method: 'GET',
        url: testApiPath(
          `/app/messaging-webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=8231`,
        ),
      });
    const accepted = await handshake(META_VERIFY_TOKEN);
    expect([accepted.statusCode, accepted.body, accepted.headers['content-type']]).toEqual([
      200,
      '8231',
      'text/plain; charset=utf-8',
    ]);
    const refused = await handshake('someone-else');
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.reason).toBe('verify_token_mismatch');

    const delivered = whatsAppCallback({
      statuses: [{ id: 'wamid.ONE', status: 'delivered', timestamp: '1791500000' }],
    });
    const unsigned = await app.inject({
      method: 'POST',
      url: testApiPath('/app/messaging-webhook'),
      payload: JSON.stringify(delivered),
      headers: { 'content-type': 'application/json' },
    });
    expect(unsigned.statusCode).toBe(400);
    expect(
      (await postCallback(delivered, { signature: `sha256=${'0'.repeat(64)}` })).statusCode,
    ).toBe(400);

    const stored = await postCallback(delivered);
    expect([stored.statusCode, stored.json().data.stored_count]).toEqual([200, 1]);
    // Meta retries the same update: nothing new.
    expect((await postCallback(delivered)).json().data.stored_count).toBe(0);
    // A number no clinic connected: answered 200, kept nowhere.
    const elsewhere = await postCallback(
      whatsAppCallback({ statuses: [{ id: 'wamid.X', status: 'read' }] }, '999999999'),
    );
    expect([elsewhere.statusCode, elsewhere.json().data.stored_count]).toEqual([200, 0]);
    // Another object (a page's feed) is not a message.
    expect(
      (await postCallback({ object: 'page', entry: [{ id: '1', changes: [] }] })).json().data
        .stored_count,
    ).toBe(0);
  });

  it('5. processing: reports move forward only, replies join the stream, a new number is a lead', async () => {
    const organizationPublicId = fixture.organization.publicId;
    await postCallback(
      whatsAppCallback({
        statuses: [
          { id: 'wamid.ONE', status: 'read', timestamp: '1791500100' },
          // Late and out of order: never moves a read message back.
          { id: 'wamid.ONE', status: 'sent', timestamp: '1791499900' },
        ],
      }),
    );
    await postCallback(
      whatsAppCallback({
        contacts: [{ wa_id: STRANGER_PHONE.slice(1), profile: { name: 'Kiran' } }],
        messages: [
          {
            from: ASHA_PHONE.slice(1),
            id: 'wamid.IN1',
            timestamp: '1791500200',
            type: 'text',
            text: { body: 'Thank you!' },
            context: { id: 'wamid.ONE' },
          },
          {
            from: STRANGER_PHONE.slice(1),
            id: 'wamid.IN2',
            timestamp: '1791500300',
            type: 'image',
          },
        ],
      }),
    );
    const counts = await runMessagingWebhookEventJob(organizationPublicId);
    expect(counts).toEqual({ processedCount: 3, failedCount: 0 });

    flow.as('front_desk');
    const ashaStream = await stream(asha);
    const original = ashaStream.find((item) => item.provider_message_id === 'wamid.ONE');
    expect([
      original?.delivery_status,
      original?.delivered_at !== null,
      original?.read_at !== null,
    ]).toEqual(['read', true, true]);
    const reply = ashaStream.find((item) => item.provider_message_id === 'wamid.IN1');
    expect([reply?.direction, reply?.body, reply?.reply_to_contact_activity_id]).toEqual([
      'received',
      'Thank you!',
      original?.id,
    ]);

    const [stranger] = await getOperatorSql()`
      select contacts.first_name, contacts.primary_phone, leads.source, leads.status,
        (select body from app.contact_activities where contact_id = contacts.id) as body
      from app.contacts join app.leads on leads.contact_id = contacts.id
      where contacts.primary_phone = ${STRANGER_PHONE}`;
    expect(stranger).toMatchObject({
      first_name: 'Kiran',
      source: 'whatsapp',
      status: 'new',
      body: '(image)',
    });
    // Applied once: nothing pending, a rerun does nothing.
    expect(await runMessagingWebhookEventJob(organizationPublicId)).toEqual({
      processedCount: 0,
      failedCount: 0,
    });
  });

  it('6. Instagram: a known handle writes, the reply goes to them, a stranger is dropped', async () => {
    const organizationPublicId = fixture.organization.publicId;
    nock(GRAPH)
      .get(`${GRAPH_VERSION}/${BELA_SENDER}`)
      .query({ fields: 'username' })
      .reply(200, { username: 'bela.glow' });
    nock(GRAPH)
      .get(`${GRAPH_VERSION}/${STRANGER_SENDER}`)
      .query({ fields: 'username' })
      .reply(200, { username: 'nobody.here' });
    await postCallback(
      instagramCallback({
        sender: { id: BELA_SENDER },
        recipient: { id: INSTAGRAM_ID },
        timestamp: 1_791_500_400_000,
        message: { mid: 'mid.IN1', text: 'Do you do peels?' },
      }),
    );
    await postCallback(
      instagramCallback({
        sender: { id: STRANGER_SENDER },
        recipient: { id: INSTAGRAM_ID },
        timestamp: 1_791_500_500_000,
        message: { mid: 'mid.IN2', text: 'Hello?' },
      }),
    );
    expect(await runMessagingWebhookEventJob(organizationPublicId)).toEqual({
      processedCount: 2,
      failedCount: 0,
    });
    flow.as('front_desk');
    const received = (await stream(bela)).find((item) => item.provider_message_id === 'mid.IN1');
    expect([received?.type, received?.direction, received?.body]).toEqual([
      'instagram',
      'received',
      'Do you do peels?',
    ]);
    const [dropped] = await getOperatorSql()`
      select count(*)::int as count from app.contact_activities where provider_message_id = 'mid.IN2'`;
    expect(dropped?.count).toBe(0);

    // The reply goes to the Instagram-scoped id Bela wrote from.
    const answer = await sendMessage(bela, 'instagram', 'Yes — book a consultation');
    let recipient = '';
    nock(GRAPH)
      .post(`${GRAPH_VERSION}/${INSTAGRAM_ID}/messages`, (body: { recipient: { id: string } }) => {
        recipient = body.recipient.id;
        return true;
      })
      .reply(200, { recipient_id: BELA_SENDER, message_id: 'mid.OUT' });
    expect(await runContactMessageDeliveryJob(organizationPublicId)).toEqual({
      sentCount: 1,
      failedCount: 0,
      summaryCount: 0,
    });
    expect(recipient).toBe(BELA_SENDER);

    // Bela reads it.
    await postCallback(
      instagramCallback({
        sender: { id: BELA_SENDER },
        recipient: { id: INSTAGRAM_ID },
        timestamp: 1_791_500_600_000,
        read: { mid: 'mid.OUT' },
      }),
    );
    expect(await runMessagingWebhookEventJob(organizationPublicId)).toEqual({
      processedCount: 1,
      failedCount: 0,
    });
    expect((await entry(bela, answer)).delivery_status).toBe('read');
  });

  it('7. the sweep finds what no job holds; the purge keeps 30 days', async () => {
    const organizationId = fixture.organization.id;
    flow.as('front_desk');
    await sendMessage(asha, 'whatsapp', 'Waiting for the sweep');
    await getOperatorSql()`
      insert into app.messaging_webhook_events (organization_id, channel, payload, payload_hash, status, received_at, processed_at, created_at, updated_at)
      values
        (${organizationId}, 'whatsapp', '{}'::jsonb, ${'a'.repeat(64)}, 'pending', now(), null, now(), now()),
        (${organizationId}, 'whatsapp', '{}'::jsonb, ${'b'.repeat(64)}, 'processed', now() - interval '40 days', now() - interval '40 days', now() - interval '40 days', now() - interval '40 days'),
        (${organizationId}, 'whatsapp', '{}'::jsonb, ${'c'.repeat(64)}, 'pending', now() - interval '40 days', null, now() - interval '40 days', now() - interval '40 days')`;
    const queued = await runGlobalRetentionWorkerJob((handle) =>
      findOrganizationsWithQueuedMessages(handle, 0),
    );
    expect(queued.map((organization) => organization.publicId)).toContain(
      fixture.organization.publicId,
    );
    const pending = await runGlobalRetentionWorkerJob((handle) =>
      findOrganizationsWithPendingMessagingEvents(handle, 0),
    );
    expect(pending.map((organization) => organization.publicId)).toContain(
      fixture.organization.publicId,
    );

    const purged = await runGlobalRetentionWorkerJob((handle) =>
      purgeOldMessagingWebhookEvents(handle),
    );
    expect(purged.deletedCount).toBe(1);
    const left = await getOperatorSql()`
      select payload_hash from app.messaging_webhook_events
      where payload_hash in (${'a'.repeat(64)}, ${'b'.repeat(64)}, ${'c'.repeat(64)}) order by payload_hash`;
    // The processed one past 30 days is gone; a pending one stays until it is applied.
    expect(left.map((row) => String(row.payload_hash).charAt(0))).toEqual(['a', 'c']);
  });
});
