import { createHmac } from 'node:crypto';
import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { env } from '@/shared/config/env.config.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { metaCircuit } from '@/infrastructure/resilience/circuit-breaker.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { runTaskRulesJob } from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';
import { runContactMessageDeliveryJob } from '@/domains/app/sub-domains/contacts/contact-activities/workers/contact-message-delivery.processor.js';
import { runMessagingWebhookEventJob } from '@/domains/app/sub-domains/contacts/contact-messaging-webhook/workers/messaging-webhook-event.processor.js';

/** The harness's fake Meta app (`harness-provider-env.ts`). */
const META_APP_SECRET = 'test-meta-app-secret';
const GRAPH = 'https://graph.facebook.com';

/** One Graph send the nock recorder saw. */
interface GraphSend {
  path: string;
  body: Record<string, unknown>;
}

/**
 * Launch ROUTE #140–#142 (D78): the booking messages (WC-5 the confirm request, WC-6 the
 * day-before reminder, WC-7 moves and cancels, WC-8 a "Yes" confirms), the receipt (WC-9), the
 * day-close summary to the admins (WC-10) and a visit share's files as media (WC-11) — the rules
 * run, the delivery job and the webhook over the fixture organization, the Graph API answered by
 * nock.
 */
describe('Clinozy messages — integration (launch D78, ROUTE #140–#142)', () => {
  const S = String(Date.now());
  const WHATSAPP_ID = `11${S.slice(-10)}`;
  const INSTAGRAM_ID = `18${S.slice(-10)}`;
  const digits = `8${S.slice(-7)}`;
  const ASHA_PHONE = `+91${digits}01`;
  const OWNER_PHONE = `+91${digits}90`;
  const BELA_SENDER = `8${S.slice(-12)}1`;
  const lastName = `m${S}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let organizationPublicId = '';
  let vesu = '';
  let doctor = '';
  let day = '';
  let today = '';
  let tomorrow = '';
  let asha = '';
  let bela = '';
  let chirag = '';
  let ashaBooking = '';
  let deliveryWasEnabled = false;
  let sends: GraphSend[] = [];
  let graphMessageCount = 0;

  /** Answers every Graph send with a fresh `wamid`, and keeps what was sent. */
  function recordGraphSends(): void {
    sends = [];
    nock(GRAPH)
      .persist()
      .post(/\/messages$/, (body: Record<string, unknown>) => {
        sends.push({ path: '', body });
        return true;
      })
      .reply(200, () => {
        graphMessageCount += 1;
        return { messages: [{ id: `wamid.${graphMessageCount}.${S}` }] };
      });
  }

  /** `count` working dates (Monday–Saturday) from today + `from`, in the fixture's time zone. */
  function workDays(from: number, count: number): string[] {
    const timeZone = fixture.organization.timezone;
    const found: string[] = [];
    for (let offset = from; found.length < count && offset < from + 30; offset += 1) {
      const at = new Date(Date.now() + offset * 86_400_000);
      if (new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at) !== 'Sun') {
        found.push(new Intl.DateTimeFormat('en-CA', { timeZone }).format(at));
      }
    }
    return found;
  }

  /** A contact of this run with its own number. */
  async function person(firstName: string, suffix: string): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  /** Books the contact at Vesu with the doctor; answers the booking's id. */
  async function book(contact: string, date: string, start: string, extra = {}): Promise<string> {
    await flow.expect(200, `book ${contact} ${date} ${start}`, 'POST', '/app/appointments', {
      contact_id: contact,
      branch_id: vesu,
      doctor_membership_id: doctor,
      appointment_date: date,
      start_time: start,
      service_label: 'Consultation',
      ...extra,
    });
    return flow.last('.data.id');
  }

  /** The organization's rules run (TK4), as the worker runs it. */
  function runRules() {
    return runOrganizationScopedWorkerJob({ organizationPublicId }, (handle) =>
      runTaskRulesJob(handle, organizationPublicId),
    );
  }

  /** Clinozy's messages about a booking, oldest first. */
  async function bookingMessages(appointment: string) {
    return getOperatorSql()<
      {
        automation_kind: string;
        delivery_status: string;
        failure_reason: string | null;
        body: string;
      }[]
    >`
      SELECT activity.automation_kind, activity.delivery_status, activity.failure_reason, activity.body
      FROM app.contact_activities activity
      JOIN app.appointments booking ON booking.id = activity.appointment_id
      WHERE booking.public_id = ${appointment} AND activity.automation_kind IS NOT NULL
      ORDER BY activity.id
    `;
  }

  /** A booking's status, reminder status and "Replied Yes", as the API answers them. */
  async function bookingState(appointment: string): Promise<string> {
    await flow.expect(200, `read ${appointment}`, 'GET', `/app/appointments/${appointment}`);
    const data = (flow.lastBody() as { data: Record<string, unknown> }).data;
    return [data.status, data.reminder_status, data.is_confirmed_by_reply].map(String).join(',');
  }

  /** A WhatsApp callback for the clinic's number, signed as Meta signs it, then applied. */
  async function receiveWhatsApp(value: Record<string, unknown>): Promise<void> {
    const raw = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: WHATSAPP_ID },
                ...value,
              },
            },
          ],
        },
      ],
    });
    const response = await app.inject({
      method: 'POST',
      url: testApiPath('/app/messaging-webhook'),
      payload: raw,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${createHmac('sha256', META_APP_SECRET).update(raw).digest('hex')}`,
      },
    });
    expect(response.statusCode).toBe(200);
    await runMessagingWebhookEventJob(organizationPublicId);
  }

  /** A reply from Asha's number. */
  function ashaSays(text: string, id: string) {
    return receiveWhatsApp({
      contacts: [{ wa_id: ASHA_PHONE.slice(1), profile: { name: 'Asha' } }],
      messages: [
        {
          from: ASHA_PHONE.slice(1),
          id,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'text',
          text: { body: text },
        },
      ],
    });
  }

  /** A confirmed upload of the fixture organization; answers its key. */
  async function confirmedUpload(name: string, mimeType: string): Promise<string> {
    const key = `organizations/${organizationPublicId}/uploads/${lastName}-${name}`;
    await getOperatorSql()`
      INSERT INTO upload.uploads (public_id, user_id, organization_id, file_name, file_key, mime_type,
        file_size, bucket, status, uploaded_at)
      VALUES (${generatePublicId('upload')}, ${fixture.members.owner.userId}, ${fixture.organization.id},
        ${name}, ${key}, ${mimeType}, 4096, 'local', 'UPLOADED', now())
    `;
    return key;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    organizationPublicId = fixture.organization.publicId;
    vesu = fixture.branches.vesu;
    doctor = fixture.members.doctor.membershipPublicId;
    [day = ''] = workDays(3, 1);
    today = calendarDay(fixture, 0);
    tomorrow = calendarDay(fixture, 1);
    deliveryWasEnabled = env.MESSAGING_DELIVERY_ENABLED;
    env.MESSAGING_DELIVERY_ENABLED = true;

    flow.as('owner');
    await flow.expect(200, 'connect the accounts', 'PATCH', '/tenancy/organization/settings', {
      whatsapp_phone_number_id: WHATSAPP_ID,
      instagram_account_id: INSTAGRAM_ID,
    });
    await getOperatorSql()`
      UPDATE tenancy.memberships SET phone = ${OWNER_PHONE} WHERE id = ${fixture.members.owner.membershipId}
    `;
    asha = await person('Asha', '01');
    bela = await person('Bela', '02');
    chirag = await person('Chirag', '03');
  });

  afterEach(async () => {
    nock.cleanAll();
    await metaCircuit.reset();
  });

  afterAll(async () => {
    env.MESSAGING_DELIVERY_ENABLED = deliveryWasEnabled;
    await app.close();
  });

  it('WC-5: a booking gets its confirm request; a walk-in none; a second run adds nothing', async () => {
    flow.as('front_desk');
    ashaBooking = await book(asha, day, '10:00');
    const run = await runRules();
    expect(run.messageCount).toBeGreaterThanOrEqual(1);
    const messages = await bookingMessages(ashaBooking);
    expect(
      messages.map((message) => `${message.automation_kind}:${message.delivery_status}`),
    ).toEqual(['booking_confirm:queued']);
    expect(messages[0]?.body).toMatch(
      /^Hi Asha, your visit at .+ is booked for .+ at 10:00\. Reply YES to confirm\.$/,
    );
    expect(await bookingState(ashaBooking)).toBe('scheduled,confirm_requested,false');

    await runRules();
    expect(await bookingMessages(ashaBooking)).toHaveLength(1);

    await flow.expect(200, 'Bela walks in', 'POST', '/app/appointments', {
      contact_id: bela,
      branch_id: vesu,
      doctor_membership_id: doctor,
      service_label: 'Consultation',
      is_walk_in: true,
    });
    const walkIn = flow.last('.data.id');
    await runRules();
    expect(await bookingMessages(walkIn)).toHaveLength(0);
  });

  it('WC-8: the request goes out and a "Yes" confirms the booking — a hedged yes does not', async () => {
    recordGraphSends();
    const counts = await runContactMessageDeliveryJob(organizationPublicId);
    expect(counts.sentCount).toBeGreaterThanOrEqual(1);
    expect(sends.some((send) => send.body.to === ASHA_PHONE.slice(1))).toBe(true);
    expect((await bookingMessages(ashaBooking))[0]?.delivery_status).toBe('sent');

    await ashaSays('yes but can we move it', `wamid.hedge.${S}`);
    expect(await bookingState(ashaBooking)).toBe('scheduled,confirm_requested,false');
    await ashaSays('Yes 👍', `wamid.yes.${S}`);
    expect(await bookingState(ashaBooking)).toBe('confirmed,confirm_requested,true');
  });

  it('WC-7: a move stops the waiting message and asks again; a cancel stops it; a reinstate asks again', async () => {
    flow.as('front_desk');
    const belaBooking = await book(bela, day, '11:00');
    await runRules();
    expect((await bookingMessages(belaBooking)).map((message) => message.delivery_status)).toEqual([
      'queued',
    ]);

    await flow.expect(200, 'move it to 12:00', 'PATCH', `/app/appointments/${belaBooking}`, {
      start_time: '12:00',
    });
    expect(await bookingState(belaBooking)).toBe('scheduled,not_sent,false');
    let messages = await bookingMessages(belaBooking);
    expect([messages[0]?.delivery_status, messages[0]?.failure_reason]).toEqual([
      'failed',
      'reminder_stopped',
    ]);
    await runRules();
    messages = await bookingMessages(belaBooking);
    expect(messages).toHaveLength(2);
    expect(messages[1]?.body).toContain('at 12:00');

    // A stopped message is no failure to chase: no failed_message task for Bela.
    const failedTasks = await getOperatorSql()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM app.tasks task
      JOIN app.contacts contact ON contact.id = task.contact_id
      WHERE contact.public_id = ${bela} AND task.rule_key = 'failed_message'
    `;
    expect(failedTasks[0]?.count).toBe(0);

    await flow.expect(200, 'cancel it', 'POST', `/app/appointments/${belaBooking}/cancel`, {
      cancel_reason: 'patient_asked',
    });
    messages = await bookingMessages(belaBooking);
    expect(messages.map((message) => message.delivery_status)).toEqual(['failed', 'failed']);

    await flow.expect(200, 'restore it', 'POST', `/app/appointments/${belaBooking}/reinstate`);
    expect(await bookingState(belaBooking)).toBe('scheduled,not_sent,false');
    await runRules();
    expect((await bookingMessages(belaBooking)).at(-1)?.delivery_status).toBe('queued');
  });

  it("WC-6: tomorrow's booking gets the day-before reminder once the clinic's hour has passed", async () => {
    flow.as('owner');
    await flow.expect(200, 'reminders from midnight', 'PATCH', '/tenancy/organization/settings', {
      reminder_hour: 0,
    });
    flow.as('front_desk');
    const chiragBooking = await book(chirag, day, '14:00');
    await runRules();
    await getOperatorSql()`
      UPDATE app.appointments
      SET appointment_date = ${tomorrow}, created_at = now() - interval '3 days',
        updated_at = greatest(updated_at, now() - interval '3 days')
      WHERE public_id = ${chiragBooking}
    `;
    await runRules();
    const messages = await bookingMessages(chiragBooking);
    expect(messages.map((message) => message.automation_kind)).toEqual([
      'booking_confirm',
      'booking_reminder',
    ]);
    expect(messages[1]?.body).toMatch(/tomorrow, .+ at 14:00\. Reply YES to confirm\.$/);
    expect(await bookingState(chiragBooking)).toBe('scheduled,reminder_queued,false');

    recordGraphSends();
    await runContactMessageDeliveryJob(organizationPublicId);
    expect(await bookingState(chiragBooking)).toBe('scheduled,reminder_sent,false');

    // Meta reports the reminder undelivered: the booking shows it failed.
    const wamid = await getOperatorSql()<{ provider_message_id: string }[]>`
      SELECT activity.provider_message_id FROM app.contact_activities activity
      JOIN app.appointments booking ON booking.id = activity.appointment_id
      WHERE booking.public_id = ${chiragBooking} AND activity.automation_kind = 'booking_reminder'
    `;
    await receiveWhatsApp({
      statuses: [
        {
          id: wamid[0]?.provider_message_id,
          status: 'failed',
          timestamp: String(Math.floor(Date.now() / 1000)),
          errors: [{ code: 131_026, title: 'Message undeliverable' }],
        },
      ],
    });
    expect(await bookingState(chiragBooking)).toBe('scheduled,failed,false');
    await runRules();
    expect(await bookingMessages(chiragBooking)).toHaveLength(2);
  });

  it('WC-9: a receipt goes to the person once; a spend sends nothing', async () => {
    flow.as('owner');
    await flow.expect(200, "receive Asha's 500", 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: vesu,
      splits: [{ mode: 'cash', amount: 500 }],
      contact_id: asha,
    });
    const receipt = flow.last('.data.id');
    await flow.expect(200, 'a spend', 'POST', '/app/payments', {
      kind: 'expense',
      branch_id: vesu,
      splits: [{ mode: 'cash', amount: 40 }],
      payee_name: 'Tea stall',
      expense_category: 'misc',
    });
    await runRules();
    await runRules();
    const receipts = await getOperatorSql()<{ body: string; delivery_status: string }[]>`
      SELECT activity.body, activity.delivery_status FROM app.contact_activities activity
      JOIN app.payments payment ON payment.id = activity.payment_id
      WHERE payment.public_id = ${receipt} AND activity.automation_kind = 'payment_receipt'
    `;
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.body).toMatch(/^Hi Asha, we have received ₹500\.00 on .+\. Thank you!$/);
    const spendMessages = await getOperatorSql()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM app.contact_activities WHERE automation_kind = 'payment_receipt'
    `;
    expect(spendMessages[0]?.count).toBe(1);
  });

  it("WC-10: the closed day's summary goes to the admins once; a reopen sends it again on the next close", async () => {
    flow.as('owner');
    await flow.expect(200, "open today's day", 'POST', '/app/day-closes', { branch_id: vesu });
    const dayClose = flow.last('.data.id');
    await flow.expect(200, 'close it', 'POST', `/app/day-closes/${dayClose}/close`, {
      counted_cash: 400,
      difference_reason: 'Short — counted twice',
    });
    recordGraphSends();
    const counts = await runContactMessageDeliveryJob(organizationPublicId);
    expect(counts.summaryCount).toBe(1);
    const summaries = sends.filter((send) => send.body.to === OWNER_PHONE.slice(1));
    expect(summaries).toHaveLength(1);
    const text = String((summaries[0]?.body.text as { body?: string } | undefined)?.body);
    expect(text.split('\n')[0]).toMatch(/^Day closed · .+ · /);
    expect(text).toContain('Cash counted ₹400.00, expected ₹460.00 (₹60.00 short)');
    expect(text).toContain('closed by');

    expect((await runContactMessageDeliveryJob(organizationPublicId)).summaryCount).toBe(0);
    const stamped = await getOperatorSql()<{ summary_sent_at: Date | null }[]>`
      SELECT summary_sent_at FROM app.day_closes WHERE public_id = ${dayClose}
    `;
    expect(stamped[0]?.summary_sent_at).not.toBeNull();

    await flow.expect(200, 'reopen it', 'POST', `/app/day-closes/${dayClose}/reopen`, {
      reason: 'A late receipt',
    });
    const reopened = await getOperatorSql()<{ summary_sent_at: Date | null }[]>`
      SELECT summary_sent_at FROM app.day_closes WHERE public_id = ${dayClose}
    `;
    expect(reopened[0]?.summary_sent_at).toBeNull();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('WC-11: a shared visit goes as media — the caption on the first file; a missing file fails the message', async () => {
    const rx = await confirmedUpload('rx.pdf', 'application/pdf');
    const photo = await confirmedUpload('after.jpg', 'image/jpeg');
    flow.as('front_desk');
    await flow.expect(
      200,
      'share the visit',
      'POST',
      `/app/contacts/${asha}/activities/send-message`,
      {
        type: 'whatsapp',
        body: 'Your prescription, invoice and photos from today.',
        attachment_keys: [rx, photo],
      },
    );
    const shared = flow.last('.data.id');
    recordGraphSends();
    await runContactMessageDeliveryJob(organizationPublicId);
    const media = sends.filter(
      (send) => send.body.type === 'document' || send.body.type === 'image',
    );
    expect(media.map((send) => send.body.type)).toEqual(['document', 'image']);
    const documentMedia = media[0]?.body.document as Record<string, unknown>;
    expect([documentMedia.caption, documentMedia.filename]).toEqual([
      'Your prescription, invoice and photos from today.',
      'rx.pdf',
    ]);
    expect(String(documentMedia.link)).toMatch(/^https:\/\//);
    expect((media[1]?.body.image as Record<string, unknown> | undefined)?.caption).toBeUndefined();
    await flow.expect(200, 'the shared entry', 'GET', `/app/contacts/${asha}/activities/${shared}`);
    flow.expectValue('sent', '.data.delivery_status', 'sent');

    const gone = await confirmedUpload('gone.pdf', 'application/pdf');
    await flow.expect(
      200,
      'share a file',
      'POST',
      `/app/contacts/${asha}/activities/send-message`,
      {
        type: 'whatsapp',
        body: 'One more file.',
        attachment_keys: [gone],
      },
    );
    const missing = flow.last('.data.id');
    await getOperatorSql()`UPDATE upload.uploads SET deleted_at = now() WHERE file_key = ${gone}`;
    await runContactMessageDeliveryJob(organizationPublicId);
    await flow.expect(200, 'the entry', 'GET', `/app/contacts/${asha}/activities/${missing}`);
    flow.expectValue(
      'failed: why',
      '.data.failure_reason',
      'One of the attached files is no longer available — attach it again',
    );
  });

  it('WC-11 on Instagram: the text, then each file', async () => {
    await getOperatorSql()`
      INSERT INTO app.contact_activities (public_id, organization_id, contact_id, type, direction, body,
        provider_message_id, provider_sender_id, occurred_at)
      SELECT ${generatePublicId('contactActivity')}, contact.organization_id, contact.id, 'instagram',
        'received', 'Hi!', ${`mid.bela.${S}`}, ${BELA_SENDER}, now() - interval '1 hour'
      FROM app.contacts contact WHERE contact.public_id = ${bela}
    `;
    const photo = await confirmedUpload('glow.png', 'image/png');
    flow.as('front_desk');
    await flow.expect(
      200,
      'share on Instagram',
      'POST',
      `/app/contacts/${bela}/activities/send-message`,
      {
        type: 'instagram',
        body: 'Your photo from today.',
        attachment_keys: [photo],
      },
    );
    recordGraphSends();
    await runContactMessageDeliveryJob(organizationPublicId);
    const toBela = sends.filter(
      (send) => (send.body.recipient as { id?: string } | undefined)?.id === BELA_SENDER,
    );
    expect(toBela.map((send) => JSON.stringify(send.body.message))).toEqual([
      JSON.stringify({ text: 'Your photo from today.' }),
      expect.stringContaining('"type":"image"'),
    ]);
  });

  it('D32: STOP stops the automated messages to them, the stream says so; START lets them start again', async () => {
    const ela = await person('Ela', '06');
    const elaPhone = `91${digits}06`;
    const elaSays = (text: string, id: string) =>
      receiveWhatsApp({
        messages: [
          {
            from: elaPhone,
            id,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'text',
            text: { body: text },
          },
        ],
      });
    const [firstDay = '', secondDay = ''] = workDays(24, 2);
    flow.as('owner');
    await flow.expect(200, 'Ela agreed to offers', 'PATCH', `/app/contacts/${ela}`, {
      has_marketing_consent: true,
    });

    await elaSays('STOP', `wamid.stop.${S}`);
    await flow.expect(200, 'Ela', 'GET', `/app/contacts/${ela}`);
    flow.expectValue('consent withdrawn', '.data.has_marketing_consent', false);
    await flow.expect(200, "Ela's stream", 'GET', `/app/contacts/${ela}/activities?limit=10`);
    flow.expectValue(
      'a system entry says so',
      '[.data[] | select(.type == "system" and (.body | startswith("Replied STOP")))] | length',
      1,
    );
    flow.as('front_desk');
    const stoppedBooking = await book(ela, firstDay, '15:00');
    await runRules();
    expect(await bookingMessages(stoppedBooking), 'no confirm request while stopped').toHaveLength(
      0,
    );
    await elaSays('stop', `wamid.stop.again.${S}`);
    flow.as('owner');
    await flow.expect(200, "Ela's stream", 'GET', `/app/contacts/${ela}/activities?limit=10`);
    flow.expectValue(
      'STOP twice: one entry',
      '[.data[] | select(.type == "system" and (.body | startswith("Replied STOP")))] | length',
      1,
    );

    await elaSays('START', `wamid.start.${S}`);
    flow.as('front_desk');
    const startedBooking = await book(ela, secondDay, '15:00');
    await runRules();
    expect(
      (await bookingMessages(startedBooking)).map((message) => message.automation_kind),
      'started again: the confirm request',
    ).toEqual(['booking_confirm']);
  });

  it('D32: outside the 24-hour window a notice goes as its template; inside it, as free text', async () => {
    const templatesWereEnabled = env.WHATSAPP_TEMPLATES_ENABLED;
    env.WHATSAPP_TEMPLATES_ENABLED = true;
    try {
      const dev = await person('Dev', '05');
      const [devDay = '', ashaDay = ''] = workDays(20, 2);
      flow.as('front_desk');
      const devBooking = await book(dev, devDay, '11:00');
      await ashaSays('See you soon', `wamid.window.${S}`);
      const ashaLater = await book(asha, ashaDay, '12:00');
      await runRules();
      recordGraphSends();
      await runContactMessageDeliveryJob(organizationPublicId);

      const devPhone = `91${digits}05`;
      const toDev = sends.filter((send) => send.body.to === devPhone);
      expect(
        toDev.map((send) => send.body.type),
        'Dev never wrote: the template',
      ).toEqual(['template']);
      const template = toDev[0]?.body.template as {
        name: string;
        language: { code: string };
        components: { parameters: { text: string }[] }[];
      };
      expect([template.name, template.language.code]).toEqual(['booking_confirm', 'en']);
      expect(template.components[0]?.parameters.map((parameter) => parameter.text)[0]).toBe('Dev');
      const [devMessage] = await bookingMessages(devBooking);
      expect(devMessage?.delivery_status).toBe('sent');
      expect(devMessage?.body, "the stream keeps the template's text").toMatch(
        /^Hi Dev, please confirm your visit on .+ at 11:00\. Reply YES to confirm\.$/,
      );

      const toAsha = sends.filter(
        (send) =>
          send.body.to === ASHA_PHONE.slice(1) &&
          (send.body.text as { body?: string } | undefined)?.body?.includes('12:00'),
      );
      expect(
        toAsha.map((send) => send.body.type),
        'Asha wrote just now: free text',
      ).toEqual(['text']);
      expect((await bookingMessages(ashaLater))[0]?.delivery_status).toBe('sent');
    } finally {
      env.WHATSAPP_TEMPLATES_ENABLED = templatesWereEnabled;
    }
  });
});
