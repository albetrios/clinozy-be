import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Launch ROUTE #148 — Flow 1, an enquiry becomes a patient (flow-enquiry-to-patient.1, PRD
 * 3.2): the front desk adds a lead with a new contact, writes to them on WhatsApp, books the
 * visit from the chat, checks them in on the day — the lead moves to Clinic visited and the
 * check-in opens their patient file (A14) — and the doctor completes the visit.
 */
describe('Flow 1 — an enquiry becomes a patient (launch ROUTE #148)', () => {
  const S = String(Date.now());
  const lastName = `f${S}`;
  const digits = `8${S.slice(-7)}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let doctor = '';
  let today = '';

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

  /** "On the day": the booking moves to today's midnight — a state the rules never book into. */
  async function dueToday(appointment: string): Promise<void> {
    await operatorQuery`
      UPDATE app.appointments SET appointment_date = ${today}, start_time = '00:00'
      WHERE public_id = ${appointment}
    `;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    doctor = fixture.members.doctor.membershipPublicId;
    today = calendarDay(fixture, 0);
  });

  afterAll(async () => {
    await app.close();
  });

  it('flow-enquiry-to-patient.1: lead → chat → booked → checked in (Clinic visited, file opened) → completed', async () => {
    // 1. Leads → New lead: name, mobile, source chip, interested in → Save.
    flow.as('front_desk');
    await flow.expect(200, 'a new lead with a new contact', 'POST', '/app/leads', {
      contact: {
        first_name: 'Priya',
        last_name: lastName,
        phones: [{ phone: `+91${digits}01`, is_primary: true }],
      },
      source: 'instagram',
      interests: ['hydrafacial'],
      branch_id: vesu,
    });
    const lead = flow.last('.data.id');
    const contact = flow.last('.data.contact_id');
    flow.expectValue(
      'an open enquiry for the new contact',
      '[.data.status, .data.kind, .data.source, (.data.interests | join("|")), .data.contact.first_name, (.data.patient_id | tostring)] | join(",")',
      'new,enquiry,instagram,hydrafacial,Priya,null',
    );

    // 2. Lead drawer → chat on WhatsApp → Book appointment, prefilled with the lead's contact.
    await flow.expect(
      200,
      'a WhatsApp message from the lead drawer',
      'POST',
      `/app/contacts/${contact}/activities/send-message`,
      { type: 'whatsapp', body: 'Hi Priya, shall we book your Hydrafacial consultation?' },
    );
    await flow.expect(200, 'the chat holds it', 'GET', `/app/contacts/${contact}/activities`);
    flow.expectValue(
      'the message is on the stream',
      '[.data[] | select(.type == "whatsapp") | .body] | first',
      'Hi Priya, shall we book your Hydrafacial consultation?',
    );
    await flow.expect(200, 'book from the chat', 'POST', '/app/appointments', {
      contact_id: contact,
      branch_id: vesu,
      doctor_membership_id: doctor,
      appointment_date: workDay(1),
      start_time: '11:00',
      service_label: 'Consultation',
    });
    const appointment = flow.last('.data.id');
    flow.expectValue(
      'booked: scheduled, on the open lead, no patient file yet',
      '[.data.status, .data.lead_id, (.data.patient_id | tostring)] | join(",")',
      `scheduled,${lead},null`,
    );
    await flow.expect(200, 'the lead after the booking', 'GET', `/app/leads/${lead}`);
    flow.expectValue(
      'the booking moved the lead to Appointment scheduled (L11)',
      '.data.status',
      'appointment_scheduled',
    );

    // 3. On the day, Today shows the visit in Booked → status Checked in.
    await dueToday(appointment);
    await flow.expect(
      200,
      "Today's visits",
      'GET',
      `/app/appointments?appointment_date_from=${today}&appointment_date_to=${today}&status=scheduled,confirmed&branch_id=${vesu}`,
    );
    flow.expectValue(
      'the visit is in Booked',
      `[.data[].id] | index("${appointment}") != null`,
      true,
    );
    await flow.expect(200, 'check in', 'POST', `/app/appointments/${appointment}/check-in`);
    flow.expectValue(
      'checked in, waiting',
      '[.data.status, .data.visit_stage, (.data.checked_in_at != null)] | map(tostring) | join(",")',
      'checked_in,waiting,true',
    );
    const patient = flow.last('.data.patient_id');
    flow.expectValue(
      'the check-in opened the patient file (A14)',
      '.data.patient_id != null',
      true,
    );
    await flow.expect(200, 'the lead after the check-in', 'GET', `/app/leads/${lead}`);
    flow.expectValue(
      'the lead moved to Clinic visited, the file linked (L8)',
      '[.data.status, .data.patient_id] | join(",")',
      `clinic_visited,${patient}`,
    );

    // 4. The patient record exists — the visit can be completed.
    await flow.expect(200, 'the patient record', 'GET', `/app/patients/${patient}`);
    flow.expectValue(
      "the file is the contact's — the visit's branch and doctor",
      '[.data.contact_id, .data.home_branch_id, .data.doctor_membership_id] | join(",")',
      `${contact},${vesu},${doctor}`,
    );
    flow.as('doctor');
    await flow.expect(200, 'with the doctor', 'POST', `/app/appointments/${appointment}/stage`, {
      visit_stage: 'with_doctor',
    });
    await flow.expect(
      200,
      'complete the visit',
      'POST',
      `/app/appointments/${appointment}/complete`,
    );
    flow.expectValue(
      'completed, off the floor',
      '[.data.status, (.data.completed_at != null), (.data.visit_stage | tostring)] | map(tostring) | join(",")',
      'completed,true,null',
    );
    flow.as('front_desk');
    await flow.expect(200, 'the contact after the visit', 'GET', `/app/contacts/${contact}`);
    flow.expectValue(
      'the contact is a patient now, seen today',
      '[.data.patient_id, .data.last_visit_on] | join(",")',
      `${patient},${today}`,
    );
  });
});
