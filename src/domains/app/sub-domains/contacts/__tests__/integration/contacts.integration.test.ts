import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Sub-domain 4, Contacts (routes-final §4.A–4.B, launch ROUTE #129): the contact and its numbers,
 * the household rule, the one search, delete and restore, the preview, who handles the person, the
 * gates by role — one flow over the fixture organization.
 */
describe('Contacts — integration (routes-final §4.A–4.B)', () => {
  const S = String(Date.now());
  /** This run's last name — `q=${lastName}` lists only this run's contacts. */
  const lastName = `z${S}`;
  /** Ten-digit numbers unique to the run: 9 + the run's last 7 digits + two more. */
  const digits = `9${S.slice(-7)}`;
  const householdPhone = `+91${digits}01`;
  const riyaSecondPhone = `+91${digits}02`;
  const meeraPhone = `+91${digits}03`;
  const aanyaPhone = `+91${digits}04`;
  const sparePhone = `+91${digits}05`;
  const NOWHERE_CONTACT = 'con_aaaaaaaaaaaaaaaaaaaaa';
  const NOWHERE_MEMBERSHIP = 'mem_aaaaaaaaaaaaaaaaaaaaa';
  const NAMES = '[.data[].first_name] | join(",")';
  const FIELDS = '[.error.errors[].field] | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let theDayAfterTomorrow = '';

  let riya = '';
  let riyaNumber = '';
  let aarav = '';
  let kiaan = '';
  let meera = '';
  let aanya = '';
  let zoya = '';
  let thisRun = '';

  /** A create body for this run. */
  function contactBody(firstName: string, phones: unknown[], extra: Record<string, unknown> = {}) {
    return { first_name: firstName, last_name: lastName, phones, ...extra };
  }

  /** A one-number `phones` set, primary. */
  function primaryPhone(phone: string) {
    return [{ phone, is_primary: true }];
  }

  /** Every page's first names of `path`, `limit` at a time, joined. */
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
    theDayAfterTomorrow = calendarDay(fixture, 2);
  });

  afterAll(async () => {
    await app.close();
  });

  it('4.A contacts: create (route 2)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'create Riya (two numbers, tags)',
      'POST',
      '/app/contacts',
      contactBody(
        'Riya',
        [
          { phone: riyaSecondPhone, is_on_whatsapp: false },
          { phone: householdPhone, is_primary: true },
        ],
        {
          gender: 'female',
          date_of_birth: '1994-03-12',
          preference_tags: ['no_calls', 'after_six_pm'],
          email: 'riya@example.com',
          instagram_handles: ['riya.s'],
        },
      ),
    );
    riya = flow.last('.data.id');
    riyaNumber = flow.last('.data.contact_number');
    flow.expectValue(
      'create: primary_phone is the primary number (CT2)',
      '.data.primary_phone',
      householdPhone,
    );
    flow.expectValue(
      'create: phones, primary first',
      '[.data.phones[].phone] | join(",")',
      `${householdPhone},${riyaSecondPhone}`,
    );
    flow.expectValue('create: is_on_whatsapp kept', '.data.phones[1].is_on_whatsapp', false);
    flow.expectValue(
      'create: its own household (CT3)',
      '.data.household_contact_id == .data.id',
      true,
    );
    flow.expectValue('create: contact number assigned', '.data.contact_number > 0', true);
    flow.expectValue(
      'create: read-only fields null until #131–#133',
      '[.data.patient_id, .data.open_lead_id, .data.last_visit_on] | map(. == null) | all',
      true,
    );
    await flow.expect(
      422,
      'create without X-Idempotency-Key',
      'POST',
      '/app/contacts',
      contactBody('Nokey', primaryPhone(sparePhone)),
      { idempotencyKey: false },
    );
    await flow.expect(400, 'create without phones', 'POST', '/app/contacts', {
      first_name: 'Nophone',
      last_name: lastName,
    });
    flow.expectValue('create without phones: field', FIELDS, 'body.phones');
    await flow.expect(
      400,
      'create with two primaries',
      'POST',
      '/app/contacts',
      contactBody('Two', [
        { phone: sparePhone, is_primary: true },
        { phone: `+91${digits}06`, is_primary: true },
      ]),
    );
    flow.expectValue('two primaries: field', FIELDS, 'body.phones');
    await flow.expect(
      400,
      'create with no primary',
      'POST',
      '/app/contacts',
      contactBody('None', [{ phone: sparePhone }]),
    );
    await flow.expect(
      400,
      'create with a number twice',
      'POST',
      '/app/contacts',
      contactBody('Twice', [{ phone: sparePhone, is_primary: true }, { phone: sparePhone }]),
    );
    await flow.expect(
      400,
      'create with six numbers',
      'POST',
      '/app/contacts',
      contactBody(
        'Six',
        Array.from({ length: 6 }, (_, index) => ({
          phone: `+91${digits.slice(0, 8)}7${index}`,
          is_primary: index === 0,
        })),
      ),
    );
    await flow.expect(
      400,
      'create with a number not +91 and 10 digits',
      'POST',
      '/app/contacts',
      contactBody('Bad', [{ phone: '9876543210', is_primary: true }]),
    );
    await flow.expect(
      409,
      "create with Riya's number, own household (CT3)",
      'POST',
      '/app/contacts',
      contactBody('Copy', primaryPhone(householdPhone)),
    );
    flow.expectValue('number clash: reason', '.error.reason', 'contact_phone_exists');
    flow.expectValue(
      'number clash: names the contact',
      `(.error.detail | contains("Riya ${lastName}")) and (.error.detail | contains("C-${riyaNumber}"))`,
      true,
    );
    await flow.expect(
      409,
      'number clash in Spanish',
      'POST',
      '/app/contacts',
      contactBody('Copy', primaryPhone(householdPhone)),
      { language: 'es' },
    );
    flow.expectValue(
      'number clash: Spanish detail',
      '.error.detail | contains("ya pertenece")',
      true,
    );
    await flow.expect(
      200,
      "create Aarav in Riya's household, sharing her number",
      'POST',
      '/app/contacts',
      contactBody('Aarav', primaryPhone(householdPhone), { household_contact_id: riya }),
    );
    aarav = flow.last('.data.id');
    flow.expectValue("Aarav: Riya's household", '.data.household_contact_id', riya);
    await flow.expect(
      200,
      "create Kiaan in Aarav's household — normalized to its first contact",
      'POST',
      '/app/contacts',
      contactBody('Kiaan', primaryPhone(householdPhone), { household_contact_id: aarav }),
    );
    kiaan = flow.last('.data.id');
    flow.expectValue("Kiaan: Riya's household", '.data.household_contact_id', riya);
    await flow.expect(
      400,
      'create in an unknown household',
      'POST',
      '/app/contacts',
      contactBody('Lost', primaryPhone(sparePhone), { household_contact_id: NOWHERE_CONTACT }),
    );
    flow.expectValue('unknown household: field', FIELDS, 'household_contact_id');
    await flow.expect(
      400,
      'create with a tag not a lowercase key (CT14)',
      'POST',
      '/app/contacts',
      contactBody('Tag', primaryPhone(sparePhone), { preference_tags: ['No Calls'] }),
    );
    flow.expectValue('bad tag: field', FIELDS, 'body.preference_tags/0');
    await flow.expect(
      400,
      'create with a repeated tag',
      'POST',
      '/app/contacts',
      contactBody('Tag', primaryPhone(sparePhone), { preference_tags: ['mornings', 'mornings'] }),
    );
    await flow.expect(
      400,
      'create with 13 tags',
      'POST',
      '/app/contacts',
      contactBody('Tag', primaryPhone(sparePhone), {
        preference_tags: Array.from({ length: 13 }, (_, index) => `tag_${index}`),
      }),
    );
    await flow.expect(
      400,
      'create born in the future (CT13)',
      'POST',
      '/app/contacts',
      contactBody('Future', primaryPhone(sparePhone), { date_of_birth: theDayAfterTomorrow }),
    );
    flow.expectValue('future birth: field', FIELDS, 'date_of_birth');
    await flow.expect(
      400,
      'create referred by a contact, source doctor (CT13)',
      'POST',
      '/app/contacts',
      contactBody('Ref', primaryPhone(sparePhone), {
        referral_source: 'doctor',
        referred_by_contact_id: riya,
      }),
    );
    flow.expectValue('referrer without patient: field', FIELDS, 'referred_by_contact_id');
    await flow.expect(
      400,
      'create with an unknown field',
      'POST',
      '/app/contacts',
      contactBody('Odd', primaryPhone(sparePhone), { language: 'en' }),
    );
    await flow.expect(
      200,
      'create Meera referred by Riya (source patient)',
      'POST',
      '/app/contacts',
      contactBody('Meera', primaryPhone(meeraPhone), {
        referral_source: 'patient',
        referred_by_contact_id: riya,
        preference_tags: ['gujarati'],
      }),
    );
    meera = flow.last('.data.id');
    flow.expectValue('Meera: referred_by_contact_id', '.data.referred_by_contact_id', riya);
    await flow.expect(
      200,
      'create Aanya (email holds aarav)',
      'POST',
      '/app/contacts',
      contactBody('Aanya', primaryPhone(aanyaPhone), {
        email: `t${S}.aarav@example.com`,
        preference_tags: ['prefers_whatsapp'],
      }),
    );
    aanya = flow.last('.data.id');
    thisRun = [riya, aarav, kiaan, meera, aanya].join(',');
  });

  it('4.A contacts: read (route 3)', async () => {
    flow.as('owner');
    await flow.expect(200, 'get Riya', 'GET', `/app/contacts/${riya}`);
    flow.expectValue('get: phones', '.data.phones | length', 2);
    flow.expectValue('get: not awaiting a reply', '.data.is_awaiting_reply', false);
    await flow.expect(404, 'get unknown', 'GET', `/app/contacts/${NOWHERE_CONTACT}`);
    await flow.expect(
      404,
      'get a non-contact id',
      'GET',
      '/app/contacts/brn_aaaaaaaaaaaaaaaaaaaaa',
    );
  });

  it('4.A contacts: the list and the one search (route 1, CT8, CT9, CT12)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      "list this run (q = the run's last name)",
      'GET',
      `/app/contacts?q=${lastName}`,
    );
    flow.expectValue('list: by name', NAMES, 'Aanya,Aarav,Kiaan,Meera,Riya');
    flow.expectValue('list: total', '.meta.pagination.estimated_total', 5);
    flow.expectValue('list: no phones on a list', '[.data[] | has("phones")] | any', false);
    flow.expectEqual(
      'list paged 2 by 2',
      await pageNames(`/app/contacts?q=${lastName}`, 2),
      'Aanya,Aarav,Kiaan,Meera,Riya',
    );
    await flow.expect(
      200,
      'search aarav: the name match first (best match)',
      'GET',
      `/app/contacts?q=aarav&ids=${thisRun}`,
    );
    flow.expectValue('search aarav: Aarav before Aanya (email)', NAMES, 'Aarav,Aanya');
    await flow.expect(
      200,
      'search aarav sorted newest first',
      'GET',
      `/app/contacts?q=aarav&ids=${thisRun}&sort=created_at`,
    );
    flow.expectValue('search aarav by created_at', NAMES, 'Aanya,Aarav');
    await flow.expect(400, 'search two letters', 'GET', '/app/contacts?q=ri');
    flow.expectValue('short search: field', FIELDS, 'q');
    await flow.expect(400, 'search three digits', 'GET', '/app/contacts?q=981');
    await flow.expect(200, "search a number's digits", 'GET', `/app/contacts?q=${digits}02`);
    flow.expectValue('number digits: Riya', NAMES, 'Riya');
    await flow.expect(
      200,
      'search a number as typed (+91 and spaces)',
      'GET',
      `/app/contacts?q=%2B91%20${digits.slice(0, 5)}%20${digits.slice(5)}03`,
    );
    flow.expectValue('number as typed: Meera', NAMES, 'Meera');
    await flow.expect(
      200,
      'search a whole contact number',
      'GET',
      `/app/contacts?q=C-${riyaNumber}`,
    );
    flow.expectValue('contact number: exactly Riya', NAMES, 'Riya');
    await flow.expect(
      200,
      'search by email part',
      'GET',
      `/app/contacts?q=riya%40example&ids=${thisRun}`,
    );
    flow.expectValue('email: Riya', NAMES, 'Riya');
    await flow.expect(
      200,
      'phone filter: the household sharing it',
      'GET',
      `/app/contacts?phone=%2B91${digits}01`,
    );
    flow.expectValue('phone filter: three of one household', NAMES, 'Aarav,Kiaan,Riya');
    flow.expectEqual(
      'phone filter paged 1 by 1',
      await pageNames(`/app/contacts?phone=%2B91${digits}01`, 1),
      'Aarav,Kiaan,Riya',
    );
    await flow.expect(400, 'phone filter not +91', 'GET', '/app/contacts?phone=12345');
    await flow.expect(200, 'ids filter', 'GET', `/app/contacts?ids=${riya},${meera}`);
    flow.expectValue('ids filter: two', NAMES, 'Meera,Riya');
    const tooManyIds = Array.from(
      { length: 101 },
      (_, index) => `con_${String(index + 1).padStart(21, '0')}`,
    ).join(',');
    await flow.expect(400, 'ids filter over 100', 'GET', `/app/contacts?ids=${tooManyIds}`);
    await flow.expect(200, 'household filter', 'GET', `/app/contacts?household_contact_id=${riya}`);
    flow.expectValue("household filter: Riya's", NAMES, 'Aarav,Kiaan,Riya');
    await flow.expect(
      200,
      'household filter, unknown id: empty',
      'GET',
      `/app/contacts?household_contact_id=${NOWHERE_CONTACT}`,
    );
    flow.expectValue('unknown household: none', '.data | length', 0);
    await flow.expect(
      200,
      'tag filter (any of)',
      'GET',
      `/app/contacts?preference_tags=gujarati,no_calls&ids=${thisRun}`,
    );
    flow.expectValue('tag filter: Meera, Riya', NAMES, 'Meera,Riya');
    await flow.expect(
      200,
      'custom tag filter',
      'GET',
      `/app/contacts?preference_tags=prefers_whatsapp&ids=${thisRun}`,
    );
    flow.expectValue('custom tag: Aanya', NAMES, 'Aanya');
    await flow.expect(
      400,
      'tag filter not a key',
      'GET',
      '/app/contacts?preference_tags=No%20Calls',
    );
    await flow.expect(
      200,
      'is_patient=true matches none yet (D61)',
      'GET',
      `/app/contacts?is_patient=true&ids=${thisRun}`,
    );
    flow.expectValue('is_patient=true: none', '.data | length', 0);
    await flow.expect(
      200,
      'has_open_lead=false matches all yet (D61)',
      'GET',
      `/app/contacts?has_open_lead=false&ids=${thisRun}`,
    );
    flow.expectValue('has_open_lead=false: five', '.data | length', 5);
    await flow.expect(400, 'sort=match is internal', 'GET', '/app/contacts?sort=match');
    const operatorSql = getOperatorSql();
    await operatorSql`
      UPDATE app.contacts SET last_received_at = now(), last_activity_at = now()
      WHERE public_id = ${riya}
    `;
    await operatorSql`
      UPDATE app.contacts SET last_sent_at = now(), last_received_at = now() - interval '1 hour',
        last_activity_at = now() - interval '1 hour'
      WHERE public_id = ${meera}
    `;
    await flow.expect(
      200,
      'awaiting a reply',
      'GET',
      `/app/contacts?is_awaiting_reply=true&ids=${thisRun}`,
    );
    flow.expectValue('awaiting a reply: Riya', NAMES, 'Riya');
    flow.expectValue('awaiting a reply: flag', '.data[0].is_awaiting_reply', true);
    await flow.expect(
      200,
      'by recency (no activity last)',
      'GET',
      `/app/contacts?sort=last_activity_at&ids=${thisRun}`,
    );
    flow.expectValue(
      'by recency: newest, then no activity newest first',
      NAMES,
      'Riya,Meera,Aanya,Kiaan,Aarav',
    );
    flow.expectEqual(
      'by recency paged 2 by 2',
      await pageNames(`/app/contacts?sort=last_activity_at&ids=${thisRun}`, 2),
      'Riya,Meera,Aanya,Kiaan,Aarav',
    );
    await flow.expect(
      200,
      'by recency, oldest first',
      'GET',
      `/app/contacts?sort=last_activity_at&order=asc&ids=${thisRun}`,
    );
    flow.expectValue('by recency asc', NAMES, 'Aarav,Kiaan,Aanya,Meera,Riya');
  });

  it('4.A contacts: change (route 4)', async () => {
    flow.as('owner');
    await flow.expect(200, 'get Riya before the change', 'GET', `/app/contacts/${riya}`);
    const updatedAt = flow.last('.data.updated_at');
    await flow.expect(200, "change Riya's tags", 'PATCH', `/app/contacts/${riya}`, {
      preference_tags: ['evenings'],
      expected_updated_at: updatedAt,
    });
    await flow.expect(409, 'stale save', 'PATCH', `/app/contacts/${riya}`, {
      first_name: 'Riyaa',
      expected_updated_at: updatedAt,
    });
    flow.expectValue('stale save: record_changed', '.error.reason', 'record_changed');
    await flow.expect(
      400,
      'PATCH with only expected_updated_at',
      'PATCH',
      `/app/contacts/${riya}`,
      {
        expected_updated_at: updatedAt,
      },
    );
    await flow.expect(400, 'PATCH an unknown field', 'PATCH', `/app/contacts/${riya}`, {
      kind: 'lead',
    });
    await flow.expect(400, 'PATCH born in the future', 'PATCH', `/app/contacts/${riya}`, {
      date_of_birth: theDayAfterTomorrow,
    });
    await flow.expect(
      200,
      "replace Riya's numbers (keep her second only)",
      'PATCH',
      `/app/contacts/${riya}`,
      { phones: primaryPhone(riyaSecondPhone) },
    );
    flow.expectValue('replaced: primary_phone follows', '.data.primary_phone', riyaSecondPhone);
    flow.expectValue('replaced: one number', '.data.phones | length', 1);
    await flow.expect(
      200,
      "search the household number's digits after the replace",
      'GET',
      `/app/contacts?q=${digits}01`,
    );
    flow.expectValue('household number now: Aarav and Kiaan only', NAMES, 'Aarav,Kiaan');
    await flow.expect(
      409,
      "give Meera the household's number (own household)",
      'PATCH',
      `/app/contacts/${meera}`,
      { phones: [{ phone: meeraPhone, is_primary: true }, { phone: householdPhone }] },
    );
    flow.expectValue('Meera clash: names Aarav or Kiaan', '.error.reason', 'contact_phone_exists');
    await flow.expect(
      200,
      'move Meera into the household via Aarav',
      'PATCH',
      `/app/contacts/${meera}`,
      { household_contact_id: aarav },
    );
    flow.expectValue("Meera: Riya's household", '.data.household_contact_id', riya);
    await flow.expect(
      200,
      "now Meera may share the household's number",
      'PATCH',
      `/app/contacts/${meera}`,
      { phones: [{ phone: meeraPhone, is_primary: true }, { phone: householdPhone }] },
    );
    await flow.expect(
      400,
      'move Riya — the first of a household with others',
      'PATCH',
      `/app/contacts/${riya}`,
      { household_contact_id: aanya },
    );
    flow.expectValue('first of a household: field', FIELDS, 'household_contact_id');
    await flow.expect(
      200,
      "name Riya's own household — no move",
      'PATCH',
      `/app/contacts/${riya}`,
      { household_contact_id: kiaan },
    );
    await flow.expect(
      409,
      'Kiaan leaves the household but keeps the shared number',
      'PATCH',
      `/app/contacts/${kiaan}`,
      { household_contact_id: null },
    );
    flow.expectValue('leave with a shared number: reason', '.error.reason', 'contact_phone_exists');
    await flow.expect(
      200,
      'Kiaan leaves with a number of his own',
      'PATCH',
      `/app/contacts/${kiaan}`,
      { household_contact_id: null, phones: primaryPhone(sparePhone) },
    );
    flow.expectValue('Kiaan: his own household', '.data.household_contact_id', kiaan);
    await flow.expect(
      400,
      "Meera's source to doctor while she names a referrer",
      'PATCH',
      `/app/contacts/${meera}`,
      { referral_source: 'doctor' },
    );
    await flow.expect(
      200,
      'clear the referrer with the source',
      'PATCH',
      `/app/contacts/${meera}`,
      { referral_source: 'doctor', referred_by_contact_id: null },
    );
    await flow.expect(404, 'PATCH unknown', 'PATCH', `/app/contacts/${NOWHERE_CONTACT}`, {
      first_name: 'X',
    });
  });

  it('4.A contacts: delete and restore (routes 5–6)', async () => {
    flow.as('owner');
    await flow.expect(400, 'delete without a reason', 'DELETE', `/app/contacts/${aanya}`);
    await flow.expect(
      400,
      'delete other without a note',
      'DELETE',
      `/app/contacts/${aanya}?reason=other`,
    );
    await flow.expect(204, 'delete Aanya', 'DELETE', `/app/contacts/${aanya}?reason=duplicate`);
    await flow.expect(404, 'get deleted', 'GET', `/app/contacts/${aanya}`);
    await flow.expect(404, 'delete again', 'DELETE', `/app/contacts/${aanya}?reason=duplicate`);
    await flow.expect(
      200,
      'her number left with her',
      'GET',
      `/app/contacts?phone=%2B91${digits}04`,
    );
    flow.expectValue('deleted number: no live contact', '.data | length', 0);
    await flow.expect(
      200,
      'Zoya takes the freed number',
      'POST',
      '/app/contacts',
      contactBody('Zoya', primaryPhone(aanyaPhone)),
    );
    zoya = flow.last('.data.id');
    await flow.expect(
      409,
      'restore Aanya — her number was taken meanwhile',
      'POST',
      `/app/contacts/${aanya}/restore`,
    );
    flow.expectValue('restore clash: reason', '.error.reason', 'contact_phone_exists');
    flow.expectValue('restore clash: names Zoya', '.error.detail | contains("Zoya")', true);
    await flow.expect(404, 'Aanya is still deleted', 'GET', `/app/contacts/${aanya}`);
    await flow.expect(204, 'delete Zoya', 'DELETE', `/app/contacts/${zoya}?reason=mistake`);
    await flow.expect(200, 'restore Aanya', 'POST', `/app/contacts/${aanya}/restore`);
    flow.expectValue('restored with her number', '[.data.phones[].phone] | join(",")', aanyaPhone);
    await flow.expect(
      200,
      'her number is live again',
      'GET',
      `/app/contacts?phone=%2B91${digits}04`,
    );
    flow.expectValue('restored number: Aanya', NAMES, 'Aanya');
    await flow.expect(409, 'restore a live contact', 'POST', `/app/contacts/${aanya}/restore`);
    flow.expectValue('restore live: record_not_deleted', '.error.reason', 'record_not_deleted');
    await flow.expect(404, 'restore unknown', 'POST', `/app/contacts/${NOWHERE_CONTACT}/restore`);
  });

  it('4.A contacts: the hover card (route 7)', async () => {
    flow.as('owner');
    await flow.expect(200, 'preview Riya', 'GET', `/app/contacts/${riya}/preview`);
    flow.expectValue('preview: no phones', '.data | has("phones")', false);
    flow.expectValue('preview: primary_phone', '.data.primary_phone', riyaSecondPhone);
    flow.expectValue(
      'preview: lead, patient, appointments null (D61)',
      '[.data.open_lead, .data.patient, .data.next_appointment, .data.last_appointment] | map(. == null) | all',
      true,
    );
    await flow.expect(404, 'preview unknown', 'GET', `/app/contacts/${NOWHERE_CONTACT}/preview`);
    await flow.expect(404, 'preview deleted', 'GET', `/app/contacts/${zoya}/preview`);
  });

  it('4.B contact members (routes 8–9, CT11)', async () => {
    flow.as('owner');
    const doctor = fixture.members.doctor.membershipPublicId;
    const frontDesk = fixture.members.front_desk.membershipPublicId;
    await flow.expect(200, 'members of a new contact', 'GET', `/app/contacts/${riya}/members`);
    flow.expectValue('members: none yet', '.data | length', 0);
    await flow.expect(200, 'set who handles Riya', 'PUT', `/app/contacts/${riya}/members`, {
      membership_ids: [doctor, frontDesk],
    });
    flow.expectValue('set members: two', '.data | length', 2);
    await flow.expect(200, 'the contact lists them', 'GET', `/app/contacts/${riya}`);
    flow.expectValue('member_membership_ids', '.data.member_membership_ids | length', 2);
    await flow.expect(
      200,
      'my people: member filter',
      'GET',
      `/app/contacts?member_membership_id=${doctor}&ids=${thisRun}`,
    );
    flow.expectValue('member filter: Riya', NAMES, 'Riya');
    await flow.expect(
      200,
      'member filter, unknown member: empty',
      'GET',
      `/app/contacts?member_membership_id=${NOWHERE_MEMBERSHIP}`,
    );
    flow.expectValue('unknown member: none', '.data | length', 0);
    await flow.expect(
      400,
      'members: an unknown team member',
      'PUT',
      `/app/contacts/${riya}/members`,
      {
        membership_ids: [NOWHERE_MEMBERSHIP],
      },
    );
    flow.expectValue('unknown member: field', FIELDS, 'membership_ids');
    await flow.expect(400, 'members: one twice', 'PUT', `/app/contacts/${riya}/members`, {
      membership_ids: [doctor, doctor],
    });
    await flow.expect(400, 'members: no list', 'PUT', `/app/contacts/${riya}/members`, {});
    await flow.expect(
      200,
      'members: keep the doctor only',
      'PUT',
      `/app/contacts/${riya}/members`,
      {
        membership_ids: [doctor],
      },
    );
    flow.expectValue('keep the doctor: one', '[.data[].membership_id] | join(",")', doctor);
    await flow.expect(200, 'members: none', 'PUT', `/app/contacts/${riya}/members`, {
      membership_ids: [],
    });
    flow.expectValue('members: emptied', '.data | length', 0);
    await flow.expect(404, 'members of a deleted contact', 'GET', `/app/contacts/${zoya}/members`);
    await flow.expect(
      404,
      'set members of an unknown contact',
      'PUT',
      `/app/contacts/${NOWHERE_CONTACT}/members`,
      { membership_ids: [] },
    );
  });

  it('gates by role (CT5: read for every role, write for all but the Accountant)', async () => {
    flow.as('accountant');
    await flow.expect(200, 'accountant: list', 'GET', `/app/contacts?q=${lastName}`);
    await flow.expect(200, 'accountant: preview', 'GET', `/app/contacts/${riya}/preview`);
    await flow.expect(200, 'accountant: members', 'GET', `/app/contacts/${riya}/members`);
    await flow.expect(
      403,
      'accountant: create',
      'POST',
      '/app/contacts',
      contactBody('Acc', primaryPhone(`+91${digits}08`)),
    );
    await flow.expect(403, 'accountant: change', 'PATCH', `/app/contacts/${riya}`, {
      first_name: 'Riya',
    });
    await flow.expect(403, 'accountant: set members', 'PUT', `/app/contacts/${riya}/members`, {
      membership_ids: [],
    });

    flow.as('front_desk');
    await flow.expect(
      200,
      'front desk: create',
      'POST',
      '/app/contacts',
      contactBody('Desk', primaryPhone(`+91${digits}09`)),
    );
    const desk = flow.last('.data.id');
    await flow.expect(200, 'front desk: set members', 'PUT', `/app/contacts/${desk}/members`, {
      membership_ids: [fixture.members.front_desk.membershipPublicId],
    });
    await flow.expect(403, 'front desk: delete', 'DELETE', `/app/contacts/${desk}?reason=mistake`);
    await flow.expect(403, 'front desk: restore', 'POST', `/app/contacts/${aanya}/restore`);

    flow.as('marketing');
    await flow.expect(200, 'marketing: change', 'PATCH', `/app/contacts/${desk}`, {
      has_marketing_consent: true,
    });

    flow.as('admin');
    await flow.expect(204, 'admin: delete', 'DELETE', `/app/contacts/${desk}?reason=mistake`);
  });
});
