import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { runTaskRulesJob } from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';
import { TASK_DONE_BY_CLINOZY } from '@/domains/app/sub-domains/tasks/tasks.constants.js';

/**
 * The unhappy paths of a clinic day (task F1, docs/reviews/launch-confidence-plan-2026-10-09.md;
 * routes-final 6.8, 7.L, 10.A.10, A5, TR7): a patient who does not come — the no-show, the rebook
 * task it opens and the new booking that closes it; a cancel that frees the slot for someone else
 * and keeps the old booking from taking it back; a package that expires half used — its sessions
 * refused, a new one billed. The refund and its credit note are `flow-refund-and-credit.e2e.test.ts`.
 */
describe('Flow — no-show, cancel and an expired package', () => {
  const S = String(Date.now());
  const T = `u${S}`;
  const digits = `3${S.slice(-7)}`;
  const REASON = '.error.reason';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let doctor = '';
  let workDays: string[] = [];

  /** One run of the task rules for the fixture organization. */
  async function runTaskRules(): Promise<void> {
    const organizationPublicId = fixture.organization.publicId;
    await runOrganizationScopedWorkerJob({
      job: { organizationPublicId },
      processor: (databaseHandle) => runTaskRulesJob({ databaseHandle, organizationPublicId }),
    });
  }

  /** A contact of this run; answers its id. */
  async function person(firstName: string, suffix: string): Promise<string> {
    flow.as('owner');
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: T,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  /** Books the contact with the doctor at Vesu; answers the booking. */
  async function book(contact: string, date: string, start: string): Promise<string> {
    flow.as('front_desk');
    await flow.expect(200, `book ${date} ${start}`, 'POST', '/app/appointments', {
      contact_id: contact,
      branch_id: vesu,
      doctor_membership_id: doctor,
      appointment_date: date,
      start_time: start,
      service_label: 'Consultation',
    });
    return flow.last('.data.id');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    doctor = fixture.members.doctor.membershipPublicId;
    const timeZone = fixture.organization.timezone;
    for (let offset = 5; workDays.length < 3 && offset < 20; offset += 1) {
      const at = new Date(Date.now() + offset * 86_400_000);
      if (new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at) !== 'Sun') {
        workDays = [...workDays, new Intl.DateTimeFormat('en-CA', { timeZone }).format(at)];
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('a no-show opens the rebook task; the new booking closes it', async () => {
    const [laterDay = ''] = workDays;
    const kavya = await person('Kavya', '01');
    const missed = await book(kavya, laterDay, '10:00');
    await flow.expect(
      409,
      'no-show before the start',
      'POST',
      `/app/appointments/${missed}/no-show`,
    );
    flow.expectValue('not due yet', REASON, 'appointment_not_due');

    // The day comes and goes: the visit was yesterday.
    await operatorQuery`
      UPDATE app.appointments SET appointment_date = ${calendarDay(fixture, -1)}
      WHERE public_id = ${missed}
    `;
    await flow.expect(200, 'mark the no-show', 'POST', `/app/appointments/${missed}/no-show`);
    flow.expectValue('no-show', '.data.status', 'no_show');
    await runTaskRules();
    const rebookTasks = `/app/tasks?scope=everyone&tab=open&rule_key=rebook&contact_id=${kavya}`;
    await flow.expect(200, 'the rebook task', 'GET', rebookTasks);
    flow.expectValue(
      'one, on the missed visit, for the front desk',
      '[(.data | length), .data[0].appointment_id, .data[0].owner_role] | map(tostring) | join(",")',
      `1,${missed},front_desk`,
    );
    const rebookTask = flow.last('.data[0].id');

    await book(kavya, laterDay, '11:00');
    await runTaskRules();
    await flow.expect(200, 'the rebook task', 'GET', `/app/tasks/${rebookTask}`);
    flow.expectValue(
      'rebooked — closed by the app',
      '[.data.status, .data.result_text] | join(",")',
      `done,${TASK_DONE_BY_CLINOZY}`,
    );
  });

  it('a cancel frees the slot for someone else; the cancelled booking cannot take it back', async () => {
    const [, cancelDay = ''] = workDays;
    const leela = await person('Leela', '02');
    const meher = await person('Meher', '03');
    const cancelled = await book(leela, cancelDay, '12:00');
    flow.as('front_desk');
    await flow.expect(200, 'Leela cancels', 'POST', `/app/appointments/${cancelled}/cancel`, {
      cancel_reason: 'patient_asked',
      cancel_note: 'Travelling',
    });
    flow.expectValue(
      'cancelled with why',
      '[.data.status, .data.cancel_reason] | join(",")',
      'cancelled,patient_asked',
    );
    const meherBooking = await book(meher, cancelDay, '12:00');
    expect(meherBooking, 'Meher takes the freed slot').not.toBe('');
    await flow.expect(
      409,
      "reinstate Leela's booking over Meher's",
      'POST',
      `/app/appointments/${cancelled}/reinstate`,
    );
    flow.expectValue('the slot is taken', REASON, 'slot_taken');
    await flow.expect(
      200,
      "the day's slots",
      'GET',
      `/app/appointments?appointment_date_from=${cancelDay}&appointment_date_to=${cancelDay}&branch_id=${vesu}&limit=100`,
    );
    flow.expectValue(
      'the day holds Meher, scheduled, and Leela, cancelled',
      `[.data[] | select(.id == "${meherBooking}" or .id == "${cancelled}") | .status] | sort | join(",")`,
      'cancelled,scheduled',
    );
  });

  it('a package that expires half used: its sessions are refused, a new one is billed', async () => {
    flow.as('owner');
    await flow.expect(200, 'a six-session package, 90 days', 'POST', '/app/offerings', {
      name: `Peel pack ${T}`,
      category: 'package',
      price: 9000,
      sessions: 6,
      validity_days: 90,
    });
    const pack = flow.last('.data.id');
    const nisha = await person('Nisha', '04');
    await flow.expect(200, "Nisha's file", 'POST', '/app/patients', {
      contact_id: nisha,
      home_branch_id: vesu,
    });
    const patient = flow.last('.data.id');
    await flow.expect(200, 'bill the package', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: nisha,
      items: [{ offering_id: pack, quantity: 1 }],
    });
    await flow.expect(200, 'what she bought', 'GET', `/app/patients/${patient}/offerings`);
    const bought = flow.last(`[.data[] | select(.offering_id == "${pack}") | .id] | first`);
    const treatments = `/app/patients/${patient}/treatments`;
    flow.as('therapist');
    for (let session = 1; session <= 3; session += 1) {
      await flow.expect(200, `session ${session}`, 'POST', treatments, {
        name: 'Chemical peel',
        patient_offering_id: bought,
        therapist_membership_id: fixture.members.therapist.membershipPublicId,
        aftercare_call: 'none',
      });
    }
    flow.expectValue('the third session', '.data.session_number', 3);

    // Ninety days pass: the package ended yesterday.
    await operatorQuery`
      UPDATE app.patient_offerings SET valid_until = ${calendarDay(fixture, -1)}
      WHERE public_id = ${bought}
    `;
    flow.as('front_desk');
    await flow.expect(
      200,
      'her packages',
      'GET',
      `/app/patients/${patient}/offerings?is_package=true`,
    );
    flow.expectValue(
      'expired, three sessions left unused',
      `[.data[] | select(.id == "${bought}") | .status, .sessions_left] | map(tostring) | join(",")`,
      'expired,3',
    );
    await flow.expect(
      200,
      'the expired tab',
      'GET',
      `/app/patients/${patient}/offerings?status=expired`,
    );
    flow.expectValue('it is there', `[.data[].id] | index("${bought}") != null`, true);
    flow.as('therapist');
    await flow.expect(409, 'a fourth session on it', 'POST', treatments, {
      name: 'Chemical peel',
      patient_offering_id: bought,
      aftercare_call: 'none',
    });
    flow.expectValue('expired', REASON, 'offering_expired');

    flow.as('owner');
    await flow.expect(200, 'a new package billed', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: nisha,
      items: [{ offering_id: pack, quantity: 1 }],
    });
    await flow.expect(
      200,
      'her packages',
      'GET',
      `/app/patients/${patient}/offerings?status=active`,
    );
    const fresh = flow.last(`[.data[] | select(.offering_id == "${pack}") | .id] | first`);
    expect(fresh, 'a new one, not the expired one').not.toBe(bought);
    flow.as('therapist');
    await flow.expect(200, 'the next session on the new one', 'POST', treatments, {
      name: 'Chemical peel',
      patient_offering_id: fresh,
      aftercare_call: 'none',
    });
    flow.expectValue('session 1 of the new package', '.data.session_number', 1);
  });
});
