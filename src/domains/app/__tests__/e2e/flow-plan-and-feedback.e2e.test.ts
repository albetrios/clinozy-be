import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { runTaskRulesJob } from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Launch ROUTE #150 — Flow 3, treatment plan and feedback (flow-plan-and-feedback.1, PRD 3.2): a
 * Hydrafacial ×3 package is planned at the visit, the counsellor invoices it and the plan row
 * turns Invoiced (PK7); the first session asks for a next-day aftercare call and the rules run
 * opens it (TK4); its outcome Log check-in records a Worse 3/10 check-in, which shows Action needed
 * and opens a call-back for the doctor (TR4). The task rules run in-process, as one job of the
 * five-minute sweep would.
 */
describe('Flow 3 — treatment plan and feedback (launch ROUTE #150)', () => {
  const S = String(Date.now());
  const T = `p${S}`;
  const digits = `4${S.slice(-7)}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let doctor = '';
  let therapist = '';
  let tomorrow = '';
  let hydrafacial = '';
  let contact = '';

  /** One run of the task rules for the fixture organization, now. */
  async function runTaskRules(): Promise<void> {
    const organizationPublicId = fixture.organization.publicId;
    await runOrganizationScopedWorkerJob({ organizationPublicId }, (databaseHandle) =>
      runTaskRulesJob(databaseHandle, organizationPublicId),
    );
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    doctor = fixture.members.doctor.membershipPublicId;
    therapist = fixture.members.therapist.membershipPublicId;
    tomorrow = calendarDay(fixture, 1);

    flow.as('owner');
    await flow.expect(200, 'the Hydrafacial ×3 package', 'POST', '/app/offerings', {
      name: `Hydrafacial x3 ${T}`,
      category: 'package',
      sessions: 3,
      price: 7500,
    });
    hydrafacial = flow.last('.data.id');
    await flow.expect(200, 'the patient', 'POST', '/app/contacts', {
      first_name: 'Isha',
      last_name: T,
      phones: [{ phone: `+91${digits}01`, is_primary: true }],
    });
    contact = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('flow-plan-and-feedback.1: planned package → Invoiced → aftercare task → Worse 3/10 → Action needed + doctor call-back', async () => {
    flow.as('front_desk');
    await flow.expect(200, 'the visit — a walk-in, checked in', 'POST', '/app/appointments', {
      contact_id: contact,
      branch_id: vesu,
      doctor_membership_id: doctor,
      service_label: 'Consultation',
      is_walk_in: true,
    });
    const visit = flow.last('.data.id');
    const patient = flow.last('.data.patient_id');

    // 1. Appointment form → Offering suggestions → Add offering: Hydrafacial ×3, price → Planned.
    flow.as('doctor');
    const plan = `/app/patients/${patient}/offering-suggestions`;
    await flow.expect(200, 'plan the package at the visit', 'POST', plan, {
      offering_id: hydrafacial,
      appointment_id: visit,
      price: 7000,
    });
    const row = flow.last('.data.id');
    flow.expectValue(
      'planned, nothing invoiced yet',
      '[.data.status, .data.price, .data.invoiced_quantity, .data.is_fully_invoiced] | map(tostring) | join(",")',
      'planned,7000,0,false',
    );

    // 2. The counsellor creates the invoice; the plan row turns ✓ Invoiced.
    flow.as('counsellor');
    await flow.expect(200, 'invoice the plan row', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: contact,
      items: [{ offering_id: hydrafacial, quantity: 1, patient_offering_suggestion_id: row }],
    });
    flow.expectValue(
      'the line names the plan row',
      '.data.items[0].patient_offering_suggestion_id',
      row,
    );
    await flow.expect(200, 'the plan row after', 'GET', `${plan}/${row}`);
    flow.expectValue(
      'accepted and fully invoiced (PK7)',
      '[.data.status, .data.invoiced_quantity, .data.is_fully_invoiced] | map(tostring) | join(",")',
      'accepted,1,true',
    );
    await flow.expect(200, 'the bought package', 'GET', `/app/patients/${patient}/offerings`);
    const bought = flow.last(`[.data[] | select(.offering_id == "${hydrafacial}") | .id] | first`);
    flow.expectValue(
      'three sessions bought (PK4)',
      `[.data[] | select(.offering_id == "${hydrafacial}") | .sessions_total] | first`,
      3,
    );

    // 3. The first session asks for a next-day call → the aftercare task appears.
    flow.as('therapist');
    await flow.expect(
      200,
      'session 1 of the package',
      'POST',
      `/app/patients/${patient}/treatments`,
      {
        name: 'Hydrafacial',
        patient_offering_id: bought,
        appointment_id: visit,
        therapist_membership_id: therapist,
        doctor_membership_id: doctor,
        aftercare_call: 'next_day',
      },
    );
    const session = flow.last('.data.id');
    await runTaskRules();
    const aftercareTasks = `/app/tasks?scope=everyone&tab=open&rule_key=aftercare&contact_id=${contact}`;
    await flow.expect(200, 'the aftercare task', 'GET', aftercareTasks);
    flow.expectValue(
      "one call for the session, the therapist's, due tomorrow",
      `[(.data | length), .data[0].patient_treatment_id, .data[0].owner_membership_id, (.data[0].due_at | startswith("${tomorrow}"))] | map(tostring) | join(",")`,
      `1,${session},${therapist},true`,
    );
    const aftercare = flow.last('.data[0].id');

    // Outcome "Log check-in" → feel Worse, 3/10.
    await flow.expect(200, 'outcome: log check-in', 'POST', `/app/tasks/${aftercare}/resolve`, {
      outcome: 'log_check_in',
      result_text: 'Log check-in',
    });
    flow.expectValue(
      'resolved by hand',
      '[.data.status, .data.outcome, .data.is_resolved_automatically] | map(tostring) | join(",")',
      'done,log_check_in,false',
    );
    const checkIns = `/app/patients/${patient}/check-ins`;
    await flow.expect(200, 'the check-in: Worse, 3/10', 'POST', checkIns, {
      feel: 'worse',
      score: 3,
      patient_treatment_id: session,
      followed: 'partly',
    });
    const checkIn = flow.last('.data.id');
    flow.expectValue(
      'the card shows Action needed',
      '[.data.feel, .data.score, .data.needs_action] | map(tostring) | join(",")',
      'worse,3,true',
    );
    await flow.expect(200, 'Action needed', 'GET', `${checkIns}?needs_action=true`);
    flow.expectValue(
      'the check-in needs action',
      `[.data[].id] | index("${checkIn}") != null`,
      true,
    );

    // A doctor call-back task is created for the check-in.
    await flow.expect(
      200,
      'the call-back tasks',
      'GET',
      `/app/tasks?scope=everyone&tab=open&rule_key=call_back&contact_id=${contact}`,
    );
    flow.expectValue(
      "one call-back on the check-in, the doctor's",
      '[(.data | length), .data[0].patient_check_in_id, .data[0].owner_membership_id] | map(tostring) | join(",")',
      `1,${checkIn},${doctor}`,
    );
    await runTaskRules();
    await flow.expect(200, 'no aftercare task again', 'GET', aftercareTasks);
    flow.expectValue('the call was logged — none reopened', '.data | length', 0);
  });
});
