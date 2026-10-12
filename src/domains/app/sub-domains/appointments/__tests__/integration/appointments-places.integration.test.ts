import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Places that change under a booking (task P1, docs/reviews/launch-confidence-plan-2026-10-09.md;
 * routes-final 1.C–1.E, A2, A3, A4): a room or machine deleted while booked — the booking stays and
 * reads, nothing new can take the place, and a move must leave it — and a holiday added after the
 * day was booked: the bookings stand, the day books nothing new.
 */
describe('Appointments — places that change (A2, A4)', () => {
  const S = String(Date.now());
  const T = `p${S}`;
  const digits = `5${S.slice(-7)}`;
  const FIELDS = '[.error.errors[].field] | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let contact = '';
  let workDays: string[] = [];

  /** A booking body at Vesu with the doctor on `date` at `start`. */
  const booking = (date: string, start: string, extra: Record<string, unknown> = {}) => ({
    contact_id: contact,
    branch_id: vesu,
    doctor_membership_id: fixture.members.doctor.membershipPublicId,
    appointment_date: date,
    start_time: start,
    service_label: 'Consultation',
    ...extra,
  });

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
    vesu = fixture.branches.vesu;
    const timeZone = fixture.organization.timezone;
    for (let offset = 3; workDays.length < 2 && offset < 14; offset += 1) {
      const at = new Date(Date.now() + offset * 86_400_000);
      if (new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at) !== 'Sun') {
        workDays = [...workDays, new Intl.DateTimeFormat('en-CA', { timeZone }).format(at)];
      }
    }
    await flow.expect(200, 'a contact', 'POST', '/app/contacts', {
      first_name: 'Nita',
      last_name: T,
      phones: [{ phone: `+91${digits}01`, is_primary: true }],
    });
    contact = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['rooms', 'branch_room_id'],
    ['machines', 'branch_machine_id'],
  ])(
    'a booked %s deleted: the booking stays, the place is closed to new and moved bookings',
    async (kind, field) => {
      const [day = ''] = workDays;
      const start = kind === 'rooms' ? '10:00' : '15:00';
      await flow.expect(200, `a ${kind} entry`, 'POST', `/app/branches/${vesu}/${kind}`, {
        name: `${kind} ${T}`,
      });
      const place = flow.last('.data.id');
      await flow.expect(
        200,
        'booked with it',
        'POST',
        '/app/appointments',
        booking(day, start, { [field]: place }),
      );
      const booked = flow.last('.data.id');
      await flow.expect(
        204,
        'delete the place',
        'DELETE',
        `/app/branches/${vesu}/${kind}/${place}?reason=not_needed`,
      );

      await flow.expect(200, 'the booking still reads', 'GET', `/app/appointments/${booked}`);
      flow.expectValue('still booked', '.data.status', 'scheduled');
      await flow.expect(
        400,
        'a new booking cannot take it',
        'POST',
        '/app/appointments',
        booking(day, '11:30', { [field]: place }),
      );
      flow.expectValue('the place: field', FIELDS, field);
      await flow.expect(400, 'a move that keeps it', 'PATCH', `/app/appointments/${booked}`, {
        start_time: kind === 'rooms' ? '10:30' : '15:30',
      });
      flow.expectValue('move: field', FIELDS, field);
      await flow.expect(200, 'a move that leaves it', 'PATCH', `/app/appointments/${booked}`, {
        start_time: kind === 'rooms' ? '10:30' : '15:30',
        [field]: null,
      });
      await flow.expect(
        200,
        'restore the place',
        'POST',
        `/app/branches/${vesu}/${kind}/${place}/restore`,
      );
      await flow.expect(
        200,
        'and it books again',
        'POST',
        '/app/appointments',
        booking(day, kind === 'rooms' ? '12:00' : '16:00', { [field]: place }),
      );
    },
  );

  it('a holiday added after the day was booked: the bookings stand, the day books nothing new', async () => {
    const [, day = ''] = workDays;
    await flow.expect(200, 'booked first', 'POST', '/app/appointments', booking(day, '11:00'));
    const booked = flow.last('.data.id');
    await flow.expect(200, 'then the day is a holiday', 'POST', `/app/branches/${vesu}/holidays`, {
      holiday_date: day,
      label: `Festival ${T}`,
    });
    await flow.expect(200, 'the booking stands', 'GET', `/app/appointments/${booked}`);
    flow.expectValue('still booked', '.data.status', 'scheduled');
    await flow.expect(
      409,
      'nothing new that day',
      'POST',
      '/app/appointments',
      booking(day, '12:00'),
    );
    flow.expectValue('closed: why', '.error.reason', 'slot_closed');
    await flow.expect(
      200,
      "the day's slots",
      'GET',
      `/app/appointments/slots?branch_id=${vesu}&appointment_date=${day}&duration_minutes=30`,
    );
    flow.expectValue(
      'closed as a holiday, with no slots',
      '[.data.is_open, .data.closed_reason, .data.closed_label, (.data.slots | length)] | map(tostring) | join(",")',
      `false,holiday,Festival ${T},0`,
    );
  });
});
