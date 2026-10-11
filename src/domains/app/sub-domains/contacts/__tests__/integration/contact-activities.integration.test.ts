import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Sub-domain 4, Contact activity (routes-final §4.C–4.D, launch ROUTE #130): the message
 * templates, a contact's stream (send a message, log a call, add a note, read, resend, a batch),
 * the contact's activity times, the record-link rules and M10's hiding, the gates by role — one
 * flow over the fixture organization.
 */
describe('Contact activity — integration (routes-final §4.C–4.D)', () => {
  const S = String(Date.now());
  const lastName = `y${S}`;
  const digits = `8${S.slice(-7)}`;
  const NOWHERE_CONTACT = 'con_aaaaaaaaaaaaaaaaaaaaa';
  const NOWHERE_ENTRY = 'msg_aaaaaaaaaaaaaaaaaaaaa';
  const NOWHERE_TEMPLATE = 'mtpl_aaaaaaaaaaaaaaaaaaaaa';
  const FIELDS = '[.error.errors[].field] | join(",")';
  const TYPES = '[.data[].type] | join(",")';
  const TEMPLATE_NAMES = `[.data[].name | rtrimstr(" ${lastName}")] | join(",")`;
  const LONG_BODY = 'a'.repeat(1001);

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let ownerMembership = '';
  let asha = '';
  let bela = '';
  let chirag = '';
  let helloTemplate = '';
  let instagramTemplate = '';
  let firstMessage = '';
  let linkedNote = '';

  /** A contact of this run with its own number. */
  async function person(firstName: string, suffix: string): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    ownerMembership = fixture.members.owner.membershipPublicId;
    flow.as('owner');
    asha = await person('Asha', '01');
    bela = await person('Bela', '02');
    chirag = await person('Chirag', '03');
  });

  afterAll(async () => {
    await app.close();
  });

  it('4.D contact message templates (routes 17–22)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'template create (default whatsapp)',
      'POST',
      '/app/contact-message-templates',
      { name: `Hello ${lastName}`, body: 'Hi <first>, about <interest>.' },
    );
    helloTemplate = flow.last('.data.id');
    flow.expectValue('template: type defaults to whatsapp', '.data.type', 'whatsapp');
    await flow.expect(200, 'template create instagram', 'POST', '/app/contact-message-templates', {
      name: `Insta ${lastName}`,
      body: 'Hey <first>',
      type: 'instagram',
    });
    instagramTemplate = flow.last('.data.id');
    await flow.expect(
      409,
      'template name taken in another case',
      'POST',
      '/app/contact-message-templates',
      { name: `HELLO ${lastName}`, body: 'x' },
    );
    await flow.expect(400, 'template empty body', 'POST', '/app/contact-message-templates', {
      name: `Empty ${lastName}`,
      body: ' ',
    });
    await flow.expect(400, 'template body over 1000', 'POST', '/app/contact-message-templates', {
      name: `Long ${lastName}`,
      body: LONG_BODY,
    });
    await flow.expect(400, 'template type sms', 'POST', '/app/contact-message-templates', {
      name: `Sms ${lastName}`,
      body: 'x',
      type: 'sms',
    });
    await flow.expect(
      422,
      'template create without X-Idempotency-Key',
      'POST',
      '/app/contact-message-templates',
      { name: `Nokey ${lastName}`, body: 'x' },
      { idempotencyKey: false },
    );
    await flow.expect(
      200,
      'template list (newest first)',
      'GET',
      `/app/contact-message-templates?q=${lastName}`,
    );
    flow.expectValue('template list order', TEMPLATE_NAMES, 'Insta,Hello');
    flow.expectValue('template list total', '.meta.pagination.estimated_total', 2);
    await flow.expect(
      200,
      'template list by name',
      'GET',
      `/app/contact-message-templates?q=${lastName}&sort=name&order=asc`,
    );
    flow.expectValue('template list by name order', TEMPLATE_NAMES, 'Hello,Insta');
    await flow.expect(
      200,
      'template list by type',
      'GET',
      `/app/contact-message-templates?q=${lastName}&type=instagram`,
    );
    flow.expectValue('template type filter', '.data | length', 1);
    await flow.expect(
      200,
      'template get',
      'GET',
      `/app/contact-message-templates/${instagramTemplate}`,
    );
    const updatedAt = flow.last('.data.updated_at');
    await flow.expect(
      404,
      'template get unknown',
      'GET',
      `/app/contact-message-templates/${NOWHERE_TEMPLATE}`,
    );
    await flow.expect(
      200,
      'template change body',
      'PATCH',
      `/app/contact-message-templates/${instagramTemplate}`,
      { body: 'Hey <first>!', expected_updated_at: updatedAt },
    );
    await flow.expect(
      409,
      'template stale save',
      'PATCH',
      `/app/contact-message-templates/${instagramTemplate}`,
      { name: `X ${lastName}`, expected_updated_at: updatedAt },
    );
    flow.expectValue('template stale: record_changed', '.error.reason', 'record_changed');
    await flow.expect(
      400,
      'template PATCH nothing',
      'PATCH',
      `/app/contact-message-templates/${instagramTemplate}`,
      {},
    );
    await flow.expect(
      400,
      'template delete without reason',
      'DELETE',
      `/app/contact-message-templates/${instagramTemplate}`,
    );
    await flow.expect(
      204,
      'template delete',
      'DELETE',
      `/app/contact-message-templates/${instagramTemplate}?reason=not_needed`,
    );
    await flow.expect(
      404,
      'template get deleted',
      'GET',
      `/app/contact-message-templates/${instagramTemplate}`,
    );
    await flow.expect(200, 'template name free again', 'POST', '/app/contact-message-templates', {
      name: `Insta ${lastName}`,
      body: 'y',
      type: 'instagram',
    });
    const instagramTemplateAgain = flow.last('.data.id');
    await flow.expect(
      409,
      'template restore over a reused name',
      'POST',
      `/app/contact-message-templates/${instagramTemplate}/restore`,
    );
    flow.expectValue(
      'template restore conflict reason',
      '.error.reason',
      'record_restore_conflict',
    );
    await flow.expect(
      204,
      'template delete the reuse',
      'DELETE',
      `/app/contact-message-templates/${instagramTemplateAgain}?reason=duplicate`,
    );
    await flow.expect(
      200,
      'template restore',
      'POST',
      `/app/contact-message-templates/${instagramTemplate}/restore`,
    );
    await flow.expect(
      409,
      'template restore live',
      'POST',
      `/app/contact-message-templates/${instagramTemplate}/restore`,
    );
    flow.expectValue('template restore live reason', '.error.reason', 'record_not_deleted');
  });

  it('4.C send a message (route 11)', async () => {
    flow.as('owner');
    const sendPath = `/app/contacts/${asha}/activities/send-message`;
    await flow.expect(200, 'send WhatsApp with a template', 'POST', sendPath, {
      type: 'whatsapp',
      body: 'Hi <first>, about <interest>.',
      contact_message_template_id: helloTemplate,
    });
    firstMessage = flow.last('.data.id');
    flow.expectValue('send: placeholders filled', '.data.body', 'Hi Asha, about .');
    flow.expectValue(
      'send: sent and queued',
      '[.data.direction, .data.delivery_status] | join(",")',
      'sent,queued',
    );
    flow.expectValue(
      'send: the caller is the author',
      '.data.author_membership_id',
      ownerMembership,
    );
    flow.expectValue('send: group messages', '.data.group', 'messages');
    await flow.expect(400, 'send with an instagram template on WhatsApp', 'POST', sendPath, {
      type: 'whatsapp',
      body: 'x',
      contact_message_template_id: instagramTemplate,
    });
    flow.expectValue('template type: field', FIELDS, 'contact_message_template_id');
    await flow.expect(400, 'send with an unknown template', 'POST', sendPath, {
      type: 'whatsapp',
      body: 'x',
      contact_message_template_id: NOWHERE_TEMPLATE,
    });
    await flow.expect(400, 'send a call_log type', 'POST', sendPath, {
      type: 'call_log',
      body: 'x',
    });
    await flow.expect(400, 'send an empty body', 'POST', sendPath, {
      type: 'whatsapp',
      body: '  ',
    });
    await flow.expect(400, 'send a body over 1000', 'POST', sendPath, {
      type: 'whatsapp',
      body: LONG_BODY,
    });
    await flow.expect(400, 'send with two record links', 'POST', sendPath, {
      type: 'whatsapp',
      body: 'x',
      task_id: 'tsk_aaaaaaaaaaaaaaaaaaaaa',
      invoice_id: 'inv_aaaaaaaaaaaaaaaaaaaaa',
    });
    await flow.expect(400, 'send linked to an unknown task', 'POST', sendPath, {
      type: 'whatsapp',
      body: 'x',
      task_id: 'tsk_aaaaaaaaaaaaaaaaaaaaa',
    });
    flow.expectValue('unknown link: field', FIELDS, 'task_id');
    await flow.expect(400, 'send with an unconfirmed upload', 'POST', sendPath, {
      type: 'whatsapp',
      body: 'x',
      attachment_keys: ['organizations/none/uploads/nothing.jpg'],
    });
    flow.expectValue('unconfirmed upload: field', FIELDS, 'attachment_keys');
    await flow.expect(400, 'send with an unknown field', 'POST', sendPath, {
      type: 'whatsapp',
      body: 'x',
      channel: 'sms',
    });
    await flow.expect(
      422,
      'send without X-Idempotency-Key',
      'POST',
      sendPath,
      { type: 'whatsapp', body: 'x' },
      { idempotencyKey: false },
    );
    await flow.expect(
      404,
      'send to an unknown contact',
      'POST',
      `/app/contacts/${NOWHERE_CONTACT}/activities/send-message`,
      { type: 'whatsapp', body: 'x' },
    );
    await flow.expect(200, 'send Instagram replying in the stream', 'POST', sendPath, {
      type: 'instagram',
      body: 'Following up',
      reply_to_contact_activity_id: firstMessage,
    });
    flow.expectValue('reply: same stream kept', '.data.reply_to_contact_activity_id', firstMessage);
    await flow.expect(
      400,
      "reply to another contact's entry",
      'POST',
      `/app/contacts/${bela}/activities/send-message`,
      { type: 'whatsapp', body: 'x', reply_to_contact_activity_id: firstMessage },
    );
    flow.expectValue('reply other contact: field', FIELDS, 'reply_to_contact_activity_id');
    await flow.expect(200, 'Asha after the sends', 'GET', `/app/contacts/${asha}`);
    flow.expectValue(
      'default channel follows the last send (CT4)',
      '.data.default_channel',
      'instagram',
    );
    flow.expectValue('not awaiting a reply', '.data.is_awaiting_reply', false);
  });

  it('4.C log a call, add a note (routes 12–13)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'log an incoming call',
      'POST',
      `/app/contacts/${asha}/activities/log-call`,
      { direction: 'received', body: 'Asked about prices' },
    );
    flow.expectValue('incoming call: no author', '.data.author_membership_id', 'null');
    flow.expectValue('incoming call: no delivery status', '.data.delivery_status', 'null');
    await flow.expect(200, 'Asha awaits a reply', 'GET', `/app/contacts/${asha}`);
    flow.expectValue('awaiting a reply (M3)', '.data.is_awaiting_reply', true);
    await flow.expect(
      200,
      'contacts awaiting a reply',
      'GET',
      `/app/contacts?is_awaiting_reply=true&q=${lastName}`,
    );
    flow.expectValue('awaiting list: Asha', '[.data[].first_name] | join(",")', 'Asha');
    await flow.expect(
      400,
      'log a call without direction',
      'POST',
      `/app/contacts/${asha}/activities/log-call`,
      { body: 'x' },
    );
    await flow.expect(
      200,
      'log an outgoing call',
      'POST',
      `/app/contacts/${bela}/activities/log-call`,
      { direction: 'sent', body: 'Called back' },
    );
    flow.expectValue(
      'outgoing call: the caller is the author',
      '.data.author_membership_id',
      ownerMembership,
    );
    await flow.expect(200, 'Bela after the call', 'GET', `/app/contacts/${bela}`);
    flow.expectValue('a call moves the channel to call', '.data.default_channel', 'call');
    await flow.expect(200, 'add a note', 'POST', `/app/contacts/${asha}/activities/add-note`, {
      body: 'Prefers mornings',
    });
    flow.expectValue('note: no direction', '.data.direction', 'null');
    await flow.expect(
      400,
      'note with a type',
      'POST',
      `/app/contacts/${asha}/activities/add-note`,
      { body: 'x', type: 'note' },
    );
  });

  it('4.C the stream (routes 10, 14)', async () => {
    flow.as('owner');
    const stream = `/app/contacts/${asha}/activities`;
    await flow.expect(200, 'stream, oldest first', 'GET', stream);
    flow.expectValue('stream order', TYPES, 'whatsapp,instagram,call_log,note');
    flow.expectValue('stream total', '.meta.pagination.estimated_total', 4);
    await flow.expect(200, 'stream newest first', 'GET', `${stream}?order=desc&limit=2`);
    flow.expectValue('newest page', TYPES, 'note,call_log');
    const pages: string[] = [];
    let after = '';
    for (;;) {
      await flow.call('GET', `${stream}?limit=1${after ? `&after=${after}` : ''}`);
      pages.push(flow.last(TYPES));
      after = flow.last('.meta.pagination.next // empty');
      if (!after) break;
    }
    flow.expectEqual('stream paged 1 by 1', pages.join(','), 'whatsapp,instagram,call_log,note');
    await flow.expect(200, 'stream by type (several)', 'GET', `${stream}?type=note,call_log`);
    flow.expectValue('type filter', TYPES, 'call_log,note');
    await flow.expect(200, 'stream group messages', 'GET', `${stream}?group=messages`);
    flow.expectValue('group filter', '.data | length', 4);
    await flow.expect(200, 'stream received', 'GET', `${stream}?direction=received`);
    flow.expectValue('direction filter', TYPES, 'call_log');
    await flow.expect(200, 'stream queued', 'GET', `${stream}?delivery_status=queued`);
    flow.expectValue('delivery filter', '.data | length', 2);
    await flow.expect(200, 'stream text search', 'GET', `${stream}?q=prices`);
    flow.expectValue('q filter', TYPES, 'call_log');
    await flow.expect(
      200,
      'stream sorted by created_at',
      'GET',
      `${stream}?sort=created_at&order=desc&limit=1`,
    );
    flow.expectValue('created_at sort', TYPES, 'note');
    await flow.expect(400, 'stream bad group', 'GET', `${stream}?group=chat`);
    await flow.expect(400, 'stream bad type', 'GET', `${stream}?type=sms`);
    await flow.expect(
      200,
      'stream of a contact with none',
      'GET',
      `/app/contacts/${chirag}/activities`,
    );
    flow.expectValue('empty stream', '.data | length', 0);
    await flow.expect(
      404,
      'stream of an unknown contact',
      'GET',
      `/app/contacts/${NOWHERE_CONTACT}/activities`,
    );
    await flow.expect(200, 'get an entry', 'GET', `${stream}/${firstMessage}`);
    await flow.expect(
      404,
      'get an entry under another contact',
      'GET',
      `/app/contacts/${bela}/activities/${firstMessage}`,
    );
    await flow.expect(404, 'get an unknown entry', 'GET', `${stream}/${NOWHERE_ENTRY}`);
  });

  it('4.C resend (route 15)', async () => {
    flow.as('owner');
    await flow.expect(
      409,
      'resend a queued message',
      'POST',
      `/app/contacts/${asha}/activities/${firstMessage}/resend`,
    );
    flow.expectValue(
      'resend queued: transition_not_allowed',
      '.error.reason',
      'transition_not_allowed',
    );
    await operatorQuery`
      UPDATE app.contact_activities SET delivery_status = 'failed',
        failure_reason = 'Number not on WhatsApp', failed_at = now()
      WHERE public_id = ${firstMessage}
    `;
    await flow.expect(
      404,
      'resend under another contact',
      'POST',
      `/app/contacts/${bela}/activities/${firstMessage}/resend`,
    );
    await flow.expect(
      200,
      'resend a failed message',
      'POST',
      `/app/contacts/${asha}/activities/${firstMessage}/resend`,
    );
    flow.expectValue(
      'resent: queued, failure cleared',
      '[.data.delivery_status, (.data.failure_reason // "none")] | join(",")',
      'queued,none',
    );
    await flow.call('GET', `/app/contacts/${asha}/activities?type=note`);
    const note = flow.last('.data[0].id');
    await flow.expect(
      409,
      'resend a note',
      'POST',
      `/app/contacts/${asha}/activities/${note}/resend`,
    );
  });

  it('4.C message batch (route 16)', async () => {
    flow.as('owner');
    const batches = '/app/contact-activities/message-batches';
    await flow.expect(200, 'batch to two contacts', 'POST', batches, {
      contact_ids: [bela, chirag],
      type: 'whatsapp',
      body: 'Hi <first>, offer this week',
      contact_message_template_id: helloTemplate,
    });
    flow.expectValue(
      'batch: one per contact, filled',
      '[.data[].body] | join("|")',
      'Hi Bela, offer this week|Hi Chirag, offer this week',
    );
    await flow.expect(400, 'batch repeats a contact', 'POST', batches, {
      contact_ids: [bela, bela],
      type: 'whatsapp',
      body: 'x',
    });
    await flow.expect(400, 'batch with an unknown contact', 'POST', batches, {
      contact_ids: [bela, NOWHERE_CONTACT],
      type: 'whatsapp',
      body: 'x',
    });
    flow.expectValue('batch unknown: field', FIELDS, 'contact_ids');
    await flow.expect(400, 'batch with a template of the other type', 'POST', batches, {
      contact_ids: [bela],
      type: 'whatsapp',
      body: 'x',
      contact_message_template_id: instagramTemplate,
    });
    await flow.expect(400, 'batch of 201', 'POST', batches, {
      contact_ids: Array.from({ length: 201 }, (_, index) => `con_${index}aaaaaaaaaaaaaaaaaa`),
      type: 'whatsapp',
      body: 'x',
    });
    await flow.expect(200, 'Chirag after the batch', 'GET', `/app/contacts/${chirag}`);
    flow.expectValue('batch moves the last sent time', '.data.last_sent_at != null', true);
  });

  it('M10: an entry linked to a record the caller cannot read is hidden', async () => {
    flow.as('owner');
    await flow.call('POST', '/app/patients', {
      contact: {
        first_name: 'Clin',
        last_name: lastName,
        phones: [{ phone: `+91${digits}09`, is_primary: true }],
      },
      home_branch_id: fixture.branches.vesu,
    });
    const patient = flow.last('.data.id');
    await flow.call('POST', `/app/patients/${patient}/clinical-notes`, {
      kind: 'complaint',
      text: 'Acne flare',
    });
    const clinicalNote = flow.last('.data.id');
    await flow.expect(
      200,
      'note linked to a clinical note',
      'POST',
      `/app/contacts/${chirag}/activities/add-note`,
      { body: 'See the complaint', patient_clinical_note_id: clinicalNote },
    );
    linkedNote = flow.last('.data.id');
    flow.expectValue('linked note keeps its link', '.data.patient_clinical_note_id', clinicalNote);
    await flow.expect(
      200,
      'owner sees the linked note',
      'GET',
      `/app/contacts/${chirag}/activities?type=note`,
    );
    flow.expectValue('owner: one linked note', '.data | length', 1);
  });

  it('gates by role (M4: Activity for every role but the Accountant; delete Owner and Admin)', async () => {
    flow.as('marketing');
    await flow.expect(200, 'marketing: stream', 'GET', `/app/contacts/${chirag}/activities`);
    flow.expectValue(
      'marketing: the clinical-linked note is hidden (M10)',
      `[.data[] | select(.id == "${linkedNote}")] | length`,
      0,
    );
    await flow.expect(
      404,
      'marketing: get the hidden note',
      'GET',
      `/app/contacts/${chirag}/activities/${linkedNote}`,
    );
    await flow.expect(
      200,
      'marketing: add a note',
      'POST',
      `/app/contacts/${chirag}/activities/add-note`,
      { body: 'Liked the post' },
    );
    await flow.expect(
      200,
      'marketing: templates',
      'GET',
      `/app/contact-message-templates?q=${lastName}`,
    );
    await flow.expect(
      403,
      'marketing: delete a template',
      'DELETE',
      `/app/contact-message-templates/${helloTemplate}?reason=mistake`,
    );

    flow.as('accountant');
    await flow.expect(403, 'accountant: stream', 'GET', `/app/contacts/${chirag}/activities`);
    await flow.expect(
      403,
      'accountant: send',
      'POST',
      `/app/contacts/${chirag}/activities/send-message`,
      { type: 'whatsapp', body: 'x' },
    );
    await flow.expect(
      200,
      'accountant: templates (every member)',
      'GET',
      `/app/contact-message-templates?q=${lastName}`,
    );
    await flow.expect(403, 'accountant: add a template', 'POST', '/app/contact-message-templates', {
      name: `Acc ${lastName}`,
      body: 'x',
    });

    flow.as('front_desk');
    await flow.expect(
      200,
      'front desk: read an entry',
      'GET',
      `/app/contacts/${asha}/activities/${firstMessage}`,
    );
    await flow.expect(
      200,
      'front desk: edit a template',
      'PATCH',
      `/app/contact-message-templates/${helloTemplate}`,
      { body: 'Hello <first>' },
    );
    await flow.expect(
      403,
      'front desk: delete a template',
      'DELETE',
      `/app/contact-message-templates/${helloTemplate}?reason=mistake`,
    );

    flow.as('admin');
    await flow.expect(
      204,
      'admin: delete a template',
      'DELETE',
      `/app/contact-message-templates/${helloTemplate}?reason=mistake`,
    );

    flow.as('owner');
    await flow.expect(
      204,
      'owner: delete Chirag (the stream stays with the contact)',
      'DELETE',
      `/app/contacts/${chirag}?reason=mistake`,
    );
    await flow.expect(
      404,
      'stream of a deleted contact',
      'GET',
      `/app/contacts/${chirag}/activities`,
    );
  });
});
