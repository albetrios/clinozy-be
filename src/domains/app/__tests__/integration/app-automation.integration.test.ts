import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import { env } from '@/shared/config/env.config.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { runTaskRulesJob } from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';

/** The harness's S3 bucket (`harness-provider-env.ts`). */
const S3_HOST = `https://${env.S3_BUCKET ?? 'contract-test-bucket'}.s3.${env.S3_REGION ?? 'us-east-1'}.amazonaws.com`;

/** A JPEG whose APP1 is an XMP packet naming where it was taken. */
const JPEG_WITH_LOCATION = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x3e]),
  Buffer.from(
    'http://ns.adobe.com/xap/1.0/\0<exif:GPSLatitude>21,10N</exif:GPSLatitude>',
    'latin1',
  ).subarray(0, 0x3c),
  Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]),
]);

/**
 * Launch ROUTE #143–#147 (D79): a member who works a person joins their open lead's involved
 * members (WC-16); the rules run opens a re-target lead for a lapsed patient (WC-17, D35); a photo
 * is filed only after its stored file lost its location (WC-42, S3 answered by nock).
 */
describe('App automation — integration (launch D79, ROUTE #143–#147)', () => {
  const S = String(Date.now());
  const digits = `5${S.slice(-7)}`;
  const lastName = `a${S}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let organizationPublicId = '';
  let vesu = '';
  let counsellor = '';
  let frontDesk = '';
  let doctor = '';
  let admin = '';
  let removalWasEnabled = true;

  /** A contact of this run. */
  async function person(firstName: string, suffix: string, extra = {}): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
      ...extra,
    });
    return flow.last('.data.id');
  }

  /** The first working date (Monday–Saturday) from today + `from`, in the fixture's time zone. */
  function workDay(from: number): string {
    const timeZone = fixture.organization.timezone;
    for (let offset = from; offset < from + 7; offset += 1) {
      const at = new Date(Date.now() + offset * 86_400_000);
      if (new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at) !== 'Sun') {
        return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
      }
    }
    return calendarDay(fixture, from);
  }

  /** A lead's involved members, as the API answers them. */
  async function involved(lead: string): Promise<string[]> {
    await flow.expect(200, `lead ${lead}`, 'GET', `/app/leads/${lead}`);
    return (flow.lastBody() as { data: { involved_membership_ids: string[] } }).data
      .involved_membership_ids;
  }

  /** The organization's rules run (TK4), as the worker runs it. */
  function runRules() {
    return runOrganizationScopedWorkerJob({ organizationPublicId }, (handle) =>
      runTaskRulesJob(handle, organizationPublicId),
    );
  }

  /** A patient file for the contact; answers its id. */
  async function patientFile(contact: string): Promise<string> {
    flow.as('owner');
    await flow.expect(200, `file for ${contact}`, 'POST', '/app/patients', {
      contact_id: contact,
      home_branch_id: vesu,
    });
    return flow.last('.data.id');
  }

  /** A completed visit `daysAgo` days back at `start` (written directly — the rules never book the past). */
  async function visitDaysAgo(contact: string, daysAgo: number, start: string): Promise<void> {
    const date = calendarDay(fixture, -daysAgo);
    await getOperatorSql()`
      INSERT INTO app.appointments (public_id, organization_id, contact_id, branch_id,
        doctor_membership_id, appointment_date, start_time, duration_minutes, service_label, status,
        checked_in_at, completed_at)
      SELECT ${generatePublicId('appointment')}, contact.organization_id, contact.id, ${fixture.branchIds.vesu},
        ${fixture.members.doctor.membershipId}, ${date}::date, ${start}::time, 30, 'Consultation', 'completed',
        now() - make_interval(days => ${daysAgo}), now() - make_interval(days => ${daysAgo})
      FROM app.contacts contact WHERE contact.public_id = ${contact}
    `;
  }

  /** The contact's re-target leads. */
  async function retargetLeads(contact: string) {
    return getOperatorSql()<{ retarget_reason: string; owner_membership_id: number | null }[]>`
      SELECT lead.retarget_reason, lead.owner_membership_id FROM app.leads lead
      JOIN app.contacts contact ON contact.id = lead.contact_id
      WHERE contact.public_id = ${contact} AND lead.kind = 'retarget'
    `;
  }

  /** A confirmed upload of the fixture organization; answers its key. */
  async function confirmedUpload(name: string, mimeType: string): Promise<string> {
    const key = `organizations/${organizationPublicId}/uploads/${lastName}-${name}`;
    await getOperatorSql()`
      INSERT INTO upload.uploads (public_id, user_id, organization_id, file_name, file_key, mime_type,
        file_size, bucket, status, uploaded_at)
      VALUES (${generatePublicId('upload')}, ${fixture.members.owner.userId}, ${fixture.organization.id},
        ${name}, ${key}, ${mimeType}, ${JPEG_WITH_LOCATION.length}, 'local', 'UPLOADED', now())
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
    counsellor = fixture.members.counsellor.membershipPublicId;
    frontDesk = fixture.members.front_desk.membershipPublicId;
    doctor = fixture.members.doctor.membershipPublicId;
    admin = fixture.members.admin.membershipPublicId;
    removalWasEnabled = env.PATIENT_IMAGE_LOCATION_REMOVAL_ENABLED;
  });

  afterEach(() => {
    nock.cleanAll();
    env.PATIENT_IMAGE_LOCATION_REMOVAL_ENABLED = removalWasEnabled;
  });

  afterAll(async () => {
    await app.close();
  });

  it('WC-16: whoever messages, calls, notes or books a person joins their open lead — never its owner', async () => {
    flow.as('owner');
    const riya = await person('Riya', '01');
    await flow.expect(200, "Riya's lead, the counsellor's", 'POST', '/app/leads', {
      contact_id: riya,
      source: 'instagram',
      owner_membership_id: counsellor,
      branch_id: vesu,
    });
    const lead = flow.last('.data.id');
    expect(await involved(lead)).toEqual([]);

    flow.as('front_desk');
    await flow.expect(
      200,
      'the front desk writes to Riya',
      'POST',
      `/app/contacts/${riya}/activities/send-message`,
      {
        type: 'whatsapp',
        body: 'Hi Riya, when would you like to come in?',
      },
    );
    flow.as('counsellor');
    await flow.expect(200, 'the owner notes', 'POST', `/app/contacts/${riya}/activities/add-note`, {
      body: 'Prefers evenings',
    });
    expect(await involved(lead)).toEqual([frontDesk]);

    flow.as('admin');
    await flow.expect(200, 'the admin books Riya', 'POST', '/app/appointments', {
      contact_id: riya,
      branch_id: vesu,
      doctor_membership_id: doctor,
      appointment_date: workDay(3),
      start_time: '11:00',
      service_label: 'Consultation',
    });
    expect((await involved(lead)).sort()).toEqual([admin, frontDesk].sort());
  });

  it('WC-17: a lapsed patient with marketing consent and nothing booked gets one re-target lead', async () => {
    flow.as('owner');
    const lapsed = await person('Meera', '02', { has_marketing_consent: true });
    const noConsent = await person('Kiran', '03');
    const booked = await person('Dev', '04', { has_marketing_consent: true });
    const recent = await person('Isha', '05', { has_marketing_consent: true });
    for (const contact of [lapsed, noConsent, booked, recent]) await patientFile(contact);
    await visitDaysAgo(lapsed, 100, '10:00');
    await visitDaysAgo(noConsent, 100, '11:00');
    await visitDaysAgo(booked, 100, '12:00');
    await visitDaysAgo(recent, 20, '10:00');
    flow.as('front_desk');
    await flow.expect(200, 'Dev has a visit booked', 'POST', '/app/appointments', {
      contact_id: booked,
      branch_id: vesu,
      doctor_membership_id: doctor,
      appointment_date: workDay(4),
      start_time: '12:00',
      service_label: 'Consultation',
    });

    const run = await runRules();
    expect(run.retargetCount).toBeGreaterThanOrEqual(1);
    expect(await retargetLeads(lapsed)).toEqual([
      { retarget_reason: 'No visit in 90 days', owner_membership_id: null },
    ]);
    for (const contact of [noConsent, booked, recent])
      expect(await retargetLeads(contact)).toEqual([]);

    await runRules();
    expect(await retargetLeads(lapsed)).toHaveLength(1);
  });

  it('WC-42: a photo is filed only once its stored file has lost where it was taken', async () => {
    env.PATIENT_IMAGE_LOCATION_REMOVAL_ENABLED = true;
    flow.as('owner');
    const neha = await person('Neha', '06');
    const file = await patientFile(neha);
    const key = await confirmedUpload('after.jpg', 'image/jpeg');
    let written = '';
    nock(S3_HOST)
      .get(`/${key}`)
      .query(true)
      .reply(200, JPEG_WITH_LOCATION, { 'content-type': 'image/jpeg' });
    nock(S3_HOST)
      .put(`/${key}`, (body: unknown) => {
        // nock hands a binary body over hex-encoded
        written = String(body);
        return true;
      })
      .query(true)
      .reply(200, '');

    await flow.expect(200, "Neha's photo", 'POST', `/app/patients/${file}/images`, {
      file_key: key,
      body_part: 'upper_lip',
    });
    expect(written.length).toBeGreaterThan(0);
    const gpsInHex = Buffer.from('GPSLatitude', 'latin1').toString('hex');
    expect(written.includes('GPSLatitude') || written.includes(gpsInHex)).toBe(false);

    // The store is down: nothing is filed — the photo is never shown with its location.
    const second = await confirmedUpload('before.jpg', 'image/jpeg');
    nock(S3_HOST).get(`/${second}`).query(true).times(4).reply(503, 'Slow Down');
    const response = await flow.call('POST', `/app/patients/${file}/images`, {
      file_key: second,
    });
    expect(response.status).toBeGreaterThanOrEqual(500);
    const filed = await getOperatorSql()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM app.patient_images WHERE file_key = ${second}
    `;
    expect(filed[0]?.count).toBe(0);

    // The stored file is gone (S3 answers 404): no location to remove — filed like any attach.
    const gone = await confirmedUpload('gone.jpg', 'image/jpeg');
    nock(S3_HOST)
      .get(`/${gone}`)
      .query(true)
      .reply(404, '<Error><Code>NoSuchKey</Code></Error>', { 'content-type': 'application/xml' });
    nock(S3_HOST).head(`/${gone}`).query(true).reply(404);
    await flow.expect(
      200,
      'a photo whose stored file is gone',
      'POST',
      `/app/patients/${file}/images`,
      {
        file_key: gone,
      },
    );
  });
});
