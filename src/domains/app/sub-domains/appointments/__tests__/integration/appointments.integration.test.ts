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
 * Sub-domain 6, Appointments (routes-final §6, launch ROUTE #132): booking and walk-ins, the slot
 * rules and the exclusion constraints, the list (and the floor), moves, the lifecycle and the
 * floor stage, the check-in conversion, copy, delete and restore, the calendar reads, the export,
 * what the contact reads, the gates by role — one flow over the fixture organization (the launch's
 * curl checks, `tooling/dev/live-api/checks/appointments.checks.sh`).
 */
describe('Appointments — integration (routes-final §6)', () => {
  const S = String(Date.now());
  /** This run's last name — `q=${lastName}` lists only this run's appointments. */
  const lastName = `w${S}`;
  const digits = `6${S.slice(-7)}`;
  const NOWHERE_APPOINTMENT = 'appt_aaaaaaaaaaaaaaaaaaaaa';
  const NOWHERE_CONTACT = 'con_aaaaaaaaaaaaaaaaaaaaa';
  const FIELDS = '[.error.errors[].field] | join(",")';
  const NAMES = '[.data[].contact.first_name] | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let adajan = '';
  let admin = '';
  let doctor = '';

  let day = '';
  let laterDay = '';
  let holiday = '';
  let sunday = '';
  let today = '';
  let yesterday = '';

  let asha = '';
  let bela = '';
  let chirag = '';
  let ashaLead = '';
  let room = '';
  let adajanRoom = '';
  let machine = '';
  let offering = '';
  let ashaAppointment = '';
  let ashaNumber = '';
  let belaAppointment = '';
  let chiragAppointment = '';
  let belaWalkIn = '';
  let ashaPatient = '';
  let copy = '';

  /**
   * `count` dates from today + `from` whose weekday is a working one (`work`, Monday–Saturday)
   * or a Sunday (`sunday`), in the organization's time zone.
   */
  function days(kind: 'work' | 'sunday', from: number, count: number): string[] {
    const timeZone = fixture.organization.timezone;
    const found: string[] = [];
    for (let offset = from; found.length < count && offset < from + 60; offset += 1) {
      const at = new Date(Date.now() + offset * 86_400_000);
      const isSunday =
        new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at) === 'Sun';
      if ((kind === 'sunday') === isSunday) {
        found.push(new Intl.DateTimeFormat('en-CA', { timeZone }).format(at));
      }
    }
    return found;
  }

  /** A contact of this run with its own number. */
  async function person(firstName: string, suffix: string): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  /** A booking body at Vesu with the doctor; `drop` leaves keys out. */
  function booking(
    contact: string,
    date: string,
    start: string,
    extra: Record<string, unknown> = {},
    drop: readonly string[] = [],
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      contact_id: contact,
      branch_id: vesu,
      doctor_membership_id: doctor,
      appointment_date: date,
      start_time: start,
      service_label: 'Consultation',
      ...extra,
    };
    for (const key of drop) delete body[key];
    return body;
  }

  /** A walk-in body: no date and no start. */
  const walkIn = (contact: string) =>
    booking(contact, day, '10:00', { is_walk_in: true }, ['appointment_date', 'start_time']);

  /** Moves a booking to today's midnight — a state the rules never book into. */
  async function dueToday(appointment: string): Promise<void> {
    await getOperatorSql()`
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
    adajan = fixture.branches.adajan;
    admin = fixture.members.admin.membershipPublicId;
    doctor = fixture.members.doctor.membershipPublicId;
    [day = '', laterDay = '', holiday = ''] = days('work', 2, 3);
    [sunday = ''] = days('sunday', 2, 1);
    today = calendarDay(fixture, 0);
    yesterday = calendarDay(fixture, -1);

    flow.as('owner');
    asha = await person('Asha', '01');
    bela = await person('Bela', '02');
    chirag = await person('Chirag', '03');
    await flow.expect(200, "Asha's lead", 'POST', '/app/leads', {
      contact_id: asha,
      interests: ['lhr'],
    });
    ashaLead = flow.last('.data.id');
    await flow.expect(200, 'room Vesu', 'POST', `/app/branches/${vesu}/rooms`, {
      name: `Room ${lastName}`,
    });
    room = flow.last('.data.id');
    await flow.expect(200, 'room Adajan', 'POST', `/app/branches/${adajan}/rooms`, {
      name: `Room ${lastName}`,
    });
    adajanRoom = flow.last('.data.id');
    await flow.expect(200, 'machine Vesu', 'POST', `/app/branches/${vesu}/machines`, {
      name: `Laser ${lastName}`,
    });
    machine = flow.last('.data.id');
    await flow.expect(200, 'a holiday at Vesu', 'POST', `/app/branches/${vesu}/holidays`, {
      holiday_date: holiday,
      label: `Festival ${lastName}`,
    });
    await flow.expect(200, 'an offering', 'POST', '/app/offerings', {
      name: `Hydrafacial ${lastName}`,
      price: 2500,
    });
    offering = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('book (route 5)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'book Asha with an offering (label from it)',
      'POST',
      '/app/appointments',
      booking(asha, day, '10:00', { offering_id: offering }, ['service_label']),
    );
    ashaAppointment = flow.last('.data.id');
    ashaNumber = flow.last('.data.appointment_number');
    flow.expectValue(
      'label from the offering (A13)',
      '.data.service_label',
      `Hydrafacial ${lastName}`,
    );
    flow.expectValue(
      'scheduled, 30 minutes, ends 10:30',
      '[.data.status, .data.duration_minutes, .data.end_time] | map(tostring) | join(",")',
      'scheduled,30,10:30',
    );
    flow.expectValue(
      'the contact summary and the open lead (A1)',
      '[.data.contact.first_name, .data.lead_id, (.data.patient_id | tostring)] | join(",")',
      `Asha,${ashaLead},null`,
    );
    flow.expectValue(
      'off the floor',
      '[.data.visit_stage, .data.checked_in_at] | map(tostring) | join(",")',
      'null,null',
    );
    await flow.expect(
      422,
      'book without X-Idempotency-Key',
      'POST',
      '/app/appointments',
      booking(bela, day, '15:00'),
      { idempotencyKey: false },
    );
    await flow.expect(
      400,
      'a booking without a date',
      'POST',
      '/app/appointments',
      booking(bela, day, '15:00', {}, ['appointment_date']),
    );
    flow.expectValue('no date: field', FIELDS, 'body.appointment_date');
    await flow.expect(
      400,
      'a walk-in with a date',
      'POST',
      '/app/appointments',
      booking(bela, day, '15:00', { is_walk_in: true }, ['start_time']),
    );
    flow.expectValue('walk-in with a date: field', FIELDS, 'body.appointment_date');
    await flow.expect(
      400,
      '33 minutes (A13)',
      'POST',
      '/app/appointments',
      booking(bela, day, '15:00', { duration_minutes: 33 }),
    );
    flow.expectValue('duration: field', FIELDS, 'body.duration_minutes');
    await flow.expect(
      400,
      'no label and no offering',
      'POST',
      '/app/appointments',
      booking(bela, day, '15:00', {}, ['service_label']),
    );
    flow.expectValue('no label: field', FIELDS, 'service_label');
    await flow.expect(
      400,
      'a room of another branch (A2)',
      'POST',
      '/app/appointments',
      booking(bela, day, '15:00', { branch_room_id: adajanRoom }),
    );
    flow.expectValue('other branch room: field', FIELDS, 'branch_room_id');
    await flow.expect(
      400,
      'an unknown contact',
      'POST',
      '/app/appointments',
      booking(NOWHERE_CONTACT, day, '15:00'),
    );
    flow.expectValue('unknown contact: field', FIELDS, 'contact_id');
    await flow.expect(
      400,
      'patient_id is gone (A1)',
      'POST',
      '/app/appointments',
      booking(bela, day, '15:00', { patient_id: 'pat_aaaaaaaaaaaaaaaaaaaaa' }),
    );
    await flow.expect(
      409,
      'the doctor is booked then (A3)',
      'POST',
      '/app/appointments',
      booking(bela, day, '10:15'),
    );
    flow.expectValue('doctor clash: reason', '.error.reason', 'slot_taken');
    flow.expectValue('doctor clash: names the doctor', '.error.detail | test("doctor")', true);
    await flow.expect(
      200,
      'Bela right after (half-open ranges)',
      'POST',
      '/app/appointments',
      booking(bela, day, '10:30', { branch_room_id: room }),
    );
    belaAppointment = flow.last('.data.id');
    await flow.expect(
      409,
      'the room is booked then',
      'POST',
      '/app/appointments',
      booking(chirag, day, '10:45', { branch_room_id: room, doctor_membership_id: admin }),
    );
    flow.expectValue(
      'room clash: names the room',
      '[.error.reason, (.error.detail | test("room"))] | map(tostring) | join(",")',
      'slot_taken,true',
    );
    await flow.expect(
      200,
      'Chirag on the machine',
      'POST',
      '/app/appointments',
      booking(chirag, day, '12:00', {
        branch_machine_id: machine,
        doctor_membership_id: admin,
        duration_minutes: 60,
      }),
    );
    chiragAppointment = flow.last('.data.id');
    await flow.expect(
      409,
      'the machine is booked then',
      'POST',
      '/app/appointments',
      booking(bela, day, '12:30', { branch_machine_id: machine }),
    );
    flow.expectValue('machine clash: names the machine', '.error.detail | test("machine")', true);
    await flow.expect(
      409,
      'a past start',
      'POST',
      '/app/appointments',
      booking(bela, yesterday, '11:00'),
    );
    flow.expectValue('past: reason', '.error.reason', 'slot_in_past');
    await flow.expect(
      409,
      "a Sunday (the branch's closed day)",
      'POST',
      '/app/appointments',
      booking(bela, sunday, '11:00'),
    );
    flow.expectValue(
      'closed day: reason and why',
      '[.error.reason, (.error.detail | test("closed_day"))] | map(tostring) | join(",")',
      'slot_closed,true',
    );
    await flow.expect(
      409,
      'a holiday',
      'POST',
      '/app/appointments',
      booking(bela, holiday, '11:00'),
    );
    flow.expectValue('holiday: why', '.error.detail | test("holiday")', true);
    await flow.expect(
      409,
      'after the branch closes',
      'POST',
      '/app/appointments',
      booking(bela, day, '19:45'),
    );
    flow.expectValue('outside hours: reason', '.error.reason', 'slot_outside_hours');
    await flow.expect(
      409,
      "after the doctor's hours (A4)",
      'POST',
      '/app/appointments',
      booking(bela, day, '19:00'),
    );
    flow.expectValue(
      "doctor's hours: why",
      '[.error.reason, (.error.detail | test("doctor_off"))] | map(tostring) | join(",")',
      'slot_closed,true',
    );
    await flow.expect(200, 'Chirag walks in (A6)', 'POST', '/app/appointments', walkIn(chirag));
    flow.expectValue(
      'walk-in: today, checked in, waiting',
      '[.data.appointment_date, .data.status, .data.visit_stage, .data.is_walk_in] | map(tostring) | join(",")',
      `${today},checked_in,waiting,true`,
    );
    flow.expectValue('walk-in: the visit started', '.data.checked_in_at != null', true);
    await flow.expect(
      200,
      'a second walk-in with the same doctor (no clash)',
      'POST',
      '/app/appointments',
      walkIn(bela),
    );
    belaWalkIn = flow.last('.data.id');
    await flow.expect(200, 'Chirag after the walk-in', 'GET', `/app/contacts/${chirag}`);
    flow.expectValue('a walk-in opens the patient file (A14)', '.data.patient_id != null', true);
    flow.expectValue('Chirag has no lead to move', '.data.open_lead_id', 'null');
  });

  it('list (route 1) and the floor', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      "this run's appointments (day view)",
      'GET',
      `/app/appointments?q=${lastName}&status=scheduled,confirmed`,
    );
    flow.expectValue('date, then start', NAMES, 'Asha,Bela,Chirag');
    await flow.expect(
      200,
      'the floor (checked in)',
      'GET',
      `/app/appointments?q=${lastName}&status=checked_in&sort=visit_stage_changed_at`,
    );
    flow.expectValue('the floor: the walk-ins', '.data | length', 2);
    await flow.expect(
      200,
      'visit_stage filter',
      'GET',
      `/app/appointments?q=${lastName}&visit_stage=waiting,with_doctor`,
    );
    flow.expectValue('waiting', '.data | length', 2);
    await flow.expect(200, 'is_walk_in', 'GET', `/app/appointments?q=${lastName}&is_walk_in=false`);
    flow.expectValue('not walk-ins', '.data | length', 3);
    await flow.expect(200, 'q: #number', 'GET', `/app/appointments?q=%23${ashaNumber}`);
    flow.expectValue("#number: Asha's", '[.data[].id] | join(",")', ashaAppointment);
    await flow.expect(
      200,
      'q: the service',
      'GET',
      `/app/appointments?q=Hydrafacial%20${lastName}`,
    );
    flow.expectValue("service: Asha's", '[.data[].id] | join(",")', ashaAppointment);
    await flow.expect(
      200,
      "q: Bela's number",
      'GET',
      `/app/appointments?q=${digits}02&is_walk_in=false`,
    );
    flow.expectValue("number: Bela's", NAMES, 'Bela');
    await flow.expect(200, 'contact_id', 'GET', `/app/appointments?contact_id=${chirag}`);
    flow.expectValue("contact: Chirag's two", '.data | length', 2);
    await flow.expect(200, 'room filter', 'GET', `/app/appointments?branch_room_id=${room}`);
    flow.expectValue("room: Bela's", NAMES, 'Bela');
    await flow.expect(
      200,
      'machine filter',
      'GET',
      `/app/appointments?branch_machine_id=${machine}`,
    );
    flow.expectValue("machine: Chirag's", NAMES, 'Chirag');
    await flow.expect(200, 'offering filter', 'GET', `/app/appointments?offering_id=${offering}`);
    flow.expectValue("offering: Asha's", NAMES, 'Asha');
    await flow.expect(
      200,
      'doctor filter, one day (inclusive, A8)',
      'GET',
      `/app/appointments?q=${lastName}&doctor_membership_id=${doctor}&appointment_date_from=${day}&appointment_date_to=${day}`,
    );
    flow.expectValue("the doctor's day", NAMES, 'Asha,Bela');
    await flow.expect(
      200,
      'created_at, newest first',
      'GET',
      `/app/appointments?q=${lastName}&sort=created_at`,
    );
    flow.expectValue('newest first', '.data[0].id', belaWalkIn);
    await flow.expect(400, 'status: an unknown one', 'GET', '/app/appointments?status=done');
    await flow.expect(
      400,
      'patient_id filter is gone',
      'GET',
      '/app/appointments?patient_id=pat_aaaaaaaaaaaaaaaaaaaaa',
    );
    await flow.expect(
      404,
      'get an unknown appointment',
      'GET',
      `/app/appointments/${NOWHERE_APPOINTMENT}`,
    );
    await flow.expect(200, "get Asha's", 'GET', `/app/appointments/${ashaAppointment}`);
  });

  it('change and move (route 7)', async () => {
    flow.as('owner');
    await flow.call('GET', `/app/appointments/${ashaAppointment}`);
    const updatedAt = flow.last('.data.updated_at');
    await flow.expect(
      200,
      'notes only — no slot check',
      'PATCH',
      `/app/appointments/${ashaAppointment}`,
      { notes: 'First visit' },
    );
    await flow.expect(409, 'a stale save (D43)', 'PATCH', `/app/appointments/${ashaAppointment}`, {
      notes: 'x',
      expected_updated_at: updatedAt,
    });
    flow.expectValue('stale: reason', '.error.reason', 'record_changed');
    await flow.expect(
      200,
      'confirm Asha (A5)',
      'POST',
      `/app/appointments/${ashaAppointment}/confirm`,
    );
    flow.expectValue('confirmed', '.data.status', 'confirmed');
    await flow.expect(409, 'confirm again', 'POST', `/app/appointments/${ashaAppointment}/confirm`);
    flow.expectValue('confirm twice: reason', '.error.reason', 'transition_not_allowed');
    await flow.expect(200, 'move Asha to 11:00', 'PATCH', `/app/appointments/${ashaAppointment}`, {
      start_time: '11:00',
    });
    flow.expectValue(
      'moved: back to scheduled, counted, stamped',
      '[.data.status, .data.move_count, (.data.rescheduled_from != null), .data.end_time] | map(tostring) | join(",")',
      'scheduled,1,true,11:30',
    );
    await flow.expect(
      409,
      "move into Bela's room",
      'PATCH',
      `/app/appointments/${ashaAppointment}`,
      { start_time: '10:30', branch_room_id: room },
    );
    flow.expectValue('move clash: reason', '.error.reason', 'slot_taken');
    await flow.expect(
      400,
      'move with a 7-minute length',
      'PATCH',
      `/app/appointments/${ashaAppointment}`,
      { duration_minutes: 7 },
    );
    await flow.expect(400, 'change the contact', 'PATCH', `/app/appointments/${ashaAppointment}`, {
      contact_id: bela,
    });
    await flow.expect(400, 'PATCH nothing', 'PATCH', `/app/appointments/${ashaAppointment}`, {});
    await flow.expect(
      409,
      'check in a booking of a later day',
      'POST',
      `/app/appointments/${ashaAppointment}/check-in`,
    );
    flow.expectValue('not due: reason', '.error.reason', 'appointment_not_due');
    await flow.expect(
      409,
      'no-show before the start',
      'POST',
      `/app/appointments/${ashaAppointment}/no-show`,
    );
    flow.expectValue('no-show early: reason', '.error.reason', 'appointment_not_due');
    await flow.expect(
      409,
      'complete a scheduled booking',
      'POST',
      `/app/appointments/${ashaAppointment}/complete`,
    );
  });

  it('cancel, reinstate (routes 14, 15)', async () => {
    flow.as('owner');
    await flow.expect(
      400,
      'cancel without a reason',
      'POST',
      `/app/appointments/${belaAppointment}/cancel`,
      {},
    );
    await flow.expect(200, 'cancel Bela', 'POST', `/app/appointments/${belaAppointment}/cancel`, {
      cancel_reason: 'patient_asked',
      cancel_note: 'Travelling',
    });
    flow.expectValue(
      'cancelled with why',
      '[.data.status, .data.cancel_reason] | join(",")',
      'cancelled,patient_asked',
    );
    await flow.expect(
      409,
      'move a cancelled booking',
      'PATCH',
      `/app/appointments/${belaAppointment}`,
      { start_time: '16:00' },
    );
    flow.expectValue('not movable: reason', '.error.reason', 'appointment_not_movable');
    await flow.expect(
      200,
      'her slot is free (cancelled frees it)',
      'POST',
      '/app/appointments',
      booking(chirag, day, '10:30', { branch_room_id: room }),
    );
    const taker = flow.last('.data.id');
    await flow.expect(
      409,
      'reinstate over the taker',
      'POST',
      `/app/appointments/${belaAppointment}/reinstate`,
    );
    flow.expectValue('reinstate clash: reason', '.error.reason', 'slot_taken');
    await flow.expect(
      204,
      'delete the taker',
      'DELETE',
      `/app/appointments/${taker}?reason=mistake`,
    );
    await flow.expect(
      200,
      'reinstate Bela',
      'POST',
      `/app/appointments/${belaAppointment}/reinstate`,
    );
    flow.expectValue(
      'reinstated',
      '[.data.status, (.data.cancel_reason | tostring)] | join(",")',
      'scheduled,null',
    );
    await flow.expect(
      409,
      'reinstate a scheduled booking',
      'POST',
      `/app/appointments/${belaAppointment}/reinstate`,
    );
  });

  it('check-in, the floor, complete (routes 11, 12, 16, 18–20)', async () => {
    flow.as('owner');
    await dueToday(ashaAppointment);
    await flow.expect(
      200,
      'check Asha in',
      'POST',
      `/app/appointments/${ashaAppointment}/check-in`,
    );
    flow.expectValue(
      'checked in at waiting',
      '[.data.status, .data.visit_stage, (.data.checked_in_at != null)] | map(tostring) | join(",")',
      'checked_in,waiting,true',
    );
    flow.expectValue('the check-in opened her file (A14)', '.data.patient_id != null', true);
    ashaPatient = flow.last('.data.patient_id');
    flow.expectValue('her lead is no longer open', '.data.lead_id', 'null');
    await flow.expect(200, "Asha's lead after the check-in", 'GET', `/app/leads/${ashaLead}`);
    flow.expectValue(
      'lead: clinic_visited, the file linked (L8)',
      '[.data.status, .data.patient_id] | join(",")',
      `clinic_visited,${ashaPatient}`,
    );
    await flow.expect(200, "Asha's stream", 'GET', `/app/contacts/${asha}/activities?type=system`);
    flow.expectValue(
      'a system line for the move',
      '.data[-1].body',
      'Moved to Clinic visited at check-in',
    );
    await flow.expect(200, "Asha's contact", 'GET', `/app/contacts/${asha}`);
    flow.expectValue(
      'contact: patient file, last visit today',
      '[.data.patient_id, .data.last_visit_on] | join(",")',
      `${ashaPatient},${today}`,
    );
    await flow.expect(
      200,
      'the doctor handles Asha now (CT11)',
      'GET',
      `/app/contacts/${asha}/members`,
    );
    flow.expectValue(
      "the doctor among Asha's members",
      `[.data[].membership_id] | index("${doctor}") != null`,
      true,
    );
    const stage = `/app/appointments/${ashaAppointment}/stage`;
    await flow.expect(409, 'stage back to waiting', 'POST', stage, { visit_stage: 'waiting' });
    flow.expectValue('same stage: reason', '.error.reason', 'transition_not_allowed');
    await flow.expect(400, 'stage done (not a stage)', 'POST', stage, { visit_stage: 'done' });
    await flow.expect(200, 'with the doctor', 'POST', stage, { visit_stage: 'with_doctor' });
    flow.expectValue(
      'stage moved',
      '[.data.visit_stage, (.data.visit_stage_changed_at != null)] | map(tostring) | join(",")',
      'with_doctor,true',
    );
    await flow.expect(409, 'stage back (forward only, A11)', 'POST', stage, {
      visit_stage: 'waiting',
    });
    await flow.expect(200, 'skip to checkout', 'POST', stage, { visit_stage: 'checkout' });
    await flow.expect(
      409,
      'resume a running visit',
      'POST',
      `/app/appointments/${ashaAppointment}/resume`,
    );
    await flow.expect(200, 'pause', 'POST', `/app/appointments/${ashaAppointment}/pause`);
    flow.expectValue('paused', '.data.visit_paused_at != null', true);
    await flow.expect(409, 'pause twice', 'POST', `/app/appointments/${ashaAppointment}/pause`);
    await flow.expect(200, 'resume', 'POST', `/app/appointments/${ashaAppointment}/resume`);
    flow.expectValue('resumed', '.data.visit_paused_at', 'null');
    await flow.expect(
      409,
      'undo the check-in after the visit moved on',
      'POST',
      `/app/appointments/${ashaAppointment}/undo-check-in`,
    );
    flow.expectValue('visit started: reason', '.error.reason', 'visit_started');
    await flow.expect(
      409,
      'move a checked-in booking',
      'PATCH',
      `/app/appointments/${ashaAppointment}`,
      { appointment_date: laterDay },
    );
    await flow.expect(
      200,
      'complete the visit',
      'POST',
      `/app/appointments/${ashaAppointment}/complete`,
    );
    flow.expectValue(
      'completed, off the floor',
      '[.data.status, (.data.completed_at != null), (.data.visit_stage | tostring)] | map(tostring) | join(",")',
      'completed,true,null',
    );
    await flow.expect(
      409,
      'complete twice',
      'POST',
      `/app/appointments/${ashaAppointment}/complete`,
    );
    await flow.expect(409, 'stage on a completed booking', 'POST', stage, {
      visit_stage: 'pharmacy',
    });
    await flow.expect(
      200,
      "undo the walk-in's check-in (still waiting)",
      'POST',
      `/app/appointments/${belaWalkIn}/undo-check-in`,
    );
    flow.expectValue(
      'undone: confirmed, off the floor',
      '[.data.status, (.data.checked_in_at | tostring), (.data.visit_stage | tostring)] | join(",")',
      'confirmed,null,null',
    );
    await flow.expect(
      200,
      'Bela keeps the file the walk-in opened',
      'GET',
      `/app/contacts/${bela}`,
    );
    flow.expectValue("Bela's file stays", '.data.patient_id != null', true);
    await dueToday(chiragAppointment);
    await flow.expect(
      200,
      'no-show after the start',
      'POST',
      `/app/appointments/${chiragAppointment}/no-show`,
    );
    flow.expectValue('no_show', '.data.status', 'no_show');
  });

  it('copy (route 17)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      "copy Asha's visit to another day (A7)",
      'POST',
      `/app/appointments/${ashaAppointment}/copy`,
      { appointment_date: laterDay, start_time: '10:00' },
    );
    copy = flow.last('.data.id');
    flow.expectValue(
      'the copy: scheduled, same contact and service, linked',
      '[.data.status, .data.contact_id, .data.service_label, .data.copied_from_appointment_id] | join(",")',
      `scheduled,${asha},Hydrafacial ${lastName},${ashaAppointment}`,
    );
    await flow.expect(
      409,
      "copy into the same slot (the create's checks)",
      'POST',
      `/app/appointments/${ashaAppointment}/copy`,
      { appointment_date: laterDay, start_time: '10:15' },
    );
    flow.expectValue('copy clash: reason', '.error.reason', 'slot_taken');
    await flow.expect(
      409,
      'copy into the past',
      'POST',
      `/app/appointments/${ashaAppointment}/copy`,
      { appointment_date: yesterday, start_time: '10:00' },
    );
    await flow.expect(
      400,
      'copy without a start',
      'POST',
      `/app/appointments/${ashaAppointment}/copy`,
      { appointment_date: laterDay },
    );
    await flow.expect(
      404,
      'copy an unknown booking',
      'POST',
      `/app/appointments/${NOWHERE_APPOINTMENT}/copy`,
      { appointment_date: laterDay, start_time: '10:00' },
    );
    await flow.expect(200, "Asha's next visit is the copy", 'GET', `/app/contacts/${asha}/preview`);
    flow.expectValue(
      'preview: next and last appointment, the file',
      '[.data.next_appointment.id, .data.last_appointment.id, .data.patient.id] | join(",")',
      `${copy},${ashaAppointment},${ashaPatient}`,
    );
  });

  it('delete and restore (routes 8, 9)', async () => {
    flow.as('owner');
    await flow.expect(400, 'delete without a reason', 'DELETE', `/app/appointments/${copy}`);
    await flow.expect(
      204,
      'delete the copy',
      'DELETE',
      `/app/appointments/${copy}?reason=duplicate`,
    );
    await flow.expect(404, 'the deleted booking is gone', 'GET', `/app/appointments/${copy}`);
    await flow.expect(
      200,
      'its slot is free',
      'POST',
      '/app/appointments',
      booking(bela, laterDay, '10:00'),
    );
    const other = flow.last('.data.id');
    await flow.expect(
      409,
      'restore over the new booking',
      'POST',
      `/app/appointments/${copy}/restore`,
    );
    flow.expectValue('restore clash: reason', '.error.reason', 'slot_taken');
    await flow.expect(
      204,
      'delete the new one',
      'DELETE',
      `/app/appointments/${other}?reason=mistake`,
    );
    await flow.expect(200, 'restore the copy', 'POST', `/app/appointments/${copy}/restore`);
    await flow.expect(409, 'restore a live booking', 'POST', `/app/appointments/${copy}/restore`);
    flow.expectValue('live: reason', '.error.reason', 'record_not_deleted');
    await flow.expect(
      409,
      'Bela cannot be removed while booked (CT7)',
      'DELETE',
      `/app/contacts/${bela}?reason=mistake`,
    );
    flow.expectValue('in use: reason', '.error.reason', 'contact_in_use');
  });

  it('slots and daily counts (routes 3, 4)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'slots for the doctor',
      'GET',
      `/app/appointments/slots?branch_id=${vesu}&appointment_date=${laterDay}&duration_minutes=30&doctor_membership_id=${doctor}`,
    );
    flow.expectValue(
      "open; the copy's 10:00 is busy; within the doctor's hours",
      '[.data.is_open, ([.data.slots[].start_time] | index("10:00") == null), ([.data.slots[].start_time] | index("10:30") != null), (.data.slots[-1].end_time <= "19:00")] | map(tostring) | join(",")',
      'true,true,true,true',
    );
    await flow.expect(
      200,
      'slots on a Sunday',
      'GET',
      `/app/appointments/slots?branch_id=${vesu}&appointment_date=${sunday}&duration_minutes=30`,
    );
    flow.expectValue(
      'closed_day',
      '[.data.is_open, .data.closed_reason] | map(tostring) | join(",")',
      'false,closed_day',
    );
    await flow.expect(
      200,
      'slots on the holiday',
      'GET',
      `/app/appointments/slots?branch_id=${vesu}&appointment_date=${holiday}&duration_minutes=30`,
    );
    flow.expectValue(
      'holiday with its label',
      '[.data.closed_reason, .data.closed_label] | join(",")',
      `holiday,Festival ${lastName}`,
    );
    await flow.expect(
      200,
      'slots in the past',
      'GET',
      `/app/appointments/slots?branch_id=${vesu}&appointment_date=${yesterday}&duration_minutes=30`,
    );
    flow.expectValue('past', '.data.closed_reason', 'past');
    await flow.expect(
      400,
      'slots without a length',
      'GET',
      `/app/appointments/slots?branch_id=${vesu}&appointment_date=${laterDay}`,
    );
    await flow.expect(
      200,
      'daily counts',
      'GET',
      `/app/appointments/daily-counts?date_from=${day}&date_to=${laterDay}&branch_ids=${vesu}`,
    );
    flow.expectValue(
      'counts: the days, every status',
      '[((.data | length) >= 2), (.data[0].by_status | keys | length == 6)] | map(tostring) | join(",")',
      'true,true',
    );
    await flow.expect(
      400,
      'counts: to before from',
      'GET',
      `/app/appointments/daily-counts?date_from=${laterDay}&date_to=${day}`,
    );
    flow.expectValue('counts range: field', FIELDS, 'date_to');
  });

  it('export and gates', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      "export this run's appointments",
      'GET',
      `/app/appointments/exports?q=${lastName}`,
    );
    flow.expectValue(
      'export file',
      '(.data.file_name | startswith("appointments-")) and (.data.row_count >= 5)',
      true,
    );
    flow.as('doctor');
    await flow.expect(
      200,
      'doctor exports (appointment:export, A9)',
      'GET',
      `/app/appointments/exports?q=${lastName}`,
    );
    flow.as('front_desk');
    await flow.expect(403, 'front desk: export', 'GET', `/app/appointments/exports?q=${lastName}`);
    await flow.expect(
      403,
      'front desk: delete',
      'DELETE',
      `/app/appointments/${copy}?reason=mistake`,
    );
    await flow.expect(
      400,
      'front desk: book at Adajan (not their branch)',
      'POST',
      '/app/appointments',
      booking(bela, laterDay, '16:00', { branch_id: adajan }),
    );
    flow.expectValue('another branch: field', FIELDS, 'branch_id');
    await flow.expect(200, 'front desk: list', 'GET', `/app/appointments?q=${lastName}`);
    flow.as('therapist');
    await flow.expect(200, 'therapist: the floor', 'GET', '/app/appointments?status=checked_in');
    flow.as('accountant');
    await flow.expect(
      403,
      'accountant: list (no appointment:read)',
      'GET',
      `/app/appointments?q=${lastName}`,
    );
    flow.as('marketing');
    await flow.expect(
      403,
      'marketing: book',
      'POST',
      '/app/appointments',
      booking(bela, laterDay, '16:00'),
    );
    await flow.expect(
      200,
      "marketing: Asha's preview without appointment:read",
      'GET',
      `/app/contacts/${asha}/preview`,
    );
    flow.expectValue(
      'no appointments shown',
      '[.data.next_appointment, .data.last_appointment] | map(tostring) | join(",")',
      'null,null',
    );
    flow.as('owner');
    await flow.expect(
      404,
      'the status route is gone (A5)',
      'POST',
      `/app/appointments/${ashaAppointment}/status`,
      { status: 'confirmed' },
    );
    await flow.expect(404, 'the visits routes are gone (A10)', 'GET', '/app/visits');
  });
});
