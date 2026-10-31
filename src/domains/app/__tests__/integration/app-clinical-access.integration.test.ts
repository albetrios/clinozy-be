import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  type AppFixtureRole,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Who reads a patient's clinical text, per role (B1-1): a check-in's text, the activity entry a
 * check-in writes and a session's remark go to the medical-detail readers only
 * (`patient:clinical_record:read`, `patient:update` or `patient_prescription:read`); the
 * Accountant and Marketing, who read the file's name and contact, see none of it.
 */
describe('Clinical access per role — integration (B1-1)', () => {
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
});
