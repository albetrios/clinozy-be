import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  type AppFixtureRole,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Who reads what about a patient, per role. B1-1: a check-in's text, the activity entry a check-in
 * writes and a session's remark go to the medical-detail readers only
 * (`patient:clinical_record:read`, `patient:update` or `patient_prescription:read`); the
 * Accountant and Marketing, who read the file's name and contact, see none of it. B1-5: a
 * contact's open lead, patient number and visits follow `lead:read`, `patient:read`,
 * `appointment:read` and the caller's branches.
 */
describe('Record access per role — integration (B1-1, B1-5)', () => {
  const S = String(Date.now());
  const ROLES = '/tenancy/organization/roles';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let owner: AppFlow;
  let contact = '';
  let patient = '';
  let checkIn = '';
  let treatment = '';

  /** A flow acting as one fixture member. */
  const as = (role: AppFixtureRole) => new AppFlow(app, fixture).as(role);

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    owner = as('owner');
    await owner.expect(200, 'a contact', 'POST', '/app/contacts', {
      first_name: 'Nila',
      last_name: `c${S}`,
      phones: [{ phone: `+917${S.slice(-7)}31`, is_primary: true }],
    });
    contact = owner.last('.data.id');
    await owner.expect(200, 'her file', 'POST', '/app/patients', {
      contact_id: contact,
      home_branch_id: fixture.branches.vesu,
    });
    patient = owner.last('.data.id');
    await owner.expect(200, 'a check-in', 'POST', `/app/patients/${patient}/check-ins`, {
      feel: 'worse',
      score: 3,
      context: 'After chemical peel',
      followed: 'partly',
      followed_note: 'Skipped the sunscreen',
      current_state: 'Redness and peeling on both cheeks',
      next_plan: 'Hold retinoids for a week',
    });
    checkIn = owner.last('.data.id');
    await owner.expect(200, 'a session', 'POST', `/app/patients/${patient}/treatments`, {
      name: 'Chemical peel',
      remark: 'Reacted to 30% glycolic',
    });
    treatment = owner.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it("hides a check-in's clinical text from the Accountant and Marketing", async () => {
    for (const role of ['accountant', 'marketing'] as const) {
      const flow = as(role);
      await flow.expect(
        200,
        `${role} reads the check-in`,
        'GET',
        `/app/patients/${patient}/check-ins/${checkIn}`,
      );
      flow.expectValue(`${role}: the score`, '.data.score', 3);
      for (const field of ['context', 'followed_note', 'current_state', 'next_plan']) {
        flow.expectValue(`${role}: no ${field}`, `.data.${field}`, 'null');
      }
      await flow.expect(200, `${role} lists them`, 'GET', `/app/patients/${patient}/check-ins`);
      flow.expectValue(
        `${role}: no text on the list`,
        '[.data[] | .current_state] | join(",")',
        '',
      );
    }
  });

  it('shows it to the medical-detail readers', async () => {
    for (const role of ['doctor', 'front_desk', 'pharmacist'] as const) {
      const flow = as(role);
      await flow.expect(
        200,
        `${role} reads the check-in`,
        'GET',
        `/app/patients/${patient}/check-ins/${checkIn}`,
      );
      flow.expectValue(
        `${role}: the state`,
        '.data.current_state',
        'Redness and peeling on both cheeks',
      );
      flow.expectValue(`${role}: the plan`, '.data.next_plan', 'Hold retinoids for a week');
    }
  });

  it("leaves a check-in's activity entry out of Marketing's stream", async () => {
    const linked = '[.data[] | select(.patient_check_in_id != null)] | length';
    const doctor = as('doctor');
    await doctor.expect(
      200,
      'the doctor reads the stream',
      'GET',
      `/app/contacts/${contact}/activities?limit=100`,
    );
    doctor.expectValue('the check-in entry is there', linked, 1);
    const marketing = as('marketing');
    await marketing.expect(
      200,
      'marketing reads the stream',
      'GET',
      `/app/contacts/${contact}/activities?limit=100`,
    );
    marketing.expectValue('and not here', linked, 0);
  });

  it("hides a session's remark from a role given patient_treatment:read alone", async () => {
    await owner.expect(
      200,
      "the Accountant's codes",
      'GET',
      `${ROLES}/${fixture.roles.accountant}/permissions`,
    );
    const codes = (owner.lastBody() as { data: { permission_code: string }[] }).data.map(
      (row) => row.permission_code,
    );
    await owner.expect(
      200,
      'the Accountant reads sessions',
      'PUT',
      `${ROLES}/${fixture.roles.accountant}/permissions`,
      {
        permission_codes: [...codes, 'patient_treatment:read'],
      },
    );
    const accountant = as('accountant');
    await accountant.expect(
      200,
      'the session',
      'GET',
      `/app/patients/${patient}/treatments/${treatment}`,
    );
    accountant.expectValue('its name', '.data.name', 'Chemical peel');
    accountant.expectValue('no remark', '.data.remark', 'null');
    const doctor = as('doctor');
    await doctor.expect(
      200,
      'the session',
      'GET',
      `/app/patients/${patient}/treatments/${treatment}`,
    );
    doctor.expectValue('the remark', '.data.remark', 'Reacted to 30% glycolic');
  });

  /** The first working day (Monday–Saturday) from tomorrow, in the organization's zone. */
  function nextWorkDay(): string {
    for (let offset = 1; offset < 8; offset += 1) {
      const day = calendarDay(fixture, offset);
      if (new Date(`${day}T12:00:00Z`).getUTCDay() !== 0) return day;
    }
    throw new Error('no working day in a week');
  }

  /** A contact with an open lead and a visit on the next working day at `branch`; answers its id. */
  async function personAt(branch: 'vesu' | 'adajan', suffix: string): Promise<string> {
    await owner.expect(200, `a contact at ${branch}`, 'POST', '/app/contacts', {
      first_name: `Lead${suffix}`,
      last_name: `c${S}`,
      phones: [{ phone: `+916${S.slice(-7)}${suffix}`, is_primary: true }],
    });
    const id = owner.last('.data.id');
    await owner.expect(200, 'an open lead', 'POST', '/app/leads', {
      contact_id: id,
      branch_id: fixture.branches.vesu,
      source: 'walk_in',
    });
    const lead = owner.last('.data.id');
    await owner.expect(200, 'a visit', 'POST', '/app/appointments', {
      contact_id: id,
      branch_id: fixture.branches.vesu,
      doctor_membership_id: fixture.members.doctor.membershipPublicId,
      appointment_date: nextWorkDay(),
      start_time: `1${suffix.slice(-1)}:00`,
      duration_minutes: 15,
      service_label: 'Consultation',
    });
    const visit = owner.last('.data.id');
    if (branch === 'adajan') {
      await operatorQuery`UPDATE app.leads SET branch_id = ${fixture.branchIds.adajan} WHERE public_id = ${lead}`;
      await operatorQuery`UPDATE app.appointments SET branch_id = ${fixture.branchIds.adajan} WHERE public_id = ${visit}`;
    }
    return id;
  }

  it("B1-5: a contact's lead, file and visits follow the caller's codes and branches", async () => {
    const atVesu = await personAt('vesu', '41');
    const atAdajan = await personAt('adajan', '42');
    await owner.expect(200, 'a file at Vesu', 'POST', '/app/patients', {
      contact_id: atVesu,
      home_branch_id: fixture.branches.vesu,
    });

    await owner.expect(200, 'the owner reads Adajan', 'GET', `/app/contacts/${atAdajan}`);
    owner.expectValue('the lead', '.data.open_lead_id | type', 'string');
    owner.expectValue('the visit', '.data.next_visit_on | type', 'string');

    const frontDesk = as('front_desk');
    await frontDesk.expect(200, 'the front desk reads Vesu', 'GET', `/app/contacts/${atVesu}`);
    frontDesk.expectValue('its lead', '.data.open_lead_id | type', 'string');
    frontDesk.expectValue('its visit', '.data.next_visit_on | type', 'string');
    await frontDesk.expect(200, 'and Adajan', 'GET', `/app/contacts/${atAdajan}`);
    frontDesk.expectValue("not another branch's lead", '.data.open_lead_id', 'null');
    frontDesk.expectValue("nor another branch's visit", '.data.next_visit_on', 'null');
    await frontDesk.expect(200, 'the hover card', 'GET', `/app/contacts/${atAdajan}/preview`);
    frontDesk.expectValue('no lead on it', '.data.open_lead', 'null');
    frontDesk.expectValue('no visit on it', '.data.next_appointment', 'null');

    const accountant = as('accountant');
    await accountant.expect(200, 'the Accountant reads Vesu', 'GET', `/app/contacts/${atVesu}`);
    accountant.expectValue('no lead without lead:read', '.data.open_lead_status', 'null');
    accountant.expectValue('no visit without appointment:read', '.data.next_visit_on', 'null');
    accountant.expectValue(
      'the file number (patient:read)',
      '.data.patient_number | type',
      'number',
    );

    const marketing = as('marketing');
    await marketing.expect(200, 'Marketing lists them', 'GET', `/app/contacts?ids=${atVesu}`);
    marketing.expectValue('the lead (lead:read)', '.data[0].open_lead_id | type', 'string');
    marketing.expectValue('no visit without appointment:read', '.data[0].next_visit_on', 'null');
  });
});
