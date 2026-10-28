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

/**
 * L11: a lead follows the person's bookings — a booking still to happen moves the open lead to
 * `appointment_scheduled`; a reschedule keeps it there; the end of the last booking (a cancel, a
 * no-show, a removal) moves it back to `follow_up`, dated now, with a `system` line in the stream;
 * a check-in still ends it in `clinic_visited`. By hand the status is the booking's: neither set
 * nor left for another working status while a booking is still to happen — a closing one is fine.
 */
describe('Appointments — the lead follows the bookings (L11)', () => {
  const S = String(Date.now());
  const digits = `7${S.slice(-7)}`;
  const lastName = `b${S}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let organizationPublicId = '';
  let vesu = '';
  let doctor = '';
  let today = '';
  let people = 0;

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

  /** A new person with an open lead in `follow_up`; answers the contact and the lead. */
  async function personWithLead(firstName: string): Promise<{ contact: string; lead: string }> {
    people += 1;
    await flow.expect(200, `a lead for ${firstName}`, 'POST', '/app/leads', {
      contact: {
        first_name: firstName,
        last_name: lastName,
        phones: [{ phone: `+91${digits}${String(people).padStart(2, '0')}`, is_primary: true }],
      },
      source: 'instagram',
      interests: ['hydrafacial'],
      status: 'follow_up',
    });
    return { contact: flow.last('.data.contact_id'), lead: flow.last('.data.id') };
  }

  /** Books the person `from` working days ahead at `start`; answers the appointment. */
  async function book(contact: string, start: string, from = 2): Promise<string> {
    await flow.expect(200, `a booking at ${start}`, 'POST', '/app/appointments', {
      contact_id: contact,
      branch_id: vesu,
      doctor_membership_id: doctor,
      appointment_date: workDay(from),
      start_time: start,
      service_label: 'Consultation',
    });
    return flow.last('.data.id');
  }

  /** The lead's status as the API answers it. */
  async function leadStatus(lead: string): Promise<string> {
    await flow.expect(200, `lead ${lead}`, 'GET', `/app/leads/${lead}`);
    return flow.last('.data.status');
  }

  /** The `system` lines on the person's stream, oldest first. */
  async function systemLines(contact: string): Promise<string[]> {
    const rows = await operatorQuery<{ body: string }[]>`
      SELECT activity.body FROM app.contact_activities activity
      JOIN app.contacts contact ON contact.id = activity.contact_id
      WHERE contact.public_id = ${contact} AND activity.type = 'system'
      ORDER BY activity.id
    `;
    return rows.map((row) => row.body);
  }

  /**
   * "On the day": the booking moves to `start` past midnight today — a state the rules never book
   * into; each case takes its own start, so one case's booking never holds another's slot.
   */
  async function dueToday(appointment: string, start: string): Promise<void> {
    await operatorQuery`
      UPDATE app.appointments SET appointment_date = ${today}, start_time = ${start}
      WHERE public_id = ${appointment}
    `;
  }

  /** The lead's open `follow_up` rule tasks. */
  async function openFollowUpTasks(lead: string): Promise<number> {
    const rows = await operatorQuery<{ count: string }[]>`
      SELECT count(*)::text AS count FROM app.tasks task
      JOIN app.leads lead ON lead.id = task.lead_id
      WHERE lead.public_id = ${lead} AND task.rule_key = 'follow_up' AND task.status = 'open'
    `;
    return Number(rows[0]?.count ?? 0);
  }

  /** The organization's rules run (TK4), as the worker runs it. */
  function runRules() {
    return runOrganizationScopedWorkerJob({
      job: { organizationPublicId },
      processor: (handle) => runTaskRulesJob({ databaseHandle: handle, organizationPublicId }),
    });
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    flow.as('front_desk');
    organizationPublicId = fixture.organization.publicId;
    vesu = fixture.branches.vesu;
    doctor = fixture.members.doctor.membershipPublicId;
    today = calendarDay(fixture, 0);
  });

  afterAll(async () => {
    await app.close();
  });

  it('a booking moves the lead to Appointment scheduled; a reschedule keeps it there', async () => {
    const { contact, lead } = await personWithLead('Asha');
    const appointment = await book(contact, '10:00');
    expect(await leadStatus(lead)).toBe('appointment_scheduled');
    expect(await systemLines(contact)).toEqual(['Moved to Appointment scheduled at booking']);

    await flow.expect(200, 'reschedule', 'PATCH', `/app/appointments/${appointment}`, {
      start_time: '11:00',
    });
    expect(await leadStatus(lead)).toBe('appointment_scheduled');
    await flow.expect(200, 'confirm', 'POST', `/app/appointments/${appointment}/confirm`);
    expect(await leadStatus(lead)).toBe('appointment_scheduled');
    expect(await systemLines(contact)).toHaveLength(1);
  });

  it('the last booking cancelled moves the lead back to Follow-up, dated now; a reinstate books it again', async () => {
    const { contact, lead } = await personWithLead('Bina');
    const first = await book(contact, '10:00');
    const second = await book(contact, '12:00', 3);

    await flow.expect(200, 'cancel one', 'POST', `/app/appointments/${first}/cancel`, {
      cancel_reason: 'patient_asked',
    });
    expect(await leadStatus(lead), 'another booking is still to happen').toBe(
      'appointment_scheduled',
    );

    const before = Date.now();
    await flow.expect(200, 'cancel the last', 'POST', `/app/appointments/${second}/cancel`, {
      cancel_reason: 'rescheduling_later',
    });
    await flow.expect(200, 'the lead', 'GET', `/app/leads/${lead}`);
    expect(flow.last('.data.status')).toBe('follow_up');
    expect(Date.parse(flow.last('.data.follow_up_at'))).toBeGreaterThanOrEqual(before - 5_000);
    expect((await systemLines(contact)).at(-1)).toBe(
      'Moved back to Follow-up: the appointment was cancelled',
    );

    await flow.expect(200, 'reinstate', 'POST', `/app/appointments/${second}/reinstate`);
    expect(await leadStatus(lead)).toBe('appointment_scheduled');
  });

  it('a no-show and a removed booking move the lead back to Follow-up', async () => {
    const missed = await personWithLead('Chitra');
    const missedVisit = await book(missed.contact, '10:00');
    await dueToday(missedVisit, '00:00');
    await flow.expect(200, 'no-show', 'POST', `/app/appointments/${missedVisit}/no-show`);
    expect(await leadStatus(missed.lead)).toBe('follow_up');
    expect((await systemLines(missed.contact)).at(-1)).toBe(
      'Moved back to Follow-up: they did not come to the appointment',
    );

    flow.as('owner');
    const removed = await personWithLead('Divya');
    const removedVisit = await book(removed.contact, '14:00');
    await flow.expect(
      204,
      'remove the booking',
      'DELETE',
      `/app/appointments/${removedVisit}?reason=mistake`,
    );
    expect(await leadStatus(removed.lead)).toBe('follow_up');
    expect((await systemLines(removed.contact)).at(-1)).toBe(
      'Moved back to Follow-up: the appointment was removed',
    );
    await flow.expect(
      200,
      'restore the booking',
      'POST',
      `/app/appointments/${removedVisit}/restore`,
    );
    expect(await leadStatus(removed.lead)).toBe('appointment_scheduled');
    flow.as('front_desk');
  });

  it('a check-in ends the booked lead in Clinic visited', async () => {
    const { contact, lead } = await personWithLead('Esha');
    const appointment = await book(contact, '10:00');
    await dueToday(appointment, '00:30');
    await flow.expect(200, 'check in', 'POST', `/app/appointments/${appointment}/check-in`);
    expect(await leadStatus(lead)).toBe('clinic_visited');
    expect((await systemLines(contact)).at(-1)).toBe('Moved to Clinic visited at check-in');
  });

  it('by hand the status is the booking’s: never set, left only for a closing status', async () => {
    const { contact, lead } = await personWithLead('Farah');
    await flow.expect(409, 'set by hand', 'PATCH', `/app/leads/${lead}`, {
      status: 'appointment_scheduled',
    });
    expect(flow.last('.error.reason')).toBe('lead_status_by_booking');
    people += 1;
    await flow.expect(409, 'created in it', 'POST', '/app/leads', {
      contact: {
        first_name: 'Gita',
        last_name: lastName,
        phones: [{ phone: `+91${digits}${String(people).padStart(2, '0')}`, is_primary: true }],
      },
      status: 'appointment_scheduled',
    });
    expect(flow.last('.error.reason')).toBe('lead_status_by_booking');

    await book(contact, '15:00');
    await flow.expect(409, 'back to working it', 'PATCH', `/app/leads/${lead}`, {
      status: 'contacted',
    });
    expect(flow.last('.error.reason')).toBe('lead_status_by_booking');
    await flow.expect(409, 'no response', 'PATCH', `/app/leads/${lead}`, {
      status: 'no_response',
    });

    await flow.expect(200, 'closed as lost', 'PATCH', `/app/leads/${lead}`, { status: 'lost' });
    expect(flow.last('.data.status')).toBe('lost');
    await flow.expect(200, 'reopened', 'PATCH', `/app/leads/${lead}`, { status: 'follow_up' });
    expect(flow.last('.data.status'), 'reopened while still booked').toBe('appointment_scheduled');
    await flow.expect(200, 'the read agrees', 'GET', `/app/leads/${lead}`);
    expect(flow.last('.data.status')).toBe('appointment_scheduled');
  });

  it('a lead created for a booked person starts in Appointment scheduled', async () => {
    people += 1;
    await flow.expect(200, 'a contact', 'POST', '/app/contacts', {
      first_name: 'Hema',
      last_name: lastName,
      phones: [{ phone: `+91${digits}${String(people).padStart(2, '0')}`, is_primary: true }],
    });
    const contact = flow.last('.data.id');
    await book(contact, '16:00');
    await flow.expect(200, 'a lead for the booked person', 'POST', '/app/leads', {
      contact_id: contact,
      source: 'walk_in',
    });
    expect(flow.last('.data.status')).toBe('appointment_scheduled');
  });

  it('the follow-up task waits while the visit is booked and opens once it is cancelled', async () => {
    const { contact, lead } = await personWithLead('Indu');
    await flow.expect(200, 'follow up today', 'PATCH', `/app/leads/${lead}`, {
      follow_up_at: new Date(Date.now() - 60_000).toISOString(),
    });
    await runRules();
    expect(await openFollowUpTasks(lead)).toBe(1);

    const appointment = await book(contact, '17:00');
    await runRules();
    expect(await openFollowUpTasks(lead), 'booked: the visit follows it up').toBe(0);

    await flow.expect(200, 'cancel', 'POST', `/app/appointments/${appointment}/cancel`, {
      cancel_reason: 'patient_asked',
    });
    await runRules();
    expect(await openFollowUpTasks(lead), 'cancelled: follow up again').toBe(1);
  });
});
