import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
 * Sub-domain 5, Leads (routes-final §5, launch ROUTE #131): a lead for a contact or with a new one,
 * one open lead per contact, the list's search, filters and sorts, the owner's hold, claim and
 * release, `clinic_visited`, delete and restore, the export, what the contact and its stream read
 * and move, the gates by role — one flow over the fixture organization.
 */
describe('Leads — integration (routes-final §5)', () => {
  const S = String(Date.now());
  /** This run's last name — `q=${lastName}` lists only this run's leads (through their contacts). */
  const lastName = `x${S}`;
  const digits = `7${S.slice(-7)}`;
  const NOWHERE_CONTACT = 'con_aaaaaaaaaaaaaaaaaaaaa';
  const NOWHERE_LEAD = 'lead_aaaaaaaaaaaaaaaaaaaaa';
  const NOWHERE_MEMBERSHIP = 'mem_aaaaaaaaaaaaaaaaaaaaa';
  const FIELDS = '[.error.errors[].field] | join(",")';
  const NAMES = '[.data[].contact.first_name] | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let adajan = '';
  let admin = '';
  let doctor = '';
  let frontDesk = '';
  let marketing = '';

  let riya = '';
  let meera = '';
  let neel = '';
  let kabir = '';
  let riyaLead = '';
  let riyaLeadNumber = '';
  let meeraLead = '';
  let meeraLeadAgain = '';
  let kabirLead = '';
  let neelLead = '';

  /** Two membership ids as a sorted, comma-joined list. */
  const sortedPair = (first: string, second: string) => [first, second].sort().join(',');
  /** Members sorted and joined, as the involved lists are compared. */
  const sortedOf = (...ids: string[]) => [...ids].sort().join(',');

  /** A contact of this run with its own number. */
  async function person(firstName: string, suffix: string): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  /** A new contact body for `contact` on a lead create. */
  function newContact(firstName: string, suffix: string) {
    return {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    };
  }

  /** Every page's contact first names of `path`, `limit` at a time, joined. */
  async function pageNames(path: string, limit: number): Promise<string> {
    const names: string[] = [];
    let after = '';
    for (;;) {
      await flow.call('GET', `${path}&limit=${limit}${after ? `&after=${after}` : ''}`);
      names.push(flow.last(NAMES));
      after = flow.last('.meta.pagination.next // empty');
      if (!after) break;
    }
    return names.join(',');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    adajan = fixture.branches.adajan;
    admin = fixture.members.admin.membershipPublicId;
    doctor = fixture.members.doctor.membershipPublicId;
    frontDesk = fixture.members.front_desk.membershipPublicId;
    marketing = fixture.members.marketing.membershipPublicId;
    flow.as('owner');
    riya = await person('Riya', '01');
    meera = await person('Meera', '02');
    neel = await person('Neel', '03');
  });

  afterAll(async () => {
    await app.close();
  });

  it('create (route 3)', async () => {
    flow.as('owner');
    await flow.expect(200, "create Riya's lead (owner, involved, branch)", 'POST', '/app/leads', {
      contact_id: riya,
      source: 'instagram',
      interests: ['lhr', 'hydrafacial'],
      owner_membership_id: doctor,
      involved_membership_ids: [frontDesk],
      branch_id: vesu,
      notes: 'Asked on Instagram',
    });
    riyaLead = flow.last('.data.id');
    riyaLeadNumber = flow.last('.data.lead_number');
    flow.expectValue(
      'create: status new, kind enquiry',
      '[.data.status, .data.kind] | join(",")',
      'new,enquiry',
    );
    flow.expectValue(
      'create: the contact summary (L1)',
      '[.data.contact_id, .data.contact.id, .data.contact.first_name] | join(",")',
      `${riya},${riya},Riya`,
    );
    flow.expectValue('create: lead number assigned', '.data.lead_number > 0', true);
    flow.expectValue('create: an owner holds it (D40)', '.data.held_until != null', true);
    flow.expectValue('create: involved', '.data.involved_membership_ids | join(",")', frontDesk);
    flow.expectValue(
      'create: no patient file, not awaiting',
      '[.data.patient_id, .data.is_awaiting_reply] | map(tostring) | join(",")',
      'null,false',
    );
    await flow.expect(
      422,
      'create without X-Idempotency-Key',
      'POST',
      '/app/leads',
      { contact_id: meera },
      { idempotencyKey: false },
    );
    await flow.expect(409, 'a second open lead for Riya (L6)', 'POST', '/app/leads', {
      contact_id: riya,
    });
    flow.expectValue('second open lead: reason', '.error.reason', 'lead_open_exists');
    flow.expectValue(
      'second open lead: names it',
      `(.error.detail | contains("#${riyaLeadNumber}")) and (.error.detail | contains("${riyaLead}"))`,
      true,
    );
    await flow.expect(
      409,
      'second open lead in Spanish',
      'POST',
      '/app/leads',
      { contact_id: riya },
      { language: 'es' },
    );
    flow.expectValue(
      'second open lead: Spanish detail',
      '.error.detail | contains("ya tiene")',
      true,
    );
    await flow.expect(400, 'create with neither contact_id nor contact', 'POST', '/app/leads', {
      source: 'google',
    });
    flow.expectValue('neither: field', FIELDS, 'body.contact_id');
    await flow.expect(400, 'create with both contact_id and contact', 'POST', '/app/leads', {
      contact_id: meera,
      contact: newContact('Both', '09'),
    });
    await flow.expect(400, 'create with the owner also involved', 'POST', '/app/leads', {
      contact_id: meera,
      owner_membership_id: doctor,
      involved_membership_ids: [doctor],
    });
    flow.expectValue('owner involved: field', FIELDS, 'body.involved_membership_ids');
    await flow.expect(400, 'create for an unknown contact', 'POST', '/app/leads', {
      contact_id: NOWHERE_CONTACT,
    });
    flow.expectValue('unknown contact: field', FIELDS, 'contact_id');
    await flow.expect(400, 'create with an unknown owner', 'POST', '/app/leads', {
      contact_id: meera,
      owner_membership_id: NOWHERE_MEMBERSHIP,
    });
    flow.expectValue('unknown owner: field', FIELDS, 'owner_membership_id');
    await flow.expect(400, 'create with an unknown status', 'POST', '/app/leads', {
      contact_id: meera,
      status: 'hot',
    });
    await flow.expect(400, 'create with an interest twice', 'POST', '/app/leads', {
      contact_id: meera,
      interests: ['peel', 'peel'],
    });
    await flow.expect(400, 'create with notes over 2000', 'POST', '/app/leads', {
      contact_id: meera,
      notes: 'a'.repeat(2001),
    });
    await flow.expect(400, 'create with kind (server-set, L5)', 'POST', '/app/leads', {
      contact_id: meera,
      kind: 'retarget',
    });
    await flow.expect(409, "create as clinic_visited (check-in's, L8)", 'POST', '/app/leads', {
      contact_id: meera,
      status: 'clinic_visited',
    });
    flow.expectValue('clinic_visited on create: reason', '.error.reason', 'lead_closed');
    await flow.expect(200, "create Meera's lead (contacted, google)", 'POST', '/app/leads', {
      contact_id: meera,
      status: 'contacted',
      source: 'google',
      interests: ['peel'],
      branch_id: adajan,
      follow_up_at: '2030-01-02T10:00:00Z',
    });
    meeraLead = flow.last('.data.id');
    flow.expectValue(
      'no owner, no hold',
      '[.data.owner_membership_id, .data.held_until] | map(tostring) | join(",")',
      'null,null',
    );
    await flow.expect(200, "create Kabir's lead with a new contact (L1)", 'POST', '/app/leads', {
      contact: newContact('Kabir', '04'),
      interests: ['prp'],
    });
    kabirLead = flow.last('.data.id');
    kabir = flow.last('.data.contact_id');
    flow.expectValue(
      'inline contact: the summary',
      '[.data.contact.first_name, .data.contact.primary_phone] | join(",")',
      `Kabir,+91${digits}04`,
    );
    flow.expectValue(
      'inline contact: no source, not held',
      '[.data.source, .data.held_until] | map(tostring) | join(",")',
      'null,null',
    );
    await flow.expect(
      409,
      "inline contact on another household's number (CT3)",
      'POST',
      '/app/leads',
      { contact: newContact('Copy', '01') },
    );
    flow.expectValue('inline clash: reason', '.error.reason', 'contact_phone_exists');
    await flow.expect(
      400,
      'inline contact, then an unknown owner — nothing kept',
      'POST',
      '/app/leads',
      { contact: newContact('Ghost', '05'), owner_membership_id: NOWHERE_MEMBERSHIP },
    );
    await flow.expect(
      200,
      'the rolled-back contact is not there',
      'GET',
      `/app/contacts?phone=%2B91${digits}05`,
    );
    flow.expectValue('rolled back: no contact', '.data | length', 0);
    await flow.expect(400, 'inline contact without phones', 'POST', '/app/leads', {
      contact: { first_name: 'Nophone', last_name: lastName },
    });
  });

  it('read (route 4) and the contact side', async () => {
    flow.as('owner');
    await flow.expect(200, "get Riya's lead", 'GET', `/app/leads/${riyaLead}`);
    flow.expectValue(
      'get: summary and team',
      `[.data.contact.contact_number > 0, (.data.owner_membership_id == "${doctor}")] | all`,
      true,
    );
    await flow.expect(404, 'get an unknown lead', 'GET', `/app/leads/${NOWHERE_LEAD}`);
    await flow.expect(200, "Riya's contact has the open lead", 'GET', `/app/contacts/${riya}`);
    flow.expectValue(
      'open_lead_id / open_lead_status',
      '[.data.open_lead_id, .data.open_lead_status] | join(",")',
      `${riyaLead},new`,
    );
    await flow.expect(200, "Riya's preview", 'GET', `/app/contacts/${riya}/preview`);
    flow.expectValue(
      'preview: open_lead',
      '[.data.open_lead.id, .data.open_lead.status, .data.open_lead.owner_membership_id] | join(",")',
      `${riyaLead},new,${doctor}`,
    );
    await flow.expect(200, 'Neel has no open lead', 'GET', `/app/contacts/${neel}`);
    flow.expectValue('Neel: open_lead_id null', '.data.open_lead_id', 'null');
    await flow.expect(
      200,
      'contacts with an open lead',
      'GET',
      `/app/contacts?q=${lastName}&has_open_lead=true&sort=name`,
    );
    flow.expectValue('has_open_lead=true', '[.data[].first_name] | join(",")', 'Kabir,Meera,Riya');
    await flow.expect(
      200,
      'contacts without an open lead',
      'GET',
      `/app/contacts?q=${lastName}&has_open_lead=false`,
    );
    flow.expectValue('has_open_lead=false', '[.data[].first_name] | join(",")', 'Neel');
    await flow.expect(
      200,
      "the lead's team handles Riya (CT11)",
      'GET',
      `/app/contacts/${riya}/members`,
    );
    flow.expectValue(
      "Riya's members: owner and involved",
      '[.data[].membership_id] | sort | join(",")',
      sortedPair(doctor, frontDesk),
    );
    await flow.expect(
      409,
      'Riya cannot be removed while her lead is live (CT7)',
      'DELETE',
      `/app/contacts/${riya}?reason=mistake`,
    );
    flow.expectValue('contact in use: reason', '.error.reason', 'contact_in_use');
  });

  it('list (route 1): search, filters, sorts', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      "list this run's leads (newest first)",
      'GET',
      `/app/leads?q=${lastName}`,
    );
    flow.expectValue('newest first', NAMES, 'Kabir,Meera,Riya');
    flow.expectValue('a total', '.meta.pagination.estimated_total', 3);
    await flow.expect(200, 'q: the lead number #N', 'GET', `/app/leads?q=%23${riyaLeadNumber}`);
    flow.expectValue("#N: Riya's lead", '[.data[].id] | join(",")', riyaLead);
    await flow.expect(
      200,
      'q: the contact number C-N',
      'GET',
      `/app/leads?q=C-${flow.last('.data[0].contact.contact_number')}`,
    );
    flow.expectValue("C-N: Riya's lead", '[.data[].id] | join(",")', riyaLead);
    await flow.expect(
      200,
      "q: Meera's number, typed with spaces",
      'GET',
      `/app/leads?q=%2B91%20${digits.slice(0, 5)}%20${digits.slice(5)}02`,
    );
    flow.expectValue("number: Meera's lead", NAMES, 'Meera');
    await flow.expect(
      200,
      'q: every word, the last name first',
      'GET',
      `/app/leads?q=${lastName}%20meera`,
    );
    flow.expectValue("reversed name: Meera's lead", NAMES, 'Meera');
    await flow.expect(200, 'q: part of a name', 'GET', '/app/leads?q=Kabi');
    flow.expectValue(
      "name part: Kabir's lead among them",
      `[.data[].id] | index("${kabirLead}") != null`,
      true,
    );
    await flow.expect(400, 'q: two letters', 'GET', '/app/leads?q=ab');
    flow.expectValue('short q: field', FIELDS, 'q');
    await flow.expect(
      200,
      'status: several',
      'GET',
      `/app/leads?q=${lastName}&status=new,contacted`,
    );
    flow.expectValue('status new,contacted', NAMES, 'Kabir,Meera,Riya');
    await flow.expect(200, 'status: contacted', 'GET', `/app/leads?q=${lastName}&status=contacted`);
    flow.expectValue('status contacted', NAMES, 'Meera');
    await flow.expect(400, 'status: an unknown one', 'GET', `/app/leads?q=${lastName}&status=hot`);
    await flow.expect(
      200,
      'source: several',
      'GET',
      `/app/leads?q=${lastName}&source=instagram,google`,
    );
    flow.expectValue('source instagram,google', NAMES, 'Meera,Riya');
    await flow.expect(
      200,
      'interests: any of',
      'GET',
      `/app/leads?q=${lastName}&interests=peel,prp`,
    );
    flow.expectValue('interests peel,prp', NAMES, 'Kabir,Meera');
    await flow.expect(200, 'kind: enquiry', 'GET', `/app/leads?q=${lastName}&kind=enquiry`);
    flow.expectValue('kind enquiry', '.data | length', 3);
    await flow.expect(200, 'contact_id', 'GET', `/app/leads?contact_id=${meera}`);
    flow.expectValue("contact_id: Meera's", NAMES, 'Meera');
    await flow.expect(
      200,
      'owner (Mine)',
      'GET',
      `/app/leads?q=${lastName}&owner_membership_id=${doctor}`,
    );
    flow.expectValue("owner: Riya's", NAMES, 'Riya');
    await flow.expect(
      200,
      'team: the involved member',
      'GET',
      `/app/leads?q=${lastName}&team_membership_id=${frontDesk}`,
    );
    flow.expectValue("team (involved): Riya's", NAMES, 'Riya');
    await flow.expect(
      200,
      'team: the owner',
      'GET',
      `/app/leads?q=${lastName}&team_membership_id=${doctor}`,
    );
    flow.expectValue("team (owner): Riya's", NAMES, 'Riya');
    await flow.expect(
      200,
      'team: an unknown member',
      'GET',
      `/app/leads?q=${lastName}&team_membership_id=${NOWHERE_MEMBERSHIP}`,
    );
    flow.expectValue('team unknown: empty', '.data | length', 0);
    await flow.expect(200, 'ownership: held', 'GET', `/app/leads?q=${lastName}&ownership=held`);
    flow.expectValue("held: Riya's", NAMES, 'Riya');
    await flow.expect(200, 'ownership: open', 'GET', `/app/leads?q=${lastName}&ownership=open`);
    flow.expectValue('open to claim', NAMES, 'Kabir,Meera');
    await flow.expect(
      200,
      'ownership: releasing today (none yet)',
      'GET',
      `/app/leads?q=${lastName}&ownership=releasing_today`,
    );
    flow.expectValue('releasing today: none', '.data | length', 0);
    await operatorQuery`
      UPDATE app.leads l SET held_until = greatest(now() + interval '1 minute',
        ((date_trunc('day', now() AT TIME ZONE o.timezone) + interval '1 day') AT TIME ZONE o.timezone)
          - interval '1 minute')
      FROM tenancy.organizations o
      WHERE o.id = l.organization_id AND l.public_id = ${riyaLead}
    `;
    await flow.expect(
      200,
      'ownership: releasing today',
      'GET',
      `/app/leads?q=${lastName}&ownership=releasing_today`,
    );
    flow.expectValue("releasing today: Riya's", NAMES, 'Riya');
    await flow.expect(200, 'branch_id', 'GET', `/app/leads?q=${lastName}&branch_id=${adajan}`);
    flow.expectValue('branch Adajan', NAMES, 'Meera');
    await flow.expect(
      200,
      'branch_ids (picker: Vesu — and no branch)',
      'GET',
      `/app/leads?q=${lastName}&branch_ids=${vesu}`,
    );
    flow.expectValue('picker Vesu', NAMES, 'Kabir,Riya');
    await flow.expect(
      200,
      'follow-up range',
      'GET',
      `/app/leads?q=${lastName}&follow_up_at_from=2030-01-01T00:00:00Z&follow_up_at_to=2030-01-03T00:00:00Z`,
    );
    flow.expectValue("follow-up range: Meera's", NAMES, 'Meera');
    await flow.expect(
      200,
      'created range: none before 2020',
      'GET',
      `/app/leads?q=${lastName}&created_to=2020-01-01T00:00:00Z`,
    );
    flow.expectValue('created_to 2020: none', '.data | length', 0);
    await flow.expect(200, 'sort name', 'GET', `/app/leads?q=${lastName}&sort=name`);
    flow.expectValue('name A–Z', NAMES, 'Kabir,Meera,Riya');
    await flow.expect(
      200,
      'sort name desc',
      'GET',
      `/app/leads?q=${lastName}&sort=name&order=desc`,
    );
    flow.expectValue('name Z–A', NAMES, 'Riya,Meera,Kabir');
    await flow.expect(
      200,
      'sort status (then newest)',
      'GET',
      `/app/leads?q=${lastName}&sort=status`,
    );
    flow.expectValue('status order', NAMES, 'Meera,Kabir,Riya');
    await flow.expect(
      200,
      'sort source — no source last (L7)',
      'GET',
      `/app/leads?q=${lastName}&sort=source`,
    );
    flow.expectValue('source asc, empty last', NAMES, 'Meera,Riya,Kabir');
    await flow.expect(
      200,
      'sort source desc — no source still last',
      'GET',
      `/app/leads?q=${lastName}&sort=source&order=desc`,
    );
    flow.expectValue('source desc, empty last', NAMES, 'Riya,Meera,Kabir');
    flow.expectEqual(
      'sort source pages one by one',
      await pageNames(`/app/leads?q=${lastName}&sort=source`, 1),
      'Meera,Riya,Kabir',
    );
    flow.expectEqual(
      'sort source desc pages one by one',
      await pageNames(`/app/leads?q=${lastName}&sort=source&order=desc`, 1),
      'Riya,Meera,Kabir',
    );
    await flow.expect(
      200,
      'sort follow_up_at — not set last',
      'GET',
      `/app/leads?q=${lastName}&sort=follow_up_at`,
    );
    flow.expectValue('follow-up first, the rest after', '.data[0].contact.first_name', 'Meera');
    flow.expectValue('every lead kept (today they dropped out)', '.data | length', 3);
    flow.expectEqual(
      'sort follow_up_at pages one by one',
      (await pageNames(`/app/leads?q=${lastName}&sort=follow_up_at`, 2)).split(',')[0] ?? '',
      'Meera',
    );
    await flow.expect(
      200,
      'sort last_activity_at (none yet: all kept)',
      'GET',
      `/app/leads?q=${lastName}&sort=last_activity_at`,
    );
    flow.expectValue('last_activity_at keeps all', '.data | length', 3);
    await flow.expect(
      400,
      'sort by an unknown field',
      'GET',
      `/app/leads?q=${lastName}&sort=phone`,
    );
    await flow.expect(
      400,
      'an unknown filter',
      'GET',
      `/app/leads?q=${lastName}&is_contact_thread=true`,
    );
  });

  it('the stream moves the lead (5.10)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'message template with <interest>',
      'POST',
      '/app/contact-message-templates',
      { name: `Lead hello ${lastName}`, body: 'Hi <first>, about <interest>.' },
    );
    const hello = flow.last('.data.id');
    await flow.expect(
      200,
      'send Riya a WhatsApp',
      'POST',
      `/app/contacts/${riya}/activities/send-message`,
      {
        type: 'whatsapp',
        body: 'Hi <first>, about <interest>.',
        contact_message_template_id: hello,
      },
    );
    flow.expectValue(
      "<interest> is the open lead's first interest (M9)",
      '.data.body',
      'Hi Riya, about LHR.',
    );
    await flow.expect(200, "Riya's lead after the send", 'GET', `/app/leads/${riyaLead}`);
    flow.expectValue('a sent line: new → contacted', '.data.status', 'contacted');
    flow.expectValue(
      "the lead's last activity is the contact's",
      '.data.last_activity_at != null',
      true,
    );
    await flow.expect(200, 'Kabir calls in', 'POST', `/app/contacts/${kabir}/activities/log-call`, {
      direction: 'received',
      body: 'Price for PRP?',
    });
    await flow.expect(
      200,
      "Kabir's lead after the incoming call",
      'GET',
      `/app/leads/${kabirLead}`,
    );
    flow.expectValue(
      'a received call: still new, awaiting a reply',
      '[.data.status, .data.is_awaiting_reply] | map(tostring) | join(",")',
      'new,true',
    );
    await flow.expect(
      200,
      'awaiting a reply (Unreplied)',
      'GET',
      `/app/leads?q=${lastName}&is_awaiting_reply=true`,
    );
    flow.expectValue("awaiting: Kabir's", NAMES, 'Kabir');
    await flow.expect(
      200,
      'not awaiting a reply',
      'GET',
      `/app/leads?q=${lastName}&is_awaiting_reply=false`,
    );
    flow.expectValue('not awaiting', NAMES, 'Meera,Riya');
    await flow.expect(
      200,
      'sort last_activity_at — newest first, none last',
      'GET',
      `/app/leads?q=${lastName}&sort=last_activity_at`,
    );
    flow.expectValue('last activity order', NAMES, 'Kabir,Riya,Meera');
    await flow.expect(
      200,
      'an outgoing call to Kabir',
      'POST',
      `/app/contacts/${kabir}/activities/log-call`,
      { direction: 'sent', body: 'Called back' },
    );
    await flow.expect(200, "Kabir's lead after the call", 'GET', `/app/leads/${kabirLead}`);
    flow.expectValue('a call the team made: new → contacted (P21)', '.data.status', 'contacted');
  });

  it('update (route 5)', async () => {
    flow.as('owner');
    await flow.expect(200, "get Riya's lead for a save", 'GET', `/app/leads/${riyaLead}`);
    const updatedAt = flow.last('.data.updated_at');
    const heldBefore = flow.last('.data.held_until');
    await flow.expect(200, "assign Riya's lead to the admin", 'PATCH', `/app/leads/${riyaLead}`, {
      owner_membership_id: admin,
      expected_updated_at: updatedAt,
    });
    flow.expectValue('new owner', '.data.owner_membership_id', admin);
    flow.expectValue(
      'a new hold',
      `.data.held_until != "${heldBefore}" and .data.held_until != null`,
      true,
    );
    flow.expectValue(
      // the owner wrote to Riya, so works her lead too (WC-16)
      'the replaced owner stays involved (L9)',
      '[.data.involved_membership_ids[]] | sort | join(",")',
      sortedOf(doctor, frontDesk, fixture.members.owner.membershipPublicId),
    );
    await flow.expect(409, 'a stale save (D43)', 'PATCH', `/app/leads/${riyaLead}`, {
      notes: 'x',
      expected_updated_at: updatedAt,
    });
    flow.expectValue('stale save: reason', '.error.reason', 'record_changed');
    await flow.expect(
      200,
      'assign it to the involved front desk',
      'PATCH',
      `/app/leads/${riyaLead}`,
      { owner_membership_id: frontDesk },
    );
    flow.expectValue(
      'the owner is not also involved',
      '[.data.involved_membership_ids[]] | sort | join(",")',
      sortedOf(doctor, admin, fixture.members.owner.membershipPublicId),
    );
    await flow.expect(
      400,
      'owner and involved name the same member',
      'PATCH',
      `/app/leads/${riyaLead}`,
      { owner_membership_id: doctor, involved_membership_ids: [doctor] },
    );
    await flow.expect(200, 'replace the involved set', 'PATCH', `/app/leads/${riyaLead}`, {
      involved_membership_ids: [marketing],
    });
    flow.expectValue('involved replaced', '.data.involved_membership_ids | join(",")', marketing);
    await flow.expect(200, 'no owner', 'PATCH', `/app/leads/${riyaLead}`, {
      owner_membership_id: null,
    });
    flow.expectValue(
      'no owner, no hold',
      '[.data.owner_membership_id, .data.held_until] | map(tostring) | join(",")',
      'null,null',
    );
    flow.expectValue(
      'the last owner stays involved',
      '[.data.involved_membership_ids[]] | sort | join(",")',
      sortedPair(marketing, frontDesk),
    );
    await flow.expect(
      200,
      'status, interests, follow-up, notes',
      'PATCH',
      `/app/leads/${riyaLead}`,
      {
        status: 'follow_up',
        interests: ['clinical'],
        follow_up_at: '2030-02-01T09:00:00Z',
        notes: 'Call after 6',
      },
    );
    flow.expectValue(
      'changed',
      '[.data.status, (.data.interests | join("|")), .data.notes] | join(",")',
      'follow_up,clinical,Call after 6',
    );
    await flow.expect(
      409,
      "set clinic_visited (check-in's, L8)",
      'PATCH',
      `/app/leads/${riyaLead}`,
      {
        status: 'clinic_visited',
      },
    );
    flow.expectValue('clinic_visited: reason', '.error.reason', 'lead_closed');
    await flow.expect(400, 'PATCH nothing', 'PATCH', `/app/leads/${riyaLead}`, {});
    await flow.expect(400, 'PATCH contact_id (not changeable)', 'PATCH', `/app/leads/${riyaLead}`, {
      contact_id: neel,
    });
    await flow.expect(400, 'PATCH an unknown branch', 'PATCH', `/app/leads/${riyaLead}`, {
      branch_id: 'brn_aaaaaaaaaaaaaaaaaaaaa',
    });
    flow.expectValue('unknown branch: field', FIELDS, 'branch_id');
    await flow.expect(404, 'PATCH an unknown lead', 'PATCH', `/app/leads/${NOWHERE_LEAD}`, {
      notes: 'x',
    });
    // Closed, then a new one, then reopening the closed one (L6)
    await flow.expect(200, "close Meera's lead as lost", 'PATCH', `/app/leads/${meeraLead}`, {
      status: 'lost',
    });
    await flow.expect(200, 'Meera has no open lead now', 'GET', `/app/contacts/${meera}`);
    flow.expectValue('closed: open_lead_id null', '.data.open_lead_id', 'null');
    await flow.expect(
      200,
      'a closed lead does not block a new one (Re-create lead)',
      'POST',
      '/app/leads',
      { contact_id: meera, source: 'whatsapp' },
    );
    meeraLeadAgain = flow.last('.data.id');
    await flow.expect(
      409,
      'reopen the lost lead while the new one is open',
      'PATCH',
      `/app/leads/${meeraLead}`,
      { status: 'new' },
    );
    flow.expectValue('reopen: reason', '.error.reason', 'lead_open_exists');
    await flow.expect(
      200,
      'close the new one as invalid',
      'PATCH',
      `/app/leads/${meeraLeadAgain}`,
      { status: 'invalid' },
    );
    await flow.expect(200, 'reopen the lost lead', 'PATCH', `/app/leads/${meeraLead}`, {
      status: 'no_response',
    });
    // clinic_visited is set by check-in (sub-domain 6) — here by SQL
    await operatorQuery`
      UPDATE app.leads SET status = 'clinic_visited', closed_at = now() WHERE public_id = ${meeraLead}
    `;
    await flow.expect(
      409,
      "change a clinic_visited lead's status (final, L8)",
      'PATCH',
      `/app/leads/${meeraLead}`,
      { status: 'new' },
    );
    flow.expectValue('visited is final: reason', '.error.reason', 'lead_closed');
    await flow.expect(200, 'its other fields stay editable', 'PATCH', `/app/leads/${meeraLead}`, {
      notes: 'Visited Vesu',
      status: 'clinic_visited',
    });
    flow.expectValue(
      'notes saved, still visited',
      '[.data.notes, .data.status] | join(",")',
      'Visited Vesu,clinic_visited',
    );
  });

  it('claim and release (routes 8–9)', async () => {
    flow.as('front_desk');
    await flow.expect(
      200,
      "front desk claims Kabir's lead",
      'POST',
      `/app/leads/${kabirLead}/claim`,
    );
    flow.expectValue('claimed: the caller owns it', '.data.owner_membership_id', frontDesk);
    flow.expectValue('claimed: held', '.data.held_until != null', true);
    const heldFirst = flow.last('.data.held_until');
    await flow.expect(
      422,
      'claim without X-Idempotency-Key',
      'POST',
      `/app/leads/${kabirLead}/claim`,
      undefined,
      { idempotencyKey: false },
    );
    await flow.expect(
      200,
      'claiming again extends the hold',
      'POST',
      `/app/leads/${kabirLead}/claim`,
    );
    flow.expectValue('hold extended', `.data.held_until > "${heldFirst}"`, true);

    flow.as('doctor');
    await flow.expect(
      409,
      'the doctor claims a lead the front desk holds',
      'POST',
      `/app/leads/${kabirLead}/claim`,
    );
    flow.expectValue('held by another: reason', '.error.reason', 'lead_held');
    await flow.expect(
      403,
      "the doctor releases the front desk's lead",
      'POST',
      `/app/leads/${kabirLead}/release`,
    );
    flow.expectValue('not yours: reason', '.error.reason', 'lead_not_yours');
    await operatorQuery`
      UPDATE app.leads SET held_until = now() - interval '1 minute' WHERE public_id = ${kabirLead}
    `;
    await flow.expect(
      200,
      'the hold ran out: the doctor takes it over',
      'POST',
      `/app/leads/${kabirLead}/claim`,
    );
    flow.expectValue('taken over', '.data.owner_membership_id', doctor);
    flow.expectValue(
      // the owner logged Kabir's calls, so works his lead too (WC-16)
      'the front desk stays involved (L9)',
      '[.data.involved_membership_ids[]] | sort | join(",")',
      sortedOf(frontDesk, fixture.members.owner.membershipPublicId),
    );
    await flow.expect(200, 'the doctor releases it', 'POST', `/app/leads/${kabirLead}/release`);
    flow.expectValue(
      'released: no owner, no hold',
      '[.data.owner_membership_id, .data.held_until] | map(tostring) | join(",")',
      'null,null',
    );
    flow.expectValue(
      'released: the doctor stays involved',
      '[.data.involved_membership_ids[]] | sort | join(",")',
      sortedOf(doctor, frontDesk, fixture.members.owner.membershipPublicId),
    );
    await flow.expect(403, 'release a lead nobody owns', 'POST', `/app/leads/${kabirLead}/release`);
    await flow.expect(409, 'claim a closed lead', 'POST', `/app/leads/${meeraLeadAgain}/claim`);
    flow.expectValue('claim closed: reason', '.error.reason', 'lead_closed');
    await flow.expect(409, 'release a closed lead', 'POST', `/app/leads/${meeraLeadAgain}/release`);
    flow.expectValue('release closed: reason', '.error.reason', 'lead_closed');
    await flow.expect(404, 'claim an unknown lead', 'POST', `/app/leads/${NOWHERE_LEAD}/claim`);
  });

  it('branch visibility (D9)', async () => {
    flow.as('front_desk');
    await flow.expect(
      200,
      'front desk (Vesu): sees Vesu and no-branch leads',
      'GET',
      `/app/leads?q=${lastName}`,
    );
    flow.expectValue('front desk list', `[.data[].id] | index("${meeraLead}") == null`, true);
    await flow.expect(404, 'front desk: an Adajan lead', 'GET', `/app/leads/${meeraLead}`);
    await flow.expect(400, 'front desk: a lead in Adajan', 'POST', '/app/leads', {
      contact_id: neel,
      branch_id: adajan,
    });
    flow.expectValue('another branch: field', FIELDS, 'branch_id');
    await flow.expect(200, "front desk: Neel's lead in Vesu", 'POST', '/app/leads', {
      contact_id: neel,
      branch_id: vesu,
    });
    neelLead = flow.last('.data.id');
  });

  it('delete and restore (routes 6–7)', async () => {
    flow.as('owner');
    await flow.expect(400, 'delete without a reason', 'DELETE', `/app/leads/${neelLead}`);
    await flow.expect(
      204,
      "delete Neel's lead",
      'DELETE',
      `/app/leads/${neelLead}?reason=duplicate`,
    );
    await flow.expect(404, 'the deleted lead is gone', 'GET', `/app/leads/${neelLead}`);
    await flow.expect(200, 'Neel may have a new lead now', 'POST', '/app/leads', {
      contact_id: neel,
    });
    const neelLeadAgain = flow.last('.data.id');
    await flow.expect(
      409,
      'restore while Neel has another open lead',
      'POST',
      `/app/leads/${neelLead}/restore`,
    );
    flow.expectValue('restore over an open lead: reason', '.error.reason', 'lead_open_exists');
    await flow.expect(
      204,
      'delete the new one',
      'DELETE',
      `/app/leads/${neelLeadAgain}?reason=mistake`,
    );
    await flow.expect(
      204,
      "Neel's contact can go now (no live lead)",
      'DELETE',
      `/app/contacts/${neel}?reason=mistake`,
    );
    await flow.expect(
      409,
      'restore a lead whose contact was removed',
      'POST',
      `/app/leads/${neelLead}/restore`,
    );
    flow.expectValue('contact removed: reason', '.error.reason', 'record_restore_conflict');
    await flow.expect(200, "restore Neel's contact", 'POST', `/app/contacts/${neel}/restore`);
    await flow.expect(200, 'restore the lead', 'POST', `/app/leads/${neelLead}/restore`);
    flow.expectValue('restored', '.data.id', neelLead);
    await flow.expect(409, 'restore a live lead', 'POST', `/app/leads/${neelLead}/restore`);
    flow.expectValue('live: reason', '.error.reason', 'record_not_deleted');
    await flow.expect(404, 'restore an unknown lead', 'POST', `/app/leads/${NOWHERE_LEAD}/restore`);
  });

  it('export (route 2)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      "export this run's leads",
      'GET',
      `/app/leads/exports?q=${lastName}&sort=name`,
    );
    flow.expectValue(
      'export file',
      '[(.data.file_name | startswith("leads-")), .data.content_type == "text/csv"] | all',
      true,
    );
    flow.expectValue('export rows', '.data.row_count', 5);
    flow.expectValue(
      'export carries the lead ids',
      `.data.content | contains("${riyaLead}")`,
      true,
    );
    flow.as('doctor');
    await flow.expect(
      200,
      'doctor exports (lead:export, L4)',
      'GET',
      `/app/leads/exports?q=${lastName}`,
    );
  });

  it('gates by role', async () => {
    flow.as('front_desk');
    await flow.expect(
      403,
      'front desk: export (no lead:export)',
      'GET',
      `/app/leads/exports?q=${lastName}`,
    );
    await flow.expect(
      403,
      'front desk: delete (no lead:delete)',
      'DELETE',
      `/app/leads/${neelLead}?reason=mistake`,
    );
    await flow.expect(200, 'front desk: list', 'GET', `/app/leads?q=${lastName}`);
    flow.as('marketing');
    await flow.expect(200, 'marketing: list', 'GET', `/app/leads?q=${lastName}`);
    await flow.expect(
      200,
      'marketing: create with a new contact (contact:create)',
      'POST',
      '/app/leads',
      { contact: newContact('Isha', '06') },
    );
    flow.as('therapist');
    await flow.expect(403, 'therapist: list (no lead:read)', 'GET', `/app/leads?q=${lastName}`);
    flow.as('accountant');
    await flow.expect(403, 'accountant: list', 'GET', `/app/leads?q=${lastName}`);
    await flow.expect(403, 'accountant: claim', 'POST', `/app/leads/${kabirLead}/claim`);
    await flow.expect(403, 'accountant: create', 'POST', '/app/leads', { contact_id: neel });
    flow.as('owner');
    await flow.expect(
      404,
      'the convert route is gone (L8)',
      'POST',
      `/app/leads/${riyaLead}/convert`,
    );
    await flow.expect(404, 'the reads route is gone (L10)', 'POST', `/app/leads/${riyaLead}/reads`);
  });

  it('the close date (LF4, D10): a close stamps it, a move between closes keeps it, a reopen empties it', async () => {
    flow.as('owner');
    /** Its own last name, so the earlier cases' lists and export counts stay as they are. */
    const closedName = `y${S}`;
    const closedContact = (firstName: string, suffix: string) => ({
      first_name: firstName,
      last_name: closedName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    await flow.expect(200, 'a lead filed as Lost', 'POST', '/app/leads', {
      contact: closedContact('Tara', '61'),
      status: 'lost',
    });
    const tara = flow.last('.data.id');
    const closedAt = flow.last('.data.closed_at');
    expect(Date.parse(closedAt), 'filed closed: stamped').not.toBeNaN();
    await flow.expect(200, 'Lost to Not interested', 'PATCH', `/app/leads/${tara}`, {
      status: 'not_interested',
    });
    flow.expectValue('a move between closes keeps the date', '.data.closed_at', closedAt);
    await flow.expect(200, 'reopen', 'PATCH', `/app/leads/${tara}`, { status: 'follow_up' });
    flow.expectValue('reopened: no close date', '.data.closed_at', 'null');
    await flow.expect(200, 'close again', 'PATCH', `/app/leads/${tara}`, { status: 'invalid' });
    expect(Date.parse(flow.last('.data.closed_at')), 'a fresh stamp').toBeGreaterThan(
      Date.parse(closedAt),
    );

    await flow.expect(200, 'an open lead', 'POST', '/app/leads', {
      contact: closedContact('Uma', '62'),
    });
    flow.expectValue('open: no close date', '.data.closed_at', 'null');
    const uma = flow.last('.data.id');
    await flow.expect(400, 'the close date is read-only (D11)', 'PATCH', `/app/leads/${uma}`, {
      closed_at: '2026-01-01T00:00:00Z',
    });
    await expect(
      operatorQuery`UPDATE app.leads SET closed_at = now() WHERE public_id = ${uma}`,
      'the database holds it (D13)',
    ).rejects.toThrow(/chk_leads_closed_at/);

    await flow.expect(200, 'export them', 'GET', `/app/leads/exports?q=${closedName}`);
    flow.expectValue(
      'the export carries the close date',
      '.data.content | split("\\n")[0] | split(",") | index("closed_at") != null',
      true,
    );
  });
});
